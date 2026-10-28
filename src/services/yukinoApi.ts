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
import { getYukinoKey } from './keys';

export class ApiUnavailableError extends Error {
  constructor(message = 'API_UNAVAILABLE') {
    super(message);
    this.name = 'ApiUnavailableError';
  }
}

const PROXY_ENDPOINT = '/api/yukino/v1/chat/completions';
const DIRECT_ENDPOINT = 'https://api.yukino.my/v1/chat/completions';
const STATUS_ENDPOINT = '/api/ai/status';
const MODEL = 'yukino-free';

/**
 * Есть ли рядом наш Node-сервер (Express-прокси и серверный Gemini).
 *
 * На GitHub Pages / любом статическом хостинге backend отсутствует, и тогда
 * браузер обращается к Yukino напрямую, своим ключом из localStorage.
 * Один раз проверяем и запоминаем.
 */
type Backend = 'unknown' | 'available' | 'absent';
let backendCache: Backend = 'unknown';
let backendProbe: Promise<Backend> | null = null;
let serverGeminiEnabled = false;

async function detectBackend(): Promise<Backend> {
  if (backendCache !== 'unknown') return backendCache;
  if (backendProbe) return backendProbe;

  backendProbe = (async (): Promise<Backend> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(STATUS_ENDPOINT, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      serverGeminiEnabled = !!data?.gemini;
      backendCache = 'available';
    } catch {
      clearTimeout(timer);
      backendCache = 'absent';
      serverGeminiEnabled = false;
    } finally {
      backendProbe = null;
    }
    return backendCache;
  })();

  return backendProbe;
}

/** Для UI и тестов: куда сейчас ходят запросы. */
export function getTransportInfo(): { backend: Backend; direct: boolean } {
  return { backend: backendCache, direct: backendCache === 'absent' };
}

/**
 * Ключ берётся из localStorage — его вставляет пользователь в лобби.
 * В коде и в репозитории ключа нет.
 */
export function hasUserYukinoKey(): boolean {
  return getYukinoKey().length > 0;
}

interface ApiCallResult {
  content: string;
  rawJson: string;
  provider: 'yukino' | 'gemini';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Concurrency limiter: max 2 simultaneous calls
 */
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

/**
 * Server-side Gemini API call
 */
async function callServerGemini(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.85
): Promise<ApiCallResult | null> {
  // На статическом хостинге серверного Gemini нет — не тратим время на запрос.
  if ((await detectBackend()) === 'absent' || !serverGeminiEnabled) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, userPrompt, temperature }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (data?.text) {
      return {
        content: data.text,
        rawJson: `[Server Gemini 3.8 Flash]:\n${data.text}`,
        provider: 'gemini',
      };
    }
  } catch (err: any) {
    clearTimeout(timer);
    console.warn('Server Gemini inference warning:', err?.message || err);
  }
  return null;
}

/**
 * Один запрос к Yukino. Сначала идём через собственный сервер (он просто
 * пробрасывает ключ из заголовка x-yukino-key, ничего не сохраняя), а если
 * бэкенда нет (статический хостинг) — напрямую в API Yukino.
 */
async function callYukino(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  useDirect: boolean
): Promise<{ result: ApiCallResult | null; error: string }> {
  const key = getYukinoKey();
  if (!key) return { result: null, error: 'Ключ Yukino не задан' };

  const endpoint = useDirect ? DIRECT_ENDPOINT : PROXY_ENDPOINT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: useDirect
        ? {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          }
        : {
            'Content-Type': 'application/json',
            'x-yukino-key': key,
          },
      body: JSON.stringify({
        model: MODEL,
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

    // Провайдер вернул HTML-заглушку Cloudflare вместо JSON.
    if (rawText.trim().startsWith('<!doctype') || rawText.trim().startsWith('<html')) {
      return { result: null, error: 'Upstream HTML error (провайдер недоступен)' };
    }

    if (!res.ok) {
      let detail = rawText.slice(0, 160);
      try {
        const parsedError = JSON.parse(rawText);
        detail = parsedError?.error?.message || parsedError?.error || detail;
        if (typeof detail !== 'string') detail = JSON.stringify(detail);
      } catch {}
      if (res.status === 401 || res.status === 403) {
        return { result: null, error: `Ключ Yukino отклонён (HTTP ${res.status}). Проверьте ключ.` };
      }
      return { result: null, error: `HTTP ${res.status}: ${detail}` };
    }

    let data: any = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      if (rawText.includes('{')) {
        return { result: { content: rawText, rawJson: rawText, provider: 'yukino' }, error: '' };
      }
      return { result: null, error: 'Invalid JSON response' };
    }

    const msg = data?.choices?.[0]?.message;
    const content = msg ? msg.content || msg.reasoning_content || '' : '';
    if (content && String(content).trim()) {
      return {
        result: {
          content: String(content).trim(),
          rawJson: JSON.stringify(data, null, 2),
          provider: 'yukino',
        },
        error: '',
      };
    }
    return { result: null, error: 'Пустой ответ модели' };
  } catch (err: any) {
    clearTimeout(timer);
    return { result: null, error: err?.message || 'Network error' };
  }
}

