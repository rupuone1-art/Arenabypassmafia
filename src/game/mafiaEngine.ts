export type Role = 'mafia' | 'citizen' | 'sheriff' | 'doctor';

export interface Player {
  id: string;
  name: string;
  avatar: string;
  personality: string;
  persona?: string;
  beliefs?: string;
  style?: string;
  role: Role;
  isHuman: boolean;
  isAlive: boolean;
  diedAtDay?: number;
  deathReason?: 'night_kill' | 'voted_out';
  plan?: string;
  sus?: Record<string, number>;
}

export type GamePhase =
  | 'LOBBY'
  | 'NIGHT_START'
  | 'NIGHT_MAFIA'
  | 'NIGHT_DOCTOR'
  | 'NIGHT_SHERIFF'
  | 'DAY_ANNOUNCEMENT'
  | 'DAY_DISCUSSION'
  | 'DAY_VOTING'
  | 'DAY_EXECUTION'
  | 'GAME_OVER';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  thought?: string; // 🧠 Secret inner thought/analysis of the AI
  phase: 'day' | 'night' | 'system' | 'admin' | 'vote';
  dayNumber: number;
  timestamp: number;
  isPublic: boolean;
}

export interface AiSlotConfig {
  id: string;
  name: string;
  avatar: string;
  role: Role;
  personality: string;
  persona?: string;
  beliefs?: string;
  style?: string;
}

export interface VoteRecord {
  voterId: string;
  voterName: string;
  targetId: string;
  targetName: string;
  why?: string;
  dayNumber: number;
}

export interface SheriffCheckRecord {
  targetId: string;
  targetName: string;
  isMafia: boolean;
  nightNumber: number;
}

export interface GameSettings {
  mode: 'watch' | 'play';
  playerCount: number;
  aiPlayers: AiSlotConfig[];
  fogOfWar: boolean;
  pressure: string;
  temperature: number;
  speechDelayMs: number;
}

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  sessionId: string;
  dayNumber: number;
  phase: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  actorPersonality: string;
  promptSystem: string;
  promptUser: string;
  rawResponse: string;
  parsedResult: string;
}

export const PRESSURE_PRESETS = {
  hard: `ТЫ — ПРОФЕССИОНАЛЬНЫЙ ИГРОК В СПОРТИВНУЮ МАФИЮ ВЫСШЕЙ ЛИГИ.
Ты играешь на пределе интеллекта и дедукции. Твоя цель — победа твоей команды любой ценой.
Ты анализируешь математику стола (критические круги, количество живых, право на ошибку), связи между игроками, позицию голосований (кто за кем ставил руки), тайминги и психологию.
Пустые слова, штампы и случайные обвинения запрещены. Каждое утверждение должно опираться на факты, ночные смерти или логику голосований.`,
  para: `ТЫ — ПАРАНОИДАЛЬНЫЙ АНАЛИТИК СПОРТИВНОЙ МАФИИ.
Ты уверен, что мафия искусно скрывает следы. Ты ловишь мельчайшие несоответствия в словах и голосованиях. Твоя задача — просчитывать ходы соперников на 2 раунда вперед и не позволить мафии манипулировать голосованием.`,
  guil: `ТЫ — БЕЗЖАЛОСТНЫЙ СТРАТЕГ МАФИИ ИЛИ ГОРОДА.
Каждый раунд решает судьбу партии. Ты ищешь слабое звено в аргументах оппонентов, выстраиваешь коалиции и консолидируешь голоса. Ты не играешь пассивно — ты направляешь стол.`
};

