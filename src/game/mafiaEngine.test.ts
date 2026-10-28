import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRoleCounts,
  generateDefaultAiSlots,
  setupPlayers,
  checkWinCondition,
  resolveVotes,
  resolveNight,
  buildPlayerTurnContext,
  Player,
  ChatMessage,
} from './mafiaEngine';

test('calculateRoleCounts provides correct distribution', () => {
  const roles4 = calculateRoleCounts(4);
  assert.equal(roles4.mafia, 1);
  assert.equal(roles4.sheriff, 1);
  assert.equal(roles4.citizen, 2);

  const roles8 = calculateRoleCounts(8);
  assert.equal(roles8.mafia, 2);
  assert.equal(roles8.sheriff, 1);
  assert.equal(roles8.doctor, 1);
  assert.equal(roles8.citizen, 4);
});

test('generateDefaultAiSlots creates fresh slots and setupPlayers initializes all AI', () => {
  const slots = generateDefaultAiSlots(8);
  assert.equal(slots.length, 8);
  assert.equal(slots[0].name.length > 0, true);

  const players = setupPlayers({
    playerCount: 8,
    aiPlayers: slots,
    fogOfWar: false,
    mode: 'watch',
    pressure: 'hard',
    temperature: 0.7,
    speechDelayMs: 2000,
  });
  assert.equal(players.length, 8);
  assert.equal(players.every(p => !p.isHuman), true);
  assert.equal(players.every(p => p.isAlive), true);
});

test('buildPlayerTurnContext enforces visibility rules and prevents admin leaks', () => {
  const players: Player[] = [
    { id: '1', name: 'Виктор', avatar: '🕵️', personality: 'Холодный логик', role: 'mafia', isHuman: false, isAlive: true },
    { id: '2', name: 'Елена', avatar: '🎩', personality: 'Нервный добряк', role: 'mafia', isHuman: false, isAlive: true },
    { id: '3', name: 'Артем', avatar: '👩‍💼', personality: 'Въедливый следователь', role: 'sheriff', isHuman: false, isAlive: false },
    { id: '4', name: 'Дмитрий', avatar: '🧔', personality: 'Параноик', role: 'citizen', isHuman: false, isAlive: true },
  ];

  const chatMessages: ChatMessage[] = [
    { id: 'm1', senderId: 'system', senderName: 'Ночной надзор', text: '[Спецсводка Админа]: Мафия выбрала цель: Артем', phase: 'night', dayNumber: 1, timestamp: 1, isPublic: false },
    { id: 'm2', senderId: 'system', senderName: 'Город', text: 'Этой ночью был убит Артем (Шериф)', phase: 'day', dayNumber: 1, timestamp: 2, isPublic: true },
    { id: 'm3', senderId: '1', senderName: 'Виктор', text: 'Я думаю, Артем погиб не случайно.', phase: 'day', dayNumber: 1, timestamp: 3, isPublic: true },
  ];

  // Citizen Dmitriy context:
  const citizenContext = buildPlayerTurnContext(players[3], players, 1, 'day_discussion', chatMessages);

  // 1. Secret admin surveillance MUST NOT be in prompt
  assert.equal(citizenContext.userPrompt.includes('[Спецсводка Админа]'), false);
  assert.equal(citizenContext.systemPrompt.includes('[Спецсводка Админа]'), false);

  // 2. Dead players are explicitly noted as DEAD and unable to speak
  assert.equal(citizenContext.systemPrompt.includes('МЁРТВЫЕ УЧАСТНИКИ'), true);
  assert.equal(citizenContext.systemPrompt.includes('Артем'), true);
  assert.equal(citizenContext.systemPrompt.includes('КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО: шутить "из могилы"'), true);

  // 3. Citizen does NOT see mafia secret roles of living players
  assert.equal(citizenContext.systemPrompt.includes('Виктор — мафия'), false);

  // 4. Mafia Viktor context: sees his teammate Elena, but NOT other secret roles
  const mafiaContext = buildPlayerTurnContext(players[0], players, 1, 'day_discussion', chatMessages);
  assert.equal(mafiaContext.systemPrompt.includes('Твои сообщники по мафии (живые): Елена'), true);
});

test('checkWinCondition and resolveVotes handle win and ties correctly', () => {
  const players: Player[] = [
    { id: '1', name: 'A', avatar: '🕵️', personality: 'p', role: 'mafia', isHuman: false, isAlive: true },
    { id: '2', name: 'B', avatar: '🕵️', personality: 'p', role: 'citizen', isHuman: false, isAlive: true },
  ];
  assert.equal(checkWinCondition(players), 'mafia');

  const votes = { v1: 'p2', v2: 'p2' };
  const res = resolveVotes(votes, players);
  assert.equal(res.eliminatedId, 'p2');
  assert.equal(res.isTie, false);
});

test('sanitizeSpeechText strips thought leaks and getPlayerGender handles gender agreement', async () => {
  const { sanitizeSpeechText, getPlayerGender } = await import('./mafiaEngine');
  assert.equal(getPlayerGender('Алиса'), 'она');
  assert.equal(getPlayerGender('Борис'), 'он');

  const leakedJson = '{"analysis":"Я мафия и подставляю Бориса","say":"Борис, ты ведёшь себя подозрительно"}';
  const cleaned = sanitizeSpeechText(leakedJson);
  assert.equal(cleaned.includes('Я мафия'), false);
  assert.equal(cleaned.includes('analysis'), false);
  assert.equal(cleaned.includes('Борис, ты ведёшь себя подозрительно'), true);
});
