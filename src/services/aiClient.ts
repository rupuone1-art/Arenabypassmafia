/**
 * aiClient — единая точка вызова «интеллекта» ботов.
 *
 * Порядок провайдеров:
 *   1. Gemini (серверный маршрут /api/gemini/generate, ключ живёт только на сервере)
 *   2. Yukino  (серверный прокси /api/yukino/v1/chat/completions, ключ только на сервере)
 *   3. Локальный движок (src/game/localBotAI.ts) — работает без сети и без ключей.
 *
 * Благодаря шагу 3 партия никогда не «встаёт» из-за отсутствия API-ключа:
 * игра просто становится чуть более шаблонной, но остаётся полностью проходимой.
 */

import {
  Player,
  DebugLogEntry,
  buildPlayerTurnContext,
  SheriffCheckRecord,
  ChatMessage,
  VoteRecord,
  extractCleanJson,
  extractSpeechAndThought,
} from '../game/mafiaEngine';
import {
  LocalContext,
  localDaySpeech,
  localDayVote,
  localDoctorTarget,
  localLastWords,
  localMafiaTarget,
  localSheriffTarget,
} from '../game/localBotAI';

export class ApiUnavailableError extends Error {
  constructor(message = 'API_UNAVAILABLE') {
    super(message);
    this.name = 'ApiUnavailableError';
  }
}

export type AiProvider = 'gemini' | 'yukino' | 'local';

export interface AiStatus {
  /** какой провайдер фактически будет использован */
  provider: AiProvider;
  /** настроен ли ключ Gemini на сервере */
  gemini: boolean;
  /** настроен ли ключ Yukino на сервере */
  yukino: boolean;
  /** 'server' — ответ от /api/ai/status, 'fallback' — статус получить не удалось */
  source: 'server' | 'fallback';
}

const GEMINI_ENDPOINT = '/api/gemini/generate';
const YUKINO_PROXY = '/api/yukino/v1/chat/completions';
const STATUS_ENDPOINT = '/api/ai/status';

/** Принудительный локальный режим: ?ai=local или VITE_AI_PROVIDER=local */
function localForced(): boolean {
  const v = (import.meta as any)?.env?.VITE_AI_PROVIDER;
  if (typeof v === 'string' && v.toLowerCase() === 'local') return true;
  if (typeof window === 'undefined') return false;
  try {
    const param = new URLSearchParams(window.location.search).get('ai');
    return param === 'local';
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Статус провайдеров                                                  */
/* ------------------------------------------------------------------ */

let statusCache: AiStatus | null = null;
let statusInFlight: Promise<AiStatus> | null = null;

export async function getAiStatus(force = false): Promise<AiStatus> {
  if (localForced()) {
    return { provider: 'local', gemini: false, yukino: false, source: 'fallback' };
  }
  if (statusCache && !force) return statusCache;
  if (statusInFlight) return statusInFlight;

  statusInFlight = (async (): Promise<AiStatus> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(STATUS_ENDPOINT, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const status: AiStatus = {
        provider: (data?.provider as AiProvider) || 'local',
        gemini: !!data?.gemini,
        yukino: !!data?.yukino,
        source: 'server',
      };
      statusCache = status;
      return status;
    } catch {
      clearTimeout(timer);
      // Серверный статус недоступен (например, статический хостинг без backend):
      // сразу честно уходим в локальный движок, не тратя время на таймауты.
      const status: AiStatus = {
        provider: 'local',
        gemini: false,
        yukino: false,
        source: 'fallback',
      };
      statusCache = status;
      return status;
    } finally {
      statusInFlight = null;
    }
  })();

  return statusInFlight;
}

/* ------------------------------------------------------------------ */
/* Ограничитель параллельных вызовов                                   */
/* ------------------------------------------------------------------ */

const MAX_CONCURRENT = 2;
let activeCalls = 0;
const waitQueue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeCalls >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waitQueue.push(resolve));
  } else {
    activeCalls++;
  }
}

function releaseSlot(): void {
  const next = waitQueue.shift();
  if (next) {
    next();
  } else {
    activeCalls--;
  }
}

/* ------------------------------------------------------------------ */
/* Отдельные провайдеры                                                */
/* ------------------------------------------------------------------ */

