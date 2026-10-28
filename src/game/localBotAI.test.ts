import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Player,
  ChatMessage,
  VoteRecord,
  SheriffCheckRecord,
  GameSettings,
  generateDefaultAiSlots,
  setupPlayers,
  checkWinCondition,
  resolveVotes,
  resolveNight,
} from './mafiaEngine';
import {
  LocalContext,
  localDaySpeech,
  localDayVote,
  localDoctorTarget,
  localLastWords,
  localMafiaTarget,
  localSheriffTarget,
} from './localBotAI';

/* ------------------------------------------------------------------ */
/* Фикстуры                                                           */
/* ------------------------------------------------------------------ */

function roster(): Player[] {
  return [
    { id: 'p1', name: 'Алиса', avatar: '😰', personality: 'Эмоциональный манипулятор', role: 'mafia', isHuman: false, isAlive: true },
    { id: 'p2', name: 'Борис', avatar: '🧐', personality: 'Холодный логик', role: 'citizen', isHuman: false, isAlive: true },
    { id: 'p3', name: 'Вера', avatar: '🎩', personality: 'Тихий наблюдатель', role: 'sheriff', isHuman: false, isAlive: true },
    { id: 'p4', name: 'Глеб', avatar: '🔥', personality: 'Агрессивный спорщик', role: 'doctor', isHuman: false, isAlive: true },
    { id: 'p5', name: 'Дина', avatar: '🌸', personality: 'Дипломат', role: 'citizen', isHuman: false, isAlive: true },
    { id: 'p6', name: 'Егор', avatar: '🕵️', personality: 'Параноик', role: 'citizen', isHuman: false, isAlive: true },
  ];
}

function ctxFor(id: string, overrides: Partial<LocalContext> = {}): LocalContext {
  const allPlayers = overrides.allPlayers || roster();
  const actor = allPlayers.find((p) => p.id === id)!;
  return { actor, allPlayers, dayNumber: 2, chat: [], votesHistory: [], ...overrides };
}

const vote = (voterId: string, targetId: string, day = 1): VoteRecord => ({
  voterId,
  voterName: voterId,
  targetId,
  targetName: targetId,
  dayNumber: day,
});

/* ------------------------------------------------------------------ */
/* Ночные действия                                                    */
/* ------------------------------------------------------------------ */

test('мафия никогда не выбирает целью своего', () => {
  const players = roster();
  players.push({ id: 'p7', name: 'Жора', avatar: '🔪', personality: 'Тихий', role: 'mafia', isHuman: false, isAlive: true });

  for (const actorId of ['p1', 'p7']) {
    const res = localMafiaTarget(ctxFor(actorId, { allPlayers: players }));
    const victim = players.find((p) => p.id === res.targetId);
    assert.ok(victim, 'цель должна существовать');
    assert.notEqual(victim!.role, 'mafia');
    assert.ok(victim!.isAlive);
  }
});

test('мафия стреляет в самого активного игрока стола', () => {
  const players = roster();
  const chat: ChatMessage[] = [
    { id: 'c1', senderId: 'p2', senderName: 'Борис', text: 'Я шериф, проверка на Алису — чёрный.', phase: 'day', dayNumber: 2, timestamp: 1, isPublic: true },
    { id: 'c2', senderId: 'p2', senderName: 'Борис', text: 'Голосуем в Алису.', phase: 'day', dayNumber: 2, timestamp: 2, isPublic: true },
  ];
  const res = localMafiaTarget(ctxFor('p1', { allPlayers: players, chat, dayNumber: 2 }));
  assert.equal(res.targetId, 'p2', 'шериф, вскрывшийся днём, должен быть приоритетной целью');
});

test('доктор и шериф выбирают только живых и только не себя (доктор может себя)', () => {
  const players = roster();
  players[1].isAlive = false; // Борис мёртв

  const doc = localDoctorTarget(ctxFor('p4', { allPlayers: players }));
  assert.ok(players.find((p) => p.id === doc.targetId && p.isAlive), 'доктор лечит живого');

  const checked = new Set(['p2']);
  const sheriff = localSheriffTarget(ctxFor('p3', { allPlayers: players }), checked);
  const target = players.find((p) => p.id === sheriff.targetId);
  assert.ok(target!.isAlive);
  assert.notEqual(target!.id, 'p3');
  assert.ok(!checked.has(target!.id), 'шериф не проверяет дважды');
});