export const CLAUDE_DEFAULT_BOTS: Omit<AiSlotConfig, 'id'>[] = [
  {
    name: 'Алиса',
    avatar: '😰',
    role: 'mafia',
    personality: 'Эмоциональный манипулятор',
    persona: 'мастер создания управляемого хаоса, маскирует расчетливость под эмоции',
    beliefs: 'лучшая защита — агрессивная дискредитация тех, кто ведет следствие',
    style: 'быстрая, убедительная, с резкими риторическими вопросами'
  },
  {
    name: 'Борис',
    avatar: '🧐',
    role: 'sheriff',
    personality: 'Холодный гроссмейстер логики',
    persona: 'опирается на математику стола, статистику голосований и факты',
    beliefs: 'мафия выдает себя в синхронных голосованиях и уклонении от прямых ответов',
    style: 'сухо, точно, с отсылками к конкретным цифрам и фактам'
  },
  {
    name: 'Вера',
    avatar: '😏',
    role: 'doctor',
    personality: 'Проницательный психолог',
    persona: 'внимательно следит за скрытыми коалициями и защищает ключевых логиков',
    beliefs: 'мафия убирает самых опасных аналитиков; спасение шерифа решает исход игры',
    style: 'спокойная, взвешенная речь, точечные глубокие вопросы'
  },
  {
    name: 'Глеб',
    avatar: '🤡',
    role: 'citizen',
    personality: 'Саркастичный провокатор',
    persona: 'вскрывает фальшь через провокационные проверки и жесткий прессинг',
    beliefs: 'тот, кто избегает споров и подстраивается под большинство — скрытый враг',
    style: 'иронично, колко, безжалостно к нестыковкам'
  },
  {
    name: 'Дина',
    avatar: '🥶',
    role: 'mafia',
    personality: 'Скрытный тактик-стратег',
    persona: 'играет в длинную дистанцию, голосует аккуратно, имитирует независимого мыслителя',
    beliefs: 'нельзя вступать в открытые союзы с напарником; нужно стравливать мирных',
    style: 'лаконично, веско, создавая видимость глубокой беспристрастности'
  },
  {
    name: 'Ян',
    avatar: '🧔',
    role: 'citizen',
    personality: 'Командир-организатор',
    persona: 'требует жесткой дисциплины голосования и четких версий',
    beliefs: 'раскол голосов мирных — гарантированная победа мафии; нужен единый фокус',
    style: 'структурированно, призывно, четко фиксируя кандидатов'
  },
  {
    name: 'Полина',
    avatar: '👩‍💻',
    role: 'citizen',
    personality: 'Системный аналитик',
    persona: 'сверяет хронологию ночей и распределение голосов',
    beliefs: 'каждое ночное убийство выгодно конкретным сидящим за столом',
    style: 'фактологично, аргументированно, с разбором связок'
  },
  {
    name: 'Максим',
    avatar: '👩‍⚕️',
    role: 'citizen',
    personality: 'Интеллектуальный следователь',
    persona: 'исследует мотивы и психологические реакции участников',
    beliefs: 'виновный всегда нервничает, когда план ломается',
    style: 'вежливо, въедливо, с тонкой аргументацией'
  }
];

export const PERSONALITY_PRESETS = [
  { id: 'logic', name: 'Холодный логик', desc: 'Математика стола, тайминги, логика голосования' },
  { id: 'nervous', name: 'Эмоциональный манипулятор', desc: 'Маскировка расчета под панику и сомнения' },
  { id: 'cunning', name: 'Хитрый стратег', desc: 'Стравливает оппонентов, плетет союзы' },
  { id: 'detective', name: 'Въедливый следователь', desc: 'Ловит на нестыковках ночей и голосов' },
  { id: 'quiet', name: 'Скрытный тактик', desc: 'Мало слов, точечные смертоносные выводы' },
  { id: 'orator', name: 'Харизматичный лидер', desc: 'Консолидирует голоса, ведет стол' },
  { id: 'paranoid', name: 'Параноидальный аналитик', desc: 'Проверяет связи между всеми игроками' },
  { id: 'aggressive', name: 'Жесткий прессинг', desc: 'Прямые обвинения, требует ответов' }
];

export const AI_NAMES = ['Виктор', 'Елена', 'Артем', 'София', 'Анна', 'Дмитрий', 'Полина', 'Максим'];
export const AVATARS = ['🕵️', '🎩', '👩‍💼', '👨‍🏫', '👩‍⚕️', '🧑‍🎨', '🧔', '👩‍💻'];