interface ApiCallResult {
  content: string;
  rawJson: string;
  provider: AiProvider;
}

async function callServerGemini(
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<ApiCallResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, userPrompt, temperature }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = await res.json();
    if (data?.text && String(data.text).trim()) {
      return {
        content: String(data.text),
        rawJson: `[Gemini / server]\n${data.text}`,
        provider: 'gemini',
      };
    }
  } catch {
    clearTimeout(timer);
  }
  return null;
}

async function callYukino(
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<ApiCallResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(YUKINO_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: 750,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const rawText = await res.text();
    if (rawText.trim().startsWith('<!doctype') || rawText.trim().startsWith('<html')) {
      return null;
    }
    if (!res.ok) return null;

    let data: any = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      return rawText.includes('{')
        ? { content: rawText, rawJson: rawText, provider: 'yukino' }
        : null;
    }

    const msg = data?.choices?.[0]?.message;
    const content = msg ? msg.content || msg.reasoning_content || '' : '';
    if (content && String(content).trim()) {
      return {
        content: String(content).trim(),
        rawJson: JSON.stringify(data, null, 2),
        provider: 'yukino',
      };
    }
  } catch {
    clearTimeout(timer);
  }
  return null;
}

/**
 * Запрашивает ответ у внешних провайдеров, а при полном отказе —
 * у локального движка. Никогда не бросает ApiUnavailableError,
 * потому что локальный движок доступен всегда.
 */
async function callAiWithRetries(
  systemPrompt: string,
  userPrompt: string,
  localFallback: () => unknown,
  temperature = 0.85,
  label = 'turn'
): Promise<ApiCallResult> {
  const status = await getAiStatus();

  if (status.provider !== 'local') {
    await acquireSlot();
    try {
      const retryDelays = [0, 900, 1800];
      for (let attempt = 0; attempt < retryDelays.length; attempt++) {
        if (retryDelays[attempt] > 0) {
          await sleep(retryDelays[attempt] + Math.floor(Math.random() * 300));
        }

        if (status.gemini) {
          const gemini = await callServerGemini(systemPrompt, userPrompt, temperature);
          if (gemini) return gemini;
        }
        if (status.yukino) {
          const yukino = await callYukino(systemPrompt, userPrompt, temperature);
          if (yukino) return yukino;
        }

        // Ни один провайдер не настроен — нет смысла повторять.
        if (!status.gemini && !status.yukino) break;
      }
    } finally {
      releaseSlot();
    }
  }

  // Локальный движок: детерминированная эвристика, всегда доступна.
  const local = localFallback();
  const json = JSON.stringify(local);
  return {
    content: json,
    rawJson: `[local-engine:${label}]\n${JSON.stringify(local, null, 2)}`,
    provider: 'local',
  };
}

/* ------------------------------------------------------------------ */
/* Дневные действия                                                    */
/* ------------------------------------------------------------------ */