/* ------------------------------------------------------------------ */
/* Голосование                                                        */
/* ------------------------------------------------------------------ */

test('боты голосуют в живого и не в себя', () => {
  for (const p of roster()) {
    const ctx = ctxFor(p.id);
    const res = localDayVote(ctx);
    const target = ctx.allPlayers.find((x) => x.id === res.targetId);
    assert.ok(target, `${p.name} должен выбрать существующую цель`);
    assert.notEqual(target!.id, p.id, `${p.name} не голосует в себя`);
    assert.ok(target!.isAlive);
    assert.ok(res.why.length > 0, 'нужна причина голоса');
  }
});

test('мафия не голосует против напарника', () => {
  const players = roster();
  players.push({ id: 'p7', name: 'Жора', avatar: '🔪', personality: 'Тихий', role: 'mafia', isHuman: false, isAlive: true });
  const res = localDayVote(ctxFor('p1', { allPlayers: players }));
  const target = players.find((p) => p.id === res.targetId)!;
  assert.notEqual(target.role, 'mafia');
});

test('шериф закрывает чёрную проверку, даже если стол тянет в другого', () => {
  const history: SheriffCheckRecord[] = [
    { targetId: 'p6', targetName: 'Егор', isMafia: true, nightNumber: 1 },
  ];
  const res = localDayVote(ctxFor('p3', { sheriffHistory: history }));
  assert.equal(res.targetId, 'p6');
});

test('голосование опирается на факт «голосовал против погибшего мирного»', () => {
  const players = roster();
  players[4].isAlive = false; // Дина убита ночью (мирная)
  const votesHistory = [vote('p1', 'p5')];

  // Голос мафии идёт в мирного с наибольшим числом улик
  const res = localDayVote(ctxFor('p4', { allPlayers: players, votesHistory }));
  assert.ok(res.targetId.length > 0);
  assert.match(res.analysis + res.why, /голосовал|дав|молчит|факт|поведение|Слишком|похож/i);
});

/* ------------------------------------------------------------------ */
/* Речь                                                               */
/* ------------------------------------------------------------------ */

test('речь бота непустая и не раскрывает роль мафии', () => {
  const ctx = ctxFor('p1', { dayNumber: 1 });
  const speech = localDaySpeech(ctx);
  assert.ok(speech.say.length > 20);
  assert.ok(speech.analysis.length > 0);
  assert.ok(
    !/я\s+—?\s*мафия|я мафия/i.test(speech.say),
    'мафия не признаётся вслух'
  );
});

test('шериф вскрывается, когда есть чёрная проверка', () => {
  const history: SheriffCheckRecord[] = [
    { targetId: 'p1', targetName: 'Алиса', isMafia: true, nightNumber: 1 },
  ];
  const speech = localDaySpeech(ctxFor('p3', { sheriffHistory: history }));
  assert.match(speech.say, /шериф/i);
  assert.match(speech.say, /Алиса/);
});

test('последние слова всегда содержат текст', () => {
  for (const p of roster()) {
    const words = localLastWords(ctxFor(p.id));
    assert.ok(words.say.length > 10);
    assert.ok(words.analysis.length > 0);
  }
});

test('решения детерминированы для одного и того же состояния', () => {
  const a = localDayVote(ctxFor('p2'));
  const b = localDayVote(ctxFor('p2'));
  assert.deepEqual(a, b);

  const s1 = localDaySpeech(ctxFor('p2'));
  const s2 = localDaySpeech(ctxFor('p2'));
  assert.deepEqual(s1, s2);
});

/* ------------------------------------------------------------------ */
/* Полная партия на локальном движке                                   */
/* ------------------------------------------------------------------ */