export function getPlayerGender(name: string): 'он' | 'она' {
  const femaleNames = ['алиса', 'вера', 'дина', 'елена', 'анна', 'софия', 'полина', 'ольга', 'мария', 'даша', 'наталья', 'екатерина'];
  const lower = (name || '').toLowerCase().trim();
  if (femaleNames.some((fn) => lower.includes(fn)) || lower.endsWith('а') || lower.endsWith('я')) {
    if (lower === 'илья' || lower === 'никита') return 'он';
    return 'она';
  }
  return 'он';
}

/**
 * Robust Unicode Cyrillic Name Matcher (replaces broken ASCII \b)
 */
export function isPlayerMentioned(text: string, playerName: string): boolean {
  if (!text || !playerName) return false;
  const escaped = playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=[^\\p{L}\\p{N}_]|$)`, 'iu');
  return regex.test(text);
}

export function calculateRoleCounts(playerCount: number): Record<Role, number> {
  const count = Math.max(4, Math.min(8, playerCount));
  if (count <= 4) {
    return { mafia: 1, sheriff: 1, doctor: 0, citizen: 2 };
  } else if (count === 5) {
    return { mafia: 1, sheriff: 1, doctor: 1, citizen: 2 };
  } else if (count <= 7) {
    return { mafia: 2, sheriff: 1, doctor: 1, citizen: count - 4 };
  } else {
    return { mafia: 2, sheriff: 1, doctor: 1, citizen: 4 };
  }
}

export function generateDefaultAiSlots(count: number): AiSlotConfig[] {
  const total = Math.max(4, Math.min(8, count));
  const roleCounts = calculateRoleCounts(total);

  const roleDeck: Role[] = [];
  (Object.keys(roleCounts) as Role[]).forEach((role) => {
    for (let i = 0; i < roleCounts[role]; i++) {
      roleDeck.push(role);
    }
  });

  const slots: AiSlotConfig[] = [];
  for (let i = 0; i < total; i++) {
    const template = CLAUDE_DEFAULT_BOTS[i % CLAUDE_DEFAULT_BOTS.length];
    const role = roleDeck[i] || 'citizen';
    slots.push({
      id: `ai-${i + 1}`,
      name: template.name,
      avatar: template.avatar,
      role,
      personality: template.personality,
      persona: template.persona,
      beliefs: template.beliefs,
      style: template.style,
    });
  }
  return slots;
}

export function setupPlayers(settings: GameSettings): Player[] {
  if (settings.mode === 'play') {
    const humanRole = settings.aiPlayers[0]?.role || 'citizen';
    const humanPlayer: Player = {
      id: 'human',
      name: 'Ты',
      avatar: '🙂',
      personality: 'Живой игрок',
      role: humanRole,
      isHuman: true,
      isAlive: true,
    };
    const bots = settings.aiPlayers.slice(1).map((cfg) => ({
      id: cfg.id,
      name: cfg.name,
      avatar: cfg.avatar,
      personality: cfg.personality,
      persona: cfg.persona || cfg.personality,
      beliefs: cfg.beliefs,
      style: cfg.style,
      role: cfg.role,
      isHuman: false,
      isAlive: true,
    }));
    return [humanPlayer, ...bots];
  }

  return settings.aiPlayers.map((cfg) => ({
    id: cfg.id,
    name: cfg.name,
    avatar: cfg.avatar,
    personality: cfg.personality,
    persona: cfg.persona || cfg.personality,
    beliefs: cfg.beliefs,
    style: cfg.style,
    role: cfg.role,
    isHuman: false,
    isAlive: true,
  }));
}

export function checkWinCondition(players: Player[]): 'mafia' | 'citizens' | null {
  const living = players.filter((p) => p.isAlive);
  const mafiaCount = living.filter((p) => p.role === 'mafia').length;
  const citizenCount = living.length - mafiaCount;

  if (mafiaCount === 0) return 'citizens';
  if (mafiaCount >= citizenCount) return 'mafia';
  return null;
}

export function resolveVotes(
  votes: Record<string, string>,
  players: Player[]
): {
  eliminatedId: string | null;
  tallies: Record<string, number>;
  isTie: boolean;
} {
  const tallies: Record<string, number> = {};
  const living = players.filter((p) => p.isAlive);
  living.forEach((p) => (tallies[p.id] = 0));

  Object.values(votes).forEach((targetId) => {
    tallies[targetId] = (tallies[targetId] || 0) + 1;
  });

  let maxVotes = 0;
  let leaderId: string | null = null;
  let isTie = false;

  Object.entries(tallies).forEach(([targetId, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      leaderId = targetId;
      isTie = false;
    } else if (count === maxVotes && count > 0) {
      isTie = true;
    }
  });

  return {
    eliminatedId: isTie || maxVotes === 0 ? null : leaderId,
    tallies,
    isTie: isTie && maxVotes > 0,
  };
}

export function resolveNight(
  mafiaTargetId: string | null,
  doctorTargetId: string | null,
  sheriffTargetId: string | null,
  players: Player[]
): {
  killedPlayerId: string | null;
  savedByDoctor: boolean;
  sheriffCheckResult: { targetId: string; targetName: string; isMafia: boolean } | null;
} {
  let killedPlayerId: string | null = null;
  let savedByDoctor = false;

  if (mafiaTargetId) {
    if (doctorTargetId && mafiaTargetId === doctorTargetId) {
      savedByDoctor = true;
      killedPlayerId = null;
    } else {
      killedPlayerId = mafiaTargetId;
    }
  }

  let sheriffCheckResult: { targetId: string; targetName: string; isMafia: boolean } | null = null;
  if (sheriffTargetId) {
    const checked = players.find((p) => p.id === sheriffTargetId);
    if (checked) {
      sheriffCheckResult = {
        targetId: checked.id,
        targetName: checked.name,
        isMafia: checked.role === 'mafia',
      };
    }
  }

  return {
    killedPlayerId,
    savedByDoctor,
    sheriffCheckResult,
  };
}

/**
 * Robust JSON extraction without text hallucination
 */
export function extractCleanJson(raw: string): any {
  if (!raw) return null;
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (text.includes('<think>')) {
    text = text.replace(/<think>[\s\S]*$/gi, '').trim();
  }
  text = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonStr = text.slice(firstBrace, lastBrace + 1);
    try {
      const sanitized = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => {
        if (c === '\n') return '\\n';
        if (c === '\r') return '\\r';
        if (c === '\t') return '\\t';
        return '';
      });
      return JSON.parse(sanitized);
    } catch {}
  }
  return null;
}

/**
 * Extracts speech, ensuring inner thoughts/analysis NEVER leak into public speech
 */
export function extractSpeechAndThought(raw: string): { speech: string; thought: string; plan?: string } {
  const parsed = extractCleanJson(raw);
  if (parsed && typeof parsed === 'object') {
    const speech = typeof parsed.say === 'string' ? parsed.say.trim() : '';
    const thought = typeof parsed.analysis === 'string' ? parsed.analysis.trim() : '';
    const plan = typeof parsed.plan === 'string' ? parsed.plan.trim() : undefined;
    return { speech, thought, plan };
  }
  return { speech: '', thought: '' };
}

/**
 * Sanitizes speech text to ensure thoughts/analysis do not leak into output
 */
export function sanitizeSpeechText(raw: string): string {
  const res = extractSpeechAndThought(raw);
  return res.speech;
}

/**
 * Builds high-IQ competitive prompts strictly isolating private role data
 */
export function buildPlayerTurnContext(
  actor: Player,
  allPlayers: Player[],
  dayNumber: number,
  phase: 'day_discussion' | 'day_voting' | 'night_mafia' | 'night_doctor' | 'night_sheriff' | 'last_words',
  publicChatMessages: ChatMessage[],
  sheriffHistory: SheriffCheckRecord[] = [],
  gameChronicle: string[] = [],
  roundNumber = 1,
  pressureText?: string,
  votesHistory: VoteRecord[] = []
): { systemPrompt: string; userPrompt: string } {
  const livingPlayers = allPlayers.filter((p) => p.isAlive);
  const deadPlayers = allPlayers.filter((p) => !p.isAlive);

  const mafiaLiving = livingPlayers.filter((p) => p.role === 'mafia');
  const citizenLiving = livingPlayers.length - mafiaLiving.length;
  const isCriticalRound = citizenLiving - mafiaLiving.length <= 1;

  // Living players with strict IDs
  const livingRoster = livingPlayers
    .map((p) => `[ID: ${p.id}] ${p.name} (пол: ${getPlayerGender(p.name) === 'она' ? 'женский' : 'мужской'})`)
    .join('\n');

  // Dead players (public knowledge)
  const deadRoster = deadPlayers.length > 0
    ? deadPlayers.map((p) => `• [ID: ${p.id}] ${p.name} (был: ${p.role === 'mafia' ? 'Мафия 🔪' : p.role === 'sheriff' ? 'Шериф ⭐️' : p.role === 'doctor' ? 'Доктор 💊' : 'Мирный 🕊️'})`).join('\n')
    : 'Потерь пока нет.';

  let roleBrief = '';
  if (actor.role === 'mafia') {
    const mates = livingPlayers.filter((p) => p.role === 'mafia' && p.id !== actor.id);
    const mateInfo = mates.length > 0
      ? mates.map((m) => m.name).join(', ')
      : 'ты единственный выживший из мафии';
    roleBrief = `ТЫ — МАФИЯ. Твои сообщники по мафии (живые): ${mateInfo}.