export async function requestDaySpeech(
  actor: Player,
  allPlayers: Player[],
  dayNumber: number,
  publicChatMessages: ChatMessage[],
  sheriffHistory: SheriffCheckRecord[],
  gameChronicle: string[],
  sessionId: string,
  onLogEntry: (entry: DebugLogEntry) => void,
  roundNumber = 1,
  pressureText?: string,
  votesHistory: VoteRecord[] = []
): Promise<{ speech: string; thought: string }> {
  const actorSheriffHistory = actor.role === 'sheriff' ? sheriffHistory : [];

  const { systemPrompt, userPrompt } = buildPlayerTurnContext(
    actor,
    allPlayers,
    dayNumber,
    'day_discussion',
    publicChatMessages,
    actorSheriffHistory,
    gameChronicle,
    roundNumber,
    pressureText,
    votesHistory
  );

  const localCtx: LocalContext = {
    actor,
    allPlayers,
    dayNumber,
    chat: publicChatMessages,
    votesHistory,
    chronicle: gameChronicle,
    sheriffHistory: actorSheriffHistory,
    roundNumber,
  };

  let finalSpeech = '';
  let finalThought = '';
  let lastRaw = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callAiWithRetries(
      systemPrompt,
      userPrompt,
      () => localDaySpeech(localCtx),
      0.85,
      'day_speech'
    );
    lastRaw = res.rawJson;
    const extracted = extractSpeechAndThought(res.content);

    if (extracted.speech && extracted.speech.length >= 8) {
      finalSpeech = extracted.speech;
      finalThought = extracted.thought;
      break;
    }
  }

  if (!finalSpeech) {
    // Не подменяем игру «фальшивыми» репликами: честно сообщаем о сбое.
    throw new ApiUnavailableError('AI returned empty speech for day debate');
  }

  onLogEntry({
    id: `log-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    sessionId,
    dayNumber,
    phase: `Дебаты (День ${dayNumber}, Круг ${roundNumber})`,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    actorPersonality: actor.personality,
    promptSystem: systemPrompt,
    promptUser: userPrompt,
    rawResponse: lastRaw,
    parsedResult: `[Речь]: "${finalSpeech}"\n[Мысли]: "${finalThought || 'Нет'}"`,
  });

  return { speech: finalSpeech, thought: finalThought };
}

export async function requestDayVote(
  actor: Player,
  allPlayers: Player[],
  dayNumber: number,
  publicChatMessages: ChatMessage[],
  sheriffHistory: SheriffCheckRecord[],
  gameChronicle: string[],
  sessionId: string,
  onLogEntry: (entry: DebugLogEntry) => void,
  pressureText?: string,
  votesHistory: VoteRecord[] = []
): Promise<{ targetId: string; targetName: string; reason: string; thought: string }> {
  const candidates = allPlayers.filter((p) => p.isAlive && p.id !== actor.id);
  if (candidates.length === 0) {
    return { targetId: '', targetName: '', reason: '', thought: '' };
  }

  const actorSheriffHistory = actor.role === 'sheriff' ? sheriffHistory : [];

  const { systemPrompt, userPrompt } = buildPlayerTurnContext(
    actor,
    allPlayers,
    dayNumber,
    'day_voting',
    publicChatMessages,
    actorSheriffHistory,
    gameChronicle,
    2,
    pressureText,
    votesHistory
  );

  const localCtx: LocalContext = {
    actor,
    allPlayers,
    dayNumber,
    chat: publicChatMessages,
    votesHistory,
    chronicle: gameChronicle,
    sheriffHistory: actorSheriffHistory,
  };

  const res = await callAiWithRetries(
    systemPrompt,
    userPrompt,
    () => localDayVote(localCtx),
    0.7,
    'day_vote'
  );
  const parsed = extractCleanJson(res.content);

  let chosenId = '';
  let reason = '';
  let thought = '';

  if (parsed && typeof parsed === 'object') {
    thought = String(parsed.analysis || '').trim();
    reason = String(parsed.why || '').trim();

    const rawTargetId = String(parsed.targetId || parsed.vote || parsed.target || '').trim();
    const byId = candidates.find((c) => c.id === rawTargetId);
    if (byId) {
      chosenId = byId.id;
    } else {
      const byName = candidates.find(
        (c) => c.name.toLowerCase() === rawTargetId.toLowerCase()
      );
      if (byName) chosenId = byName.id;
    }
  }

  // Модель назвала цель текстом — ищем упоминание ID или имени.
  if (!chosenId && res.content) {
    for (const c of candidates) {
      if (
        res.content.includes(c.id) ||
        res.content.toLowerCase().includes(c.name.toLowerCase())
      ) {
        chosenId = c.id;
        break;
      }
    }
  }

  if (!chosenId) {
    chosenId = candidates[0].id;
  }

  const chosenPlayer = candidates.find((c) => c.id === chosenId) || candidates[0];
  if (!reason) reason = 'Подозрительное поведение на дебатах';

  onLogEntry({
    id: `log-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    sessionId,
    dayNumber,
    phase: `Голосование (День ${dayNumber})`,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    actorPersonality: actor.personality,
    promptSystem: systemPrompt,
    promptUser: userPrompt,
    rawResponse: res.rawJson,
    parsedResult: `Голос против: ${chosenPlayer.name} [ID: ${chosenPlayer.id}]. Причина: ${reason}\n[Мысли]: ${thought}`,
  });

  return { targetId: chosenPlayer.id, targetName: chosenPlayer.name, reason, thought };
}

