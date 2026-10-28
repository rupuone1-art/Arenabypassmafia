/**
 * localBotAI — «мозг» ботов, работающий полностью в браузере, без обращения к LLM.
 *
 * Зачем это нужно:
 *  - Игра остаётся играбельной, если у пользователя нет GEMINI_API_KEY / YUKINO_API_KEY,
 *    или внешний провайдер недоступен (офлайн-демо, CI, показ).
 *  - Модуль детерминирован: при одном и том же состоянии партии решения повторяемы
 *    (случайность завязана на seed из id актёра/дня/цели), поэтому его можно тестировать.
 *
 * Все публичные функции возвращают объекты той же формы, что просят промпты LLM,
 * поэтому слой services/aiClient может подставить их как fallback без изменений UI.
 */

import {
  Player,
  ChatMessage,
  VoteRecord,
  SheriffCheckRecord,
  getPlayerGender,
} from './mafiaEngine';

export interface LocalContext {
  actor: Player;
  allPlayers: Player[];
  dayNumber: number;
  chat?: ChatMessage[];
  votesHistory?: VoteRecord[];
  chronicle?: string[];
  sheriffHistory?: SheriffCheckRecord[];
  roundNumber?: number;
}

/* ------------------------------------------------------------------ */
/* Детерминированный «рандом»                                          */
/* ------------------------------------------------------------------ */

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: string): () => number {
  let a = hashString(seed) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne<T>(items: T[], rnd: () => number): T {
  return items[Math.floor(rnd() * items.length) % items.length];
}

/* ------------------------------------------------------------------ */
/* Грамматика / род                                                   */
/*                                                                    */
/* В русском языке имя в винительном падеже без словаря не построить, */
/* поэтому все шаблоны написаны так, чтобы имя всегда стояло в        */
/* именительном падеже (двоеточие, тире, отдельные предложения).      */
/* ------------------------------------------------------------------ */

const isShe = (p: Player | string): boolean =>
  getPlayerGender(typeof p === 'string' ? p : p.name) === 'она';

/** Выбор формы глагола по роду игрока: verb(p, 'заметил', 'заметила') */
const verb = (p: Player | string, male: string, female: string): string =>
  isShe(p) ? female : male;

/** «него» / «неё» — для корректных фраз про игрока. */
const him = (p: Player | string): string => (isShe(p) ? 'неё' : 'него');

/* ------------------------------------------------------------------ */
/* Публичные факты и эвристики                                        */
/* ------------------------------------------------------------------ */

interface Evidence {
  /** почему игрок подозрителен (публичные, проверяемые факты) */
  reasons: string[];
  /** числовая оценка подозрительности */
  score: number;
  /** сколько игрок говорил в текущем дне */
  speechesToday: number;
}

const deadById = (players: Player[], id: string): Player | undefined =>
  players.find((p) => p.id === id && !p.isAlive);

function todayDebate(ctx: LocalContext): ChatMessage[] {
  const { chat = [], dayNumber } = ctx;
  return chat.filter(
    (m) =>
      m.dayNumber === dayNumber &&
      m.phase === 'day' &&
      m.senderId !== 'system' &&
      m.senderId !== 'admin'
  );
}

/** Упоминает ли игрок в своей речи других участников (то есть реально обвиняет). */
function namesSomeone(ctx: LocalContext, target: Player, speeches: ChatMessage[]): boolean {
  return speeches.some((m) =>
    ctx.allPlayers.some(
      (p) => p.id !== target.id && (m.text.includes(p.name) || m.text.includes(p.id))
    )
  );
}

function buildEvidence(ctx: LocalContext, target: Player): Evidence {
  const { actor, allPlayers, votesHistory = [], dayNumber } = ctx;
  const debate = todayDebate(ctx);
  const ownSpeech = debate.filter((m) => m.senderId === target.id);
  const reasons: string[] = [];
  let score = 0;

  const speechesToday = ownSpeech.length;

  // 1. Голосование против уже погибших мирных — самый честный след.
  const votesAgainstDeadCitizens = votesHistory.filter((v) => {
    if (v.voterId !== target.id) return false;
    const dead = deadById(allPlayers, v.targetId);
    return !!dead && dead.role !== 'mafia';
  });
  if (votesAgainstDeadCitizens.length > 0) {
    score += 2.2 * votesAgainstDeadCitizens.length;
    const last = votesAgainstDeadCitizens[votesAgainstDeadCitizens.length - 1];
    reasons.push(`голос ушёл в погибшего мирного (${last.targetName})`);
  }

  // 2. Голосование против погибшей мафии — наоборот, оправдывает.
  const votesAgainstDeadMafia = votesHistory.filter((v) => {
    if (v.voterId !== target.id) return false;
    const dead = deadById(allPlayers, v.targetId);
    return !!dead && dead.role === 'mafia';
  });
  score -= 1.6 * votesAgainstDeadMafia.length;

  // 3. Прицельное давление на актёра.
  if (votesHistory.some((v) => v.voterId === target.id && v.targetId === actor.id)) {
    score += 1.3;
    reasons.push('давит лично на меня');
  }

  // 4. Молчание в дебатах при живом столе — классический признак мафии.
  if (dayNumber > 1 && speechesToday === 0) {
    score += 1.1;
    reasons.push('молчит весь круг');
  }

  // 5. Говорит, но никого не называет — речью размывает внимание.
  if (speechesToday > 0 && !namesSomeone(ctx, target, ownSpeech)) {
    score += 0.6;
    reasons.push('говорит общими словами и не называет ни одного ID');
  }

  // 6. Короткие, уклончивые реплики.
  if (ownSpeech.length > 0 && ownSpeech.every((m) => m.text.length < 120)) {
    score += 0.3;
    reasons.push('отвечает односложно и уходит от прямых вопросов');
  }

  // 7. Постоянно меняет цель между днями.
  const targetsByDay = new Map<number, string>();
  votesHistory
    .filter((v) => v.voterId === target.id)
    .forEach((v) => targetsByDay.set(v.dayNumber, v.targetId));
  if (targetsByDay.size >= 2 && new Set(targetsByDay.values()).size === targetsByDay.size) {
    score += 0.5;
    reasons.push('каждый день меняет цель голосования без объяснений');
  }

  // 8. Данные шерифа — абсолютный приоритет, если актёр и есть шериф.
  if (actor.role === 'sheriff') {
    const check = (ctx.sheriffHistory || []).find((c) => c.targetId === target.id);
    if (check) {
      reasons.length = 0;
      if (check.isMafia) {
        score += 100;
        reasons.push('моя ночная проверка: ЧЁРНЫЙ');
      } else {
        score -= 100;
      }
    }
  }

  // 9. Мафия знает своих — никогда не рассматривает их как цель казни.
  if (actor.role === 'mafia' && target.role === 'mafia') {
    score -= 1000;
  }

  // 10. Небольшой шум, чтобы стол не голосовал синхронно.
  const rnd = makeRng(`${actor.id}|${target.id}|${dayNumber}|ev`);
  score += rnd() * 0.9;

  return { reasons, score, speechesToday };
}

/** Насколько игрок опасен для мафии (кого выгодно убрать ночью). */
function threatToMafia(ctx: LocalContext, target: Player): number {
  const { allPlayers, votesHistory = [], dayNumber } = ctx;
  const debate = todayDebate(ctx);
  let danger = 0;

  danger += 1.2 * debate.filter((m) => m.senderId === target.id).length;

  // Голосовал против мафии, которая затем вскрылась — почти шериф.
  votesHistory.forEach((v) => {
    if (v.voterId !== target.id) return;
    const dead = deadById(allPlayers, v.targetId);
    if (dead && dead.role === 'mafia') danger += 2.5;
  });

  // Публично заявлял о проверке.
  const said = debate
    .filter((m) => m.senderId === target.id)
    .map((m) => m.text.toLowerCase())
    .join(' ');
  if (said.includes('шериф') || said.includes('проверк')) danger += 2.8;

  const rnd = makeRng(`${ctx.actor.id}|${target.id}|${dayNumber}|threat`);
  danger += rnd() * 1.4;
  return danger;
}

function sortByScore<T>(items: T[], score: (item: T) => number): T[] {
  return [...items].sort((a, b) => score(b) - score(a));
}

/** Человеко-читаемая причина подозрения (фраза без имени, с маленькой буквы). */
function reasonPhrase(ctx: LocalContext, target: Player): string {
  const reasons = buildEvidence(ctx, target).reasons;
  if (reasons.length > 0) return reasons[0];
  const fallback = [
    'слишком уверенно раздаёт оценки без единого факта',
    'уходит от прямых ответов на вопросы стола',
    'говорит громче всех, но по делу — ничего',
  ];
  const rnd = makeRng(`${ctx.actor.id}|${target.id}|${ctx.dayNumber}|reason`);
  return pickOne(fallback, rnd);
}

/* ------------------------------------------------------------------ */
/* Ночные действия                                                    */
/* ------------------------------------------------------------------ */

export function localMafiaTarget(ctx: LocalContext): {
  analysis: string;
  targetId: string;
  why: string;
} {
  const victims = ctx.allPlayers.filter((p) => p.isAlive && p.role !== 'mafia');
  if (victims.length === 0) return { analysis: '', targetId: '', why: '' };

  const target = sortByScore(victims, (p) => threatToMafia(ctx, p))[0];
  return {
    analysis: `Ночь ${ctx.dayNumber}: убираем самого опасного. Уровень угрозы от ${target.name} — ${threatToMafia(
      ctx,
      target
    ).toFixed(1)}.`,
    targetId: target.id,
    why: 'Самый опасный для мафии игрок',
  };
}

export function localDoctorTarget(ctx: LocalContext): {
  analysis: string;
  targetId: string;
  why: string;
} {
  const living = ctx.allPlayers.filter((p) => p.isAlive);
  if (living.length === 0) return { analysis: '', targetId: '', why: '' };

  const rnd = makeRng(`${ctx.actor.id}|${ctx.dayNumber}|doctor`);
  const others = living.filter((p) => p.id !== ctx.actor.id);

  // Доктор не знает ролей: лечим того, кто ведёт стол (вероятная цель мафии).
  const healSelf = others.length === 0 || rnd() < 0.22;
  const target = healSelf ? ctx.actor : sortByScore(others, (p) => threatToMafia(ctx, p))[0];

  return {
    analysis: `Ночь ${ctx.dayNumber}: прогнозирую выстрел в самого активного. ${
      healSelf ? 'Лечу себя' : `Лечу ${target.name}`
    }.`,
    targetId: target.id,
    why: healSelf ? 'Мафия может стрелять в меня' : 'Вероятная цель мафии',
  };
}

export function localSheriffTarget(
  ctx: LocalContext,
  checkedIds: Set<string>
): { analysis: string; targetId: string; why: string } {
  const candidates = ctx.allPlayers.filter(
    (p) => p.isAlive && p.id !== ctx.actor.id && !checkedIds.has(p.id)
  );
  if (candidates.length === 0) return { analysis: '', targetId: '', why: '' };

  const target = sortByScore(candidates, (p) => buildEvidence(ctx, p).score)[0];
  return {
    analysis: `Ночь ${ctx.dayNumber}: проверяю самого непредсказуемого из непроверенных — ${target.name}.`,
    targetId: target.id,
    why: 'Максимальная подозрительность среди непроверенных',
  };
}

/* ------------------------------------------------------------------ */
/* Дневное голосование                                                */
/* ------------------------------------------------------------------ */

export function localDayVote(ctx: LocalContext): {
  analysis: string;
  targetId: string;
  why: string;
} {
  const { actor, allPlayers } = ctx;
  const candidates = allPlayers.filter((p) => p.isAlive && p.id !== actor.id);
  if (candidates.length === 0) {
    return { analysis: '', targetId: '', why: '' };
  }

  const evidence = new Map(candidates.map((c) => [c.id, buildEvidence(ctx, c)]));

  // Шериф сначала закрывает чёрные проверки.
  if (actor.role === 'sheriff') {
    const black = (ctx.sheriffHistory || []).find(
      (c) => c.isMafia && candidates.some((p) => p.id === c.targetId)
    );
    if (black) {
      return {
        analysis: `У меня на руках чёрная проверка на ${black.targetName}. Город обязан голосовать туда.`,
        targetId: black.targetId,
        why: 'Чёрная проверка шерифа',
      };
    }
  }

  // Мафия никогда не голосует против своих.
  const pool = candidates.filter((c) => !(actor.role === 'mafia' && c.role === 'mafia'));
  const effectivePool = pool.length > 0 ? pool : candidates;
  const target = sortByScore(effectivePool, (p) => evidence.get(p.id)!.score)[0];
  const ev = evidence.get(target.id)!;

  return {
    analysis: `Голосую в ${target.name} [${target.id}]: ${
      ev.reasons.join('; ') || 'нет прямых улик, но поведение самое тёмное'
    }.`,
    targetId: target.id,
    why: reasonPhrase(ctx, target),
  };
}

/* ------------------------------------------------------------------ */
/* Дневная речь                                                       */
/* ------------------------------------------------------------------ */

function openers(ctx: LocalContext): string[] {
  const { actor, allPlayers, dayNumber } = ctx;
  const living = allPlayers.filter((p) => p.isAlive);
  const dead = allPlayers.filter((p) => !p.isAlive);
  const lastDead = dead[dead.length - 1];

  const list: string[] = [];
  if (lastDead) {
    list.push(`Ночью ${verb(lastDead, 'погиб', 'погибла')} ${lastDead.name}.`);
    list.push(`Мы потеряли ${lastDead.name} — и это уже подсказка.`);
  }
  list.push(`На столе ${living.length} живых, права на ошибку почти нет.`);
  list.push(`Я ${verb(actor, 'пересмотрел', 'пересмотрела')} весь круг и вижу конкретную картину.`);
  list.push(`Давайте без эмоций: фактов мало, но они есть.`);
  list.push(`Я ${verb(actor, 'слушал', 'слушала')} всех и ${verb(actor, 'выделил', 'выделила')} главное.`);
  if (dayNumber > 1) {
    list.push('Смотрю в первую очередь на руки, а не на громкость.');
  }
  return list;
}

function closer(name: string, rnd: () => number): string {
  return pickOne(
    [
      `Мой голос — ${name}.`,
      `Предлагаю казнить: ${name}.`,
      `Призываю стол консолидироваться: ${name}.`,
      `Голосуем: ${name}. Всё остальное — вода.`,
      `Ставлю руку в ${name} и готов${''} объяснить каждое слово.`,
    ],
    rnd
  );
}

export function localDaySpeech(ctx: LocalContext): {
  analysis: string;
  plan: string;
  say: string;
} {
  const { actor, allPlayers, dayNumber } = ctx;
  const rnd = makeRng(`${actor.id}|${dayNumber}|${ctx.roundNumber || 1}|speech`);
  const living = allPlayers.filter((p) => p.isAlive);
  const others = living.filter((p) => p.id !== actor.id);

  const opener = pickOne(openers(ctx), rnd);

  // Шериф вскрывается, если нашёл чёрного.
  if (actor.role === 'sheriff') {
    const black = (ctx.sheriffHistory || []).find(
      (c) => c.isMafia && living.some((p) => p.id === c.targetId)
    );
    if (black) {
      return {
        analysis: `Вскрываюсь шерифом: чёрная проверка на ${black.targetName}. Дальше город идёт по моим проверкам.`,
        plan: 'Вести город на чёрную проверку и не дать мафии расколоть голоса.',
        say: `Я шериф. Ночная проверка: ${black.targetName} — чёрный. ${opener} Голосуем строго: ${black.targetName}. Остальное обсудим после.`,
      };
    }
  }

  if (others.length === 0) {
    return {
      analysis: 'За столом не осталось оппонентов — говорить не о чем.',
      plan: 'Дождаться итогов.',
      say: `${opener} Мне некого обвинять всерьёз.`,
    };
  }

  const ranked = sortByScore(others, (p) => buildEvidence(ctx, p).score);
  const suspect = ranked[0];
  // Имя ставим в именительный падеж, причину — после двоеточия (без склонений).
  const evidenceSentence = `Подозрительнее всех — ${suspect.name}: ${reasonPhrase(ctx, suspect)}.`;

  let say: string;
  if (actor.role === 'mafia') {
    // Мафия маскируется: обвиняет «по фактам», иногда слегка прикрывает напарника.
    const mates = living.filter((p) => p.role === 'mafia' && p.id !== actor.id);
    const mate = mates.length > 0 ? mates[Math.floor(rnd() * mates.length)] : null;
    const defence =
      mate && rnd() < 0.5
        ? ` ${mate.name} мне тоже не нравится, но улик против ${him(mate)} пока нет — не спешим.`
        : '';
    say = `${opener} ${evidenceSentence}${defence} ${closer(suspect.name, rnd)}`;
  } else {
    say = `${opener} ${evidenceSentence} ${closer(suspect.name, rnd)}`;
  }

  return {
    analysis: `Мои подозрения: ${ranked
      .slice(0, 2)
      .map((p) => `${p.name} (${buildEvidence(ctx, p).score.toFixed(1)})`)
      .join(', ')}. Роль: ${actor.role}.`,
    plan:
      actor.role === 'mafia'
        ? 'Направить голоса в мирного и не дать столу консолидироваться.'
        : 'Консолидировать голоса на самом подозрительном игроке.',
    say,
  };
}

/* ------------------------------------------------------------------ */
/* Последние слова                                                    */
/* ------------------------------------------------------------------ */

export function localLastWords(ctx: LocalContext): {
  analysis: string;
  say: string;
} {
  const { actor, allPlayers, dayNumber } = ctx;
  const rnd = makeRng(`${actor.id}|${dayNumber}|last`);
  const living = allPlayers.filter((p) => p.isAlive);
  const ranked = sortByScore(
    living.filter((p) => p.id !== actor.id),
    (p) => buildEvidence(ctx, p).score
  );
  const main = ranked[0];

  if (actor.role === 'mafia') {
    return {
      analysis: 'Затягиваю петлю неопределённости и отвожу подозрения от напарников.',
      say: pickOne(
        [
          `Город ошибся, и это вам ещё аукнется. Я ${verb(actor, 'был', 'была')} мирн${
            isShe(actor) ? 'ой' : 'ым'
          }, а вы поверили тому, кто громче всех кричал.`,
          'Казнили невиновного. Настоящая мафия сидит рядом с вами и улыбается.',
          'Мой последний совет: смотрите не на слова, а на руки. Я ухожу, а мафия остаётся.',
        ],
        rnd
      ),
    };
  }

  return {
    analysis: 'Оставляю городу максимально точную наводку.',
    say: `Я умираю за правду. Главный подозреваемый для меня — ${
      main ? main.name : 'самый тихий игрок за столом'
    }. Не голосуйте по громкости, голосуйте по фактам.`,
  };
}