СТРАТЕГИЯ МАФИИ:
- Математика победы: если мирных останется столько же, сколько мафии, игра завершится победой мафии.
- Критический круг (${isCriticalRound ? 'ДА' : 'НЕТ'}): если сегодня казнят мирного, мафия побеждает следующим ходом.
- Маскируйся: не голосуй шаблонно и синхронно с напарником, если за столом сидят сильные логики. При прямой угрозе казни напарника оцени, выгодно ли его защищать или безопаснее слить его ради алиби.
- Лже-шерифство: если тебя или напарника прижали к стенке, используй ложное вскрытие Шерифом, чтобы посеять раскол.`;
  } else if (actor.role === 'sheriff') {
    const checks = sheriffHistory.map(r => `[ID: ${r.targetId}] ${r.targetName} — ${r.isMafia ? 'ЧЕРНЫЙ (МАФИЯ) 🔪' : 'КРАСНЫЙ (МИРНЫЙ) 🕊️'}`).join('\n');
    roleBrief = `ТЫ — ШЕРИФ. Каждую ночь ты тайно проверяешь одного игрока.
ТВОИ ПРОВЕРКИ:\n${checks || 'Проверок пока нет.'}
СТРАТЕГИЯ ШЕРИФА:
- Не вскрывайся на Дне 1 без острой необходимости (если проверен красный и тебе лично не грозит казнь). Сохраняй инкогнито, чтобы мафия не выбила тебя ночью!
- Если ты нашел МАФИЮ (черного) или против тебя собирают голоса на казнь — вскрывайся со всеми проверками и веди город к победе!`;
  } else if (actor.role === 'doctor') {
    roleBrief = `ТЫ — ДОКТОР. Каждую ночь спасаешь одного жителя.