/* ------------------------------------------------------------------ */
/* Ночные действия                                                     */
/* ------------------------------------------------------------------ */

export async function requestMafiaNightTarget(
  actor: Player,
  allPlayers: Player[],
  dayNumber: number,
  sessionId: string,
  onLogEntry: (entry: DebugLogEntry) => void,
  pressureText?: string,
  votesHistory: VoteRecord[] = []
): Promise<{ targetId: string; targetName: string; thought: string }> {
  const victims = allPlayers.filter((p) => p.isAlive && p.role !== 'mafia');
  if (victims.length === 0) return { targetId: '', targetName: '', thought: '' };

  const { systemPrompt, userPrompt } = buildPlayerTurnContext(
    actor,
    allPlayers,
    dayNumber,
    'night_mafia',
    [],
    [],
    [],
    1,
    pressureText,
    votesHistory
  );

  const localCtx: LocalContext = { actor, allPlayers, dayNumber, votesHistory };

  const res = await callAiWithRetries(
    systemPrompt,
    userPrompt,
    () => localMafiaTarget(localCtx),
    0.75,
    'night_mafia'
  );
  const parsed = extractCleanJson(res.content);

  let chosenId = '';
  let thought = '';

  if (parsed && typeof parsed === 'object') {
    thought = String(parsed.analysis || parsed.why || '').trim();
    const rawTargetId = String(parsed.targetId || parsed.target || '').trim();

    const byId = victims.find((v) => v.id === rawTargetId);
    if (byId) {
      chosenId = byId.id;
    } else {
      const byName = victims.find(
        (v) => v.name.toLowerCase() === rawTargetId.toLowerCase()
      );
      if (byName) chosenId = byName.id;
    }
  }

  if (!chosenId) chosenId = victims[0].id;

  const chosenVictim = victims.find((v) => v.id === chosenId) || victims[0];

  onLogEntry({
    id: `log-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    sessionId,
    dayNumber,
    phase: 'Ночь: Выбор цели Мафии',
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    actorPersonality: actor.personality,
    promptSystem: systemPrompt,
    promptUser: userPrompt,
    rawResponse: res.rawJson,
    parsedResult: `Цель мафии: ${chosenVictim.name} [ID: ${chosenVictim.id}]\n[Мысли]: ${thought}`,
  });

  return { targetId: chosenVictim.id, targetName: chosenVictim.name, thought };
}

export async function requestDoctorNightTarget(
  actor: Player,
  allPlayers: Player[],
  dayNumber: number,
  sessionId: string,
  onLogEntry: (entry: DebugLogEntry) => void,
  pressureText?: string,
  votesHistory: VoteRecord[] = []
): Promise<{ targetId: string; targetName: string; thought: string }> {
  const living = allPlayers.filter((p) => p.isAlive);
  if (living.length === 0) return { targetId: '', targetName: '', thought: '' };

  const { systemPrompt, userPrompt } = buildPlayerTurnContext(
    actor,
    allPlayers,
    dayNumber,
    'night_doctor',
    [],
    [],
    [],
    1,
    pressureText,
    votesHistory
  );

  const localCtx: LocalContext = { actor, allPlayers, dayNumber, votesHistory };

  const res = await callAiWithRetries(
    systemPrompt,
    userPrompt,
    () => localDoctorTarget(localCtx),
    0.7,
    'night_doctor'
  );
  const parsed = extractCleanJson(res.content);

  let chosenId = '';
  let thought = '';

  if (parsed && typeof parsed === 'object') {
    thought = String(parsed.analysis || parsed.why || '').trim();
    const rawTargetId = String(parsed.targetId || parsed.target || '').trim();

    const byId = living.find((p) => p.id === rawTargetId);
    if (byId) {
      chosenId = byId.id;
    } else {
      const byName = living.find(
        (p) => p.name.toLowerCase() === rawTargetId.toLowerCase()
      );
      if (byName) chosenId = byName.id;
    }
  }

  if (!chosenId) chosenId = living[0].id;

  const chosenTarget = living.find((p) => p.id === chosenId) || living[0];

  onLogEntry({
    id: `log-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    sessionId,
    dayNumber,
    phase: 'Ночь: Выбор Доктора',
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    actorPersonality: actor.personality,
    promptSystem: systemPrompt,
    promptUser: userPrompt,
    rawResponse: res.rawJson,
    parsedResult: `Лечение: ${chosenTarget.name} [ID: ${chosenTarget.id}]\n[Мысли]: ${thought}`,
  });

  return { targetId: chosenTarget.id, targetName: chosenTarget.name, thought };
}