function simulateMatch(seedShift: number): { winner: string | null; days: number } {
  const base = generateDefaultAiSlots(7);
  const slots = [...base.slice(seedShift), ...base.slice(0, seedShift)];

  const settings: GameSettings = {
    mode: 'watch',
    playerCount: slots.length,
    aiPlayers: slots,
    fogOfWar: false,
    pressure: 'hard',
    temperature: 0.85,
    speechDelayMs: 0,
  };

  let players = setupPlayers(settings);
  const say = (id: string) => players.find((p) => p.id === id)!;

  let day = 1;
  const chat: ChatMessage[] = [];
  const votesHistory: VoteRecord[] = [];
  const sheriffHistory: SheriffCheckRecord[] = [];
  const checked = new Set<string>();

  while (!checkWinCondition(players) && day <= 25) {
    /* --- ночь --- */
    const ctxNight = (id: string) => ({ actor: say(id), allPlayers: players, dayNumber: day, chat, votesHistory });
    const mafia = players.filter((p) => p.isAlive && p.role === 'mafia');
    const doctor = players.find((p) => p.isAlive && p.role === 'doctor');
    const sheriff = players.find((p) => p.isAlive && p.role === 'sheriff');

    const mafiaTarget = mafia.length > 0 ? localMafiaTarget(ctxNight(mafia[0].id)).targetId : null;
    const doctorTarget = doctor ? localDoctorTarget(ctxNight(doctor.id)).targetId : null;
    const sheriffTarget = sheriff ? localSheriffTarget(ctxNight(sheriff.id), checked).targetId : null;

    const night = resolveNight(mafiaTarget, doctorTarget, sheriffTarget, players);

    if (sheriffTarget && sheriff) {
      checked.add(sheriffTarget);
      const target = say(sheriffTarget);
      sheriffHistory.push({
        targetId: target.id,
        targetName: target.name,
        isMafia: target.role === 'mafia',
        nightNumber: day,
      });
    }

    if (night.killedPlayerId) {
      players = players.map((p) => (p.id === night.killedPlayerId ? { ...p, isAlive: false, diedAtDay: day } : p));
    }
    if (checkWinCondition(players)) break;

    /* --- день: дебаты --- */
    for (const speaker of players.filter((p) => p.isAlive)) {
      const ctx = { actor: speaker, allPlayers: players, dayNumber: day, chat, votesHistory, sheriffHistory };
      const speech = localDaySpeech(ctx);
      chat.push({
        id: `m-${day}-${speaker.id}`,
        senderId: speaker.id,
        senderName: speaker.name,
        text: speech.say,
        thought: speech.analysis,
        phase: 'day',
        dayNumber: day,
        timestamp: Date.now(),
        isPublic: true,
      });
    }

    /* --- день: голосование --- */
    const votes: Record<string, string> = {};
    for (const voter of players.filter((p) => p.isAlive)) {
      const ctx = { actor: voter, allPlayers: players, dayNumber: day, chat, votesHistory, sheriffHistory };
      const decision = localDayVote(ctx);
      if (decision.targetId) votes[voter.id] = decision.targetId;
    }

    const tally = resolveVotes(votes, players);
    if (tally.eliminatedId) {
      const eliminated = say(tally.eliminatedId);
      votesHistory.push(
        ...Object.entries(votes).map(([voterId, targetId]) => ({
          voterId,
          voterName: say(voterId).name,
          targetId,
          targetName: say(targetId).name,
          dayNumber: day,
        }))
      );
      const words = localLastWords({ actor: eliminated, allPlayers: players, dayNumber: day });
      chat.push({
        id: `last-${day}`,
        senderId: eliminated.id,
        senderName: eliminated.name,
        text: words.say,
        phase: 'day',
        dayNumber: day,
        timestamp: Date.now(),
        isPublic: true,
      });
      players = players.map((p) => (p.id === eliminated.id ? { ...p, isAlive: false, diedAtDay: day } : p));
    }

    day += 1;
  }

  return { winner: checkWinCondition(players), days: day };
}

test('партия на локальном движке всегда завершается победой одной из сторон', () => {
  const results = Array.from({ length: 14 }, (_, i) => simulateMatch(i % 7));

  for (const r of results) {
    assert.ok(r.winner === 'mafia' || r.winner === 'citizens', `партия должна завершиться, получено: ${r.winner}`);
    assert.ok(r.days <= 25, 'партия не должна затягиваться бесконечно');
  }

  // Обе стороны должны быть способны выиграть — иначе баланс сломан.
  const wins = new Set(results.map((r) => r.winner));
  assert.equal(wins.size, 2, `ожидались победы обеих сторон, получено: ${[...wins].join(', ')}`);
});