/**
 * Запрос к модели с повторами и запасным серверным Gemini.
 * Если ключ Yukino не введён — сразу идём в Gemini (если он настроен на сервере),
 * и только потом честно останавливаем партию.
 */
async function callAiWithRetries(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.85
): Promise<ApiCallResult> {
  await acquireSlot();

  const retryDelays = [0, 1500, 3000];
  let lastError = '';

  try {
    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
      if (retryDelays[attempt] > 0) {
        const jitter = Math.floor(Math.random() * 500);
        await sleep(retryDelays[attempt] + jitter);
      }

      // Если рядом есть наш сервер — идём через прокси, иначе напрямую в Yukino.
      const useDirect = (await detectBackend()) === 'absent';
      const { result, error } = await callYukino(
        systemPrompt,
        userPrompt,
        temperature,
        useDirect
      );
      if (result) return result;
      if (error) lastError = error;

      const geminiRes = await callServerGemini(systemPrompt, userPrompt, temperature);
      if (geminiRes && geminiRes.content) return geminiRes;

      if (!getYukinoKey()) break; // без ключа повторять бессмысленно
    }
  } finally {
    releaseSlot();
  }

  throw new ApiUnavailableError(
    lastError || 'Ключ Yukino не задан — вставьте ключ в лобби и нажмите «Повторить ход»'
  );
}

/**
 * Request Day Speech with strict ID-based deduction and mind-leak protection
 */
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

  let finalSpeech = '';
  let finalThought = '';
  let lastRaw = '';

  // Max 2 generation attempts to ensure speech is not empty (no leaks!)
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callAiWithRetries(systemPrompt, userPrompt);
    lastRaw = res.rawJson;
    const extracted = extractSpeechAndThought(res.content);

    if (extracted.speech && extracted.speech.length >= 8) {
      finalSpeech = extracted.speech;
      finalThought = extracted.thought;
      break;
    }
  }

  // If still empty, raise ApiUnavailableError rather than printing fake cringe text
  if (!finalSpeech) {
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

/**
 * Request Day Vote strictly resolved by target ID
 */
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

  const { systemPrompt, userPrompt } = buildPlayerTurnContext(
    actor,
    allPlayers,
    dayNumber,
    'day_voting',
    publicChatMessages,
    actor.role === 'sheriff' ? sheriffHistory : [],
    gameChronicle,
    2,
    pressureText,
    votesHistory
  );

  const res = await callAiWithRetries(systemPrompt, userPrompt);
  const parsed = extractCleanJson(res.content);

  let chosenId = '';
  let reason = '';
  let thought = '';

  if (parsed && typeof parsed === 'object') {
    thought = String(parsed.analysis || '').trim();
    reason = String(parsed.why || '').trim();

    const rawTargetId = String(parsed.targetId || parsed.vote || parsed.target || '').trim();
    // 1. Strict ID match
    const byId = candidates.find((c) => c.id === rawTargetId);
    if (byId) {
      chosenId = byId.id;
    } else {
      // 2. Strict Name match
      const byName = candidates.find(
        (c) => c.name.toLowerCase() === rawTargetId.toLowerCase()
      );
      if (byName) {
        chosenId = byName.id;
      }
    }
  }

  // 3. Fallback to candidate mentioned in content
  if (!chosenId && res.content) {
    for (const c of candidates) {
      if (res.content.includes(c.id) || res.content.toLowerCase().includes(c.name.toLowerCase())) {
        chosenId = c.id;
        break;
      }
    }
  }

  // If model completely failed to pick a valid candidate, pick the first candidate
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

  return {
    targetId: chosenPlayer.id,
    targetName: chosenPlayer.name,
    reason,
    thought,
  };
}

/**
 * Request Mafia Night Target strictly resolved by target ID
 */
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

  const res = await callAiWithRetries(systemPrompt, userPrompt);
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
      if (byName) {
        chosenId = byName.id;
      }
    }
  }

  if (!chosenId) {
    chosenId = victims[0].id;
  }

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

/**
 * Request Doctor Night Protect Target strictly resolved by target ID
 */
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

  const res = await callAiWithRetries(systemPrompt, userPrompt);
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
      if (byName) {
        chosenId = byName.id;
      }
    }
  }

  if (!chosenId) {
    chosenId = living[0].id;
  }

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

/**
 * Request Sheriff Night Check strictly resolved by target ID from unchecked candidates
 */
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

  const res = await callAiWithRetries(systemPrompt, userPrompt);
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
      if (byName) {
        chosenId = byName.id;
      }
    }
  }

  if (!chosenId) {
    chosenId = candidates[0].id;
  }

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
 * Request Last Words
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

  const res = await callAiWithRetries(systemPrompt, userPrompt);
  const extracted = extractSpeechAndThought(res.content);

  const speech = extracted.speech || 'Вы совершили роковую ошибку. Город погубит сам себя, когда мафия добьет вас ночью!';
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