СТРАТЕГИЯ ДОКТОРА:
- Не выдавай себя ни в коем случае — мафия первой целью устраняет доктора.
- Анализируй дневные дебаты: кого мафия боится больше всего? Кто ведет город? Лечи именно его или себя при подозрении на ночной выстрел.`;
  } else {
    roleBrief = `ТЫ — МИРНЫЙ ЖИТЕЛЬ. У тебя нет ночных действий, но твое оружие — логика, анализ голосований и математика стола.
СТРАТЕГИЯ МИРНОГО:
- Анализируй, кто с кем синхронен в голосованиях. Кто кого выгораживает?
- Математика стола: при критическом круге любая ошибка — поражение. Требуй железобетонных доказательств.`;
  }

  const basePressure = pressureText || PRESSURE_PRESETS.hard;
  const actorGender = getPlayerGender(actor.name) === 'она' ? 'женский' : 'мужской';

  const systemPrompt = `${basePressure}

ТЫ — ${actor.name} [ID: ${actor.id}], пол: ${actorGender}.
Психотип: ${actor.persona || actor.personality}.
Манера речи: ${actor.style || 'живая, точная, уверенная'}.

${roleBrief}

ОБСТАНОВКА ЗА СТОЛОМ:
- Всего живых: ${livingPlayers.length} (Мафия: ${mafiaLiving.length}, Мирные/Спецроли: ${citizenLiving}).
${isCriticalRound ? '🚨 ВНИМАНИЕ: КРИТИЧЕСКИЙ КРУГ! Ошибка города на голосовании = победа мафии ночью.' : 'ℹ️ Есть право на ошибку.'}
ЖИВЫЕ УЧАСТНИКИ:\n${livingRoster}
МЁРТВЫЕ УЧАСТНИКИ:\n${deadRoster}