export async function requestSheriffNightTarget(
  actor: Player,
  allPlayers: Player[],
  dayNumber: number,
  alreadyCheckedIds: Set<string>,
  sessionId: string,
  onLogEntry: (entry: DebugLogEntry) => void,
  pressureText?: string,
  votesHistory: VoteRecord[] = []
): Promise<{ targetId: string; targetName: string; thought: string }> {
  const candidates = allPlayers.filter(
    (p) => p.isAlive && p.id !== actor.id && !alreadyCheckedIds.has(p.id)
  );
  if (candidates.length === 0) return { targetId: '', targetName: '', thought: '' };

  const { systemPrompt, userPrompt } = buildPlayerTurnContext(
    actor,
    allPlayers,
    dayNumber,
    'night_sheriff',
    [],
    [],
    [],
    1,
    pressureText,
    votesHistory
  );

  const localCtx: LocalContext = { actor, allPlayers, dayNumber, votesHistory };

  const res = await callAiWithRetries(
    systemPrompt,
    userPrompt,
    () => localSheriffTarget(localCtx, alreadyCheckedIds),
    0.7,
    'night_sheriff'
  );
  const parsed = extractCleanJson(res.content);

  let chosenId = '';
  let thought = '';

  if (parsed && typeof parsed === 'object') {
    thought = String(parsed.analysis || parsed.why || '').trim();
    const rawTargetId = String(parsed.targetId || parsed.target || '').trim();

    const byId = candidates.find((c) => c.id === rawTargetId);
    if (byId) {
      chosenId = byId.id;
    } else {
      const byName = candidates.find(
        (c) => c.name.toLowerCase() === rawTargetId.toLowerCase()
      );
      if (byName) chosenId = byName.id;
    }
  }

  if (!chosenId) chosenId = candidates[0].id;

  const chosenTarget = candidates.find((c) => c.id === chosenId) || candidates[0];

  onLogEntry({
    id: `log-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    sessionId,
    dayNumber,
    phase: 'Ночь: Проверка Шерифа',
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    actorPersonality: actor.personality,
    promptSystem: systemPrompt,
    promptUser: userPrompt,
    rawResponse: res.rawJson,
    parsedResult: `Проверка: ${chosenTarget.name} [ID: ${chosenTarget.id}]\n[Мысли]: ${thought}`,
  });

  return { targetId: chosenTarget.id, targetName: chosenTarget.name, thought };
}

/**
 * Последние слова казнённого
 */
export async function requestLastWords(
  actor: Player,
  allPlayers: Player[],
  dayNumber: number,
  sessionId: string,
  onLogEntry: (entry: DebugLogEntry) => void,
  pressureText?: string
): Promise<{ speech: string; thought: string }> {
  const { systemPrompt, userPrompt } = buildPlayerTurnContext(
    actor,
    allPlayers,
    dayNumber,
    'last_words',
    [],
    [],
    [],
    2,
    pressureText
  );

  const localCtx: LocalContext = { actor, allPlayers, dayNumber };

  const res = await callAiWithRetries(
    systemPrompt,
    userPrompt,
    () => localLastWords(localCtx),
    0.9,
    'last_words'
  );
  const extracted = extractSpeechAndThought(res.content);

  const speech =
    extracted.speech ||
    'Вы совершили роковую ошибку. Город погубит сам себя, когда мафия добьет вас ночью!';
  const thought = extracted.thought || 'Город казнил невиновного.';

  onLogEntry({
    id: `log-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    sessionId,
    dayNumber,
    phase: `Казнь: Последние слова ${actor.name}`,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    actorPersonality: actor.personality,
    promptSystem: systemPrompt,
    promptUser: userPrompt,
    rawResponse: res.rawJson,
    parsedResult: `Последние слова: "${speech}"\n[Мысли]: "${thought}"`,
  });

  return { speech, thought };
}