ПРАВИЛО РЕГЛАМЕНТА СТОЛА:
1. Игроки выступают строго по очереди. Тот, кто еще не говорил — ждет своей очереди, не обвиняй его в молчании.
2. Вся публичная речь (say) должна быть от первого лица (${actorGender === 'женский' ? 'женский род: я считаю, я заметила' : 'мужской род: я считаю, я заметил'}).
3. Твои скрытые мысли и расчеты (analysis) пишутся строго в поле analysis и НИКОГДА не дублируются в say!
4. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО: шутить "из могилы" или придумывать реплики выбывших игроков.`;

  const chronicleBlock = gameChronicle.length > 0
    ? `ХРОНИКА ГОРОДА:\n${gameChronicle.map((c) => `• ${c}`).join('\n')}\n\n`
    : '';

  // Filter day debate speeches for current day
  const todaysDebate = publicChatMessages.filter(
    (m) => m.dayNumber === dayNumber && m.phase === 'day' && m.senderId !== 'system' && m.senderId !== 'admin'
  );

  // Voting history summary
  const pastVotesBlock = votesHistory.length > 0
    ? `ИСТОРИЯ ГОЛОСОВАНИЙ ПРОШЛЫХ ДНЕЙ:\n${votesHistory.map((v) => `День ${v.dayNumber}: ${v.voterName} -> ${v.targetName} (${v.why || 'без объяснения'})`).join('\n')}\n\n`
    : '';

  let userPrompt = '';

  if (phase === 'day_discussion') {
    const spokenToday = todaysDebate.map((m, idx) => `[#${idx + 1}] ${m.senderName} [ID: ${m.senderId}]: "${m.text}"`).join('\n');
    const spokenIds = new Set(todaysDebate.map((m) => m.senderId));
    const notYetSpoken = livingPlayers.filter((p) => p.id !== actor.id && !spokenIds.has(p.id));

    const roundInstructions = roundNumber === 1
      ? `КРУГ 1 ДЕБАТОВ. Выдвини обоснованные подозрения по ночным событиям и поведению игроков. Задай прямые вопросы подозреваемым.`
      : `КРУГ 2 ДЕБАТОВ (ФИНАЛ ПЕРЕД ГОЛОСОВАНИЕМ). Отреагируй на реплики Круга 1! Парируй нападки в свой адрес и четко обозначь, против какого ID призываешь голосовать.`;

    userPrompt = `${chronicleBlock}${pastVotesBlock}ХРОНОЛОГИЯ РЕПЛИК СЕГОДНЯ (КРУГ ${roundNumber}):
${spokenToday || '(Ты открываешь круг дебатов, реплик еще не было)'}

${notYetSpoken.length > 0 ? `ЕЩЕ НЕ ВЫСТУПАЛИ В ЭТОМ КРУГЕ: ${notYetSpoken.map((p) => `${p.name} [ID: ${p.id}]`).join(', ')} (ждут очереди по регламенту).\n` : ''}
ТЕКУЩИЙ ХОД: День ${dayNumber}, Круг ${roundNumber}.
ЗАДАЧА: ${roundInstructions}

Ответь СТРОГО JSON:
{"analysis":"твои скрытые дедуктивные мысли и оценка стола (1-2 предложения)","plan":"тактика на текущий раунд","say":"твоя речь вслух в чат (2-4 предложения от 1 лица)"}`;

  } else if (phase === 'day_voting') {
    const candidates = livingPlayers.filter((p) => p.id !== actor.id);
    const candidateList = candidates.map((c) => `[ID: ${c.id}] ${c.name}`).join('\n');
    const debateRecap = todaysDebate.map((m) => `• ${m.senderName}: "${m.text}"`).join('\n');

    userPrompt = `${chronicleBlock}${pastVotesBlock}ДЕБАТЫ ДНЯ #${dayNumber}:
${debateRecap || '(дебаты прошли молча)'}

ГОЛОСОВАНИЕ НА КАЗНЬ.
ЖИВЫЕ КАНДИДАТЫ (выбери строго один targetId из этого списка):
${candidateList}

Ответь СТРОГО JSON:
{"analysis":"тактический расчет голосования и математики стола","targetId":"ID кандидата из списка выше","why":"краткая аргументация в 5-7 слов"}`;

  } else if (phase === 'night_mafia') {
    const victims = livingPlayers.filter((p) => p.role !== 'mafia');
    const victimList = victims.map((v) => `[ID: ${v.id}] ${v.name}`).join('\n');
    const night1Guard = dayNumber === 1
      ? `\nВАЖНО: Сейчас Ночь 1. Дебатов еще не было. Выбирай цель на основе психотипов и опасности для мафии.`
      : '';

    userPrompt = `${chronicleBlock}${pastVotesBlock}НОЧЬ ${dayNumber}. ВЫБОР ЖЕРТВЫ МАФИИ.${night1Guard}
ЖИВЫЕ ЖЕРТВЫ (выбери строго targetId):
${victimList}

Ответь СТРОГО JSON:
{"analysis":"тактический расчет устранения: кто наиболее опасен для мафии","targetId":"ID цели из списка выше","why":"краткое обоснование"}`;

  } else if (phase === 'night_doctor') {
    const candidates = livingPlayers.map((p) => `[ID: ${p.id}] ${p.name}`).join('\n');
    const night1Guard = dayNumber === 1
      ? `\nВАЖНО: Сейчас Ночь 1. Дебатов еще не было, не выдумывай прошлые споры. Защищай интуитивно.`
      : '';

    userPrompt = `${chronicleBlock}${pastVotesBlock}НОЧЬ ${dayNumber}. ВЫБОР ДОКТОРА.${night1Guard}
ЖИВЫЕ ЦЕЛИ ДЛЯ ЛЕЧЕНИЯ (можно лечить себя):
${candidates}

Ответь СТРОГО JSON:
{"analysis":"прогноз ночного выстрела мафии","targetId":"ID цели из списка выше","why":"обоснование"}`;

  } else if (phase === 'night_sheriff') {
    const checkedIds = new Set(sheriffHistory.map((s) => s.targetId));
    const candidates = livingPlayers.filter((p) => p.id !== actor.id && !checkedIds.has(p.id));
    const candidateList = candidates.length > 0
      ? candidates.map((p) => `[ID: ${p.id}] ${p.name}`).join('\n')
      : 'Все живые уже проверены!';

    const night1Guard = dayNumber === 1
      ? `\nВАЖНО: Сейчас Ночь 1. Дебатов еще не было. Проверяй самого непредсказуемого или сильного игрока.`
      : '';

    userPrompt = `${chronicleBlock}${pastVotesBlock}НОЧЬ ${dayNumber}. ПРОВЕРКА ШЕРИФА.${night1Guard}
НЕ ПРОВЕРЕННЫЕ ЖИВЫЕ КАНДИДАТЫ (выбери строго targetId):
${candidateList}

Ответь СТРОГО JSON:
{"analysis":"дедуктивный мотив проверки","targetId":"ID цели из списка выше","why":"обоснование"}`;

  } else if (phase === 'last_words') {
    userPrompt = `ТЕБЯ КАЗНИЛИ НА ГОЛОСОВАНИИ.
Скажи последние слова городу: раскрой свои подозрения, оставь напутствие мирным или поглумись, если ты мафия.
Ответь СТРОГО JSON:
{"analysis":"мысль перед гибелью","say":"последняя реплика вслух"}`;
  }

  return { systemPrompt, userPrompt };
}
