import React, { useState, useEffect, useRef } from 'react';
import {
  Player,
  Role,
  ChatMessage,
  GameSettings,
  DebugLogEntry,
  SheriffCheckRecord,
  VoteRecord,
  setupPlayers,
  generateDefaultAiSlots,
  checkWinCondition,
  resolveVotes,
  resolveNight,
  PRESSURE_PRESETS,
} from './game/mafiaEngine';
import {
  requestDaySpeech,
  requestDayVote,
  requestMafiaNightTarget,
  requestDoctorNightTarget,
  requestSheriffNightTarget,
  requestLastWords,
  ApiUnavailableError,
} from './services/aiClient';
import { LobbyView } from './components/LobbyView';
import { RoleBadge, ROLE_INFO } from './components/RoleBadge';
import { GameOverModal } from './components/GameOverModal';
import { DebugLogModal } from './components/DebugLogModal';
import { NightActionModal } from './components/NightActionModal';
import { ProviderBadge } from './components/ProviderBadge';
import { sound } from './components/SoundEffects';
import {
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Square,
  Home,
  Eye,
  EyeOff,
  Brain,
  Sparkles,
  ChevronDown,
  ShieldAlert,
  Send,
  RotateCcw,
  Terminal,
  Copy,
  Check,
  FastForward,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

export default function App() {
  const [inLobby, setInLobby] = useState(true);
  const [settings, setSettings] = useState<GameSettings>(() => ({
    mode: 'watch',
    playerCount: 6,
    aiPlayers: generateDefaultAiSlots(6),
    fogOfWar: false,
    pressure: PRESSURE_PRESETS.hard,
    temperature: 0.85,
    speechDelayMs: 1200,
  }));

  const [players, setPlayers] = useState<Player[]>([]);
  const [dayNumber, setDayNumber] = useState<number>(1);
  const [isNight, setIsNight] = useState<boolean>(true);
  const [phaseText, setPhaseText] = useState<string>('Город засыпает...');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [speed, setSpeed] = useState<number>(1); // 1 = normal, 2 = fast, 4 = turbo
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [showRolesToAdmin, setShowRolesToAdmin] = useState<boolean>(true);
  const [showThoughts, setShowThoughts] = useState<boolean>(true); // 🧠 Mind reading toggle

  // System pause upon LLM unavailability
  const [isSystemPaused, setIsSystemPaused] = useState<boolean>(false);
  const isSystemPausedRef = useRef<boolean>(false);
  const pendingRetryFnRef = useRef<(() => void) | null>(null);

  // Pause & Stop match states
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isStopped, setIsStopped] = useState<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const isStoppedRef = useRef<boolean>(false);
  const speedRef = useRef<number>(1);

  // Debug Log State
  const [debugLogEntries, setDebugLogEntries] = useState<DebugLogEntry[]>([]);
  const [showDebugModal, setShowDebugModal] = useState<boolean>(false);

  // Active turn indicators
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [selectedPlayerInfo, setSelectedPlayerInfo] = useState<Player | null>(null);

  // Admin Custom Notice
  const [adminCustomNotice, setAdminCustomNotice] = useState<string>('');
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);

  // Human player input during debates
  const [humanSpeechText, setHumanSpeechText] = useState<string>('');
  const [isWaitingForHumanSpeech, setIsWaitingForHumanSpeech] = useState<boolean>(false);
  const humanSpeechResolverRef = useRef<((text: string) => void) | null>(null);

  // Human Night Action Modal
  const [showNightActionModal, setShowNightActionModal] = useState<boolean>(false);
  const [humanNightActionRole, setHumanNightActionRole] = useState<Role>('citizen');
  const [humanSheriffResult, setHumanSheriffResult] = useState<{ targetName: string; isMafia: boolean } | null>(null);
  const humanNightActionResolverRef = useRef<((targetId: string) => void) | null>(null);

  // Human Voting Selection
  const [showHumanVotePanel, setShowHumanVotePanel] = useState<boolean>(false);
  const humanVoteResolverRef = useRef<((targetId: string) => void) | null>(null);

  // Copy feedback
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // End game
  const [winner, setWinner] = useState<'mafia' | 'citizens' | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const matchSessionIdRef = useRef<number>(0);
  const alreadyCheckedIdsRef = useRef<Set<string>>(new Set());
  const sheriffHistoryRef = useRef<SheriffCheckRecord[]>([]);
  const chronicleRef = useRef<string[]>([]);
  const playersRef = useRef<Player[]>([]);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  const dayNumberRef = useRef<number>(1);
  const votesHistoryRef = useRef<VoteRecord[]>([]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isAiThinking, isWaitingForHumanSpeech, showHumanVotePanel]);

  // Отмена текущей партии при размонтировании компонента:
  // без этого циклы ночи/дня продолжают жечь таймеры после закрытия экрана.
  useEffect(() => {
    return () => {
      matchSessionIdRef.current += 1;
      isStoppedRef.current = true;
    };
  }, []);

  const toggleSound = () => {
    sound.enabled = !soundEnabled;
    setSoundEnabled(!soundEnabled);
  };

  const addLogEntry = (entry: DebugLogEntry) => {
    setDebugLogEntries((prev) => [...prev, entry]);
  };

  const addMessage = (
    text: string,
    senderId = 'system',
    senderName = 'Город',
    phase: 'day' | 'night' | 'system' | 'admin' | 'vote' = 'system',
    isPublic = true,
    thought?: string
  ) => {
    const msg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      senderId,
      senderName,
      text,
      thought,
      phase,
      dayNumber: dayNumberRef.current,
      timestamp: Date.now(),
      isPublic,
    };
    chatMessagesRef.current = [...chatMessagesRef.current, msg];
    setChatMessages(chatMessagesRef.current);
    return msg;
  };

  const handleCopyMessage = (msgId: string, text: string) => {
    sound.playTap();
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 1500);
    } catch {}
  };

  const delay = async (ms: number, currentSessionId: number) => {
    const adjusted = Math.max(60, Math.floor(ms / speedRef.current));
    let elapsed = 0;
    const step = 50;

    while (elapsed < adjusted) {
      if (matchSessionIdRef.current !== currentSessionId) {
        throw new Error('SESSION_CANCELLED');
      }
      if (isStoppedRef.current) {
        throw new Error('MATCH_STOPPED');
      }
      while (isPausedRef.current || isSystemPausedRef.current) {
        if (matchSessionIdRef.current !== currentSessionId) {
          throw new Error('SESSION_CANCELLED');
        }
        if (isStoppedRef.current) {
          throw new Error('MATCH_STOPPED');
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(step, adjusted - elapsed)));
      elapsed += step;
    }
  };

  const executeAiTurn = async <T,>(actionFn: () => Promise<T>, sessionId: number): Promise<T> => {
    while (true) {
      if (matchSessionIdRef.current !== sessionId) throw new Error('SESSION_CANCELLED');
      if (isStoppedRef.current) throw new Error('MATCH_STOPPED');
      try {
        return await actionFn();
      } catch (err: any) {
        if (err instanceof ApiUnavailableError || err?.name === 'ApiUnavailableError') {
          setIsAiThinking(false);
          isSystemPausedRef.current = true;
          setIsSystemPaused(true);
          addMessage(
            '⚠️ [SYSTEM_PAUSE]: LLM-провайдер временно недоступен после всех попыток. Нажмите «Повторить ход» для продолжения.',
            'system',
            'Система',
            'admin',
            false
          );
          await new Promise<void>((resolve) => {
            pendingRetryFnRef.current = () => {
              isSystemPausedRef.current = false;
              setIsSystemPaused(false);
              resolve();
            };
          });
          continue;
        }
        throw err;
      }
    }
  };

  const handleRetrySystemPause = () => {
    sound.playTap();
    if (pendingRetryFnRef.current) {
      pendingRetryFnRef.current();
    }
  };

  const togglePause = () => {
    sound.playTap();
    if (isStoppedRef.current) return;
    const next = !isPaused;
    isPausedRef.current = next;
    setIsPaused(next);
    if (next) {
      addMessage('⏸️ Матч поставлен на паузу ведущим.', 'system', 'Ведущий', 'admin', false);
    } else {
      addMessage('▶️ Матч возобновлён ведущим.', 'system', 'Ведущий', 'admin', false);
    }
  };

  const handleStopMatch = () => {
    sound.playTap();
    isStoppedRef.current = true;
    setIsStopped(true);
    isPausedRef.current = false;
    setIsPaused(false);
    isSystemPausedRef.current = false;
    setIsSystemPaused(false);
    setIsAiThinking(false);
    setActiveSpeakerId(null);
    setIsWaitingForHumanSpeech(false);
    setShowHumanVotePanel(false);
    setShowNightActionModal(false);
    setPhaseText('⏹️ Матч остановлен');
    addMessage(
      '⏹️ Матч остановлен ведущим. Вы можете изучить ход игры, мысли ИИ 🧠 и журнал отладки.',
      'system',
      'Администратор',
      'admin',
      false
    );
  };

  const handleHardReset = () => {
    matchSessionIdRef.current += 1;
    isPausedRef.current = false;
    setIsPaused(false);
    isStoppedRef.current = false;
    setIsStopped(false);
    isSystemPausedRef.current = false;
    setIsSystemPaused(false);
    pendingRetryFnRef.current = null;
    setIsWaitingForHumanSpeech(false);
    setShowHumanVotePanel(false);
    setShowNightActionModal(false);

    const defaultSlots = generateDefaultAiSlots(settings.playerCount || 6);
    setSettings({
      ...settings,
      playerCount: settings.playerCount || 6,
      aiPlayers: defaultSlots,
    });
    setPlayers([]);
    playersRef.current = [];
    chatMessagesRef.current = [];
    setChatMessages([]);
    setDebugLogEntries([]);
    setDayNumber(1);
    dayNumberRef.current = 1;
    votesHistoryRef.current = [];
    setWinner(null);
    setActiveSpeakerId(null);
    setIsAiThinking(false);
    setSelectedPlayerInfo(null);
    alreadyCheckedIdsRef.current = new Set();
    sheriffHistoryRef.current = [];
    chronicleRef.current = [];
    setInLobby(true);
  };

  const handleStartGame = (newSettings: GameSettings) => {
    const currentSessionId = ++matchSessionIdRef.current;
    isPausedRef.current = false;
    setIsPaused(false);
    isStoppedRef.current = false;
    setIsStopped(false);
    setIsWaitingForHumanSpeech(false);
    setShowHumanVotePanel(false);
    setShowNightActionModal(false);

    setSettings(newSettings);
    setShowRolesToAdmin(newSettings.mode === 'watch' ? !newSettings.fogOfWar : false);
    setShowThoughts(newSettings.mode === 'watch');

    const initialPlayers = setupPlayers(newSettings);
    setPlayers(initialPlayers);
    playersRef.current = initialPlayers;
    setDayNumber(1);
    setIsNight(true);
    setPhaseText('Город засыпает...');
    chatMessagesRef.current = [];
    setChatMessages([]);
    setDebugLogEntries([]);
    setWinner(null);
    alreadyCheckedIdsRef.current = new Set();
    sheriffHistoryRef.current = [];
    chronicleRef.current = [];
    setInLobby(false);

    sound.playNight();

    if (newSettings.mode === 'watch') {
      addMessage(
        `Режим Наблюдателя. Роли участников: ${initialPlayers.map((p) => `${p.name} — ${ROLE_INFO[p.role].title}`).join('; ')}`,
        'system',
        'Администратор',
        'admin',
        false
      );
    } else {
      const human = initialPlayers.find((p) => p.isHuman);
      if (human) {
        addMessage(
          `Твоя тайная роль: ${ROLE_INFO[human.role].title} (${ROLE_INFO[human.role].desc})`,
          'system',
          'Город',
          'admin',
          false
        );
      }
    }

    addMessage('Наступает Ночь 1. Все участники засыпают...', 'system', 'Город', 'night', true);

    setTimeout(() => {
      if (matchSessionIdRef.current === currentSessionId && !isStoppedRef.current) {
        runNightSequence(initialPlayers, 1, currentSessionId);
      }
    }, 900 / speed);
  };

  // NIGHT FLOW
  const runNightSequence = async (currentPlayers: Player[], currentDay: number, sessionId: number) => {
    if (matchSessionIdRef.current !== sessionId || isStoppedRef.current) return;

    try {
      dayNumberRef.current = currentDay;
      setIsNight(true);
      setPhaseText(`🌙 Ночь #${currentDay}`);
      sound.playNight();

      const human = currentPlayers.find((p) => p.isHuman && p.isAlive);

      // 1. MAFIA ACTION
      setPhaseText(`🌙 Ночь #${currentDay}: Ход Мафии`);
      await delay(1000, sessionId);

      let chosenMafiaTarget: string | null = null;
      const livingMafia = currentPlayers.filter((p) => p.isAlive && p.role === 'mafia');

      if (livingMafia.length > 0) {
        const humanMafia = livingMafia.find((m) => m.isHuman);
        if (humanMafia) {
          // Human picks target
          setHumanNightActionRole('mafia');
          setShowNightActionModal(true);
          chosenMafiaTarget = await new Promise<string>((resolve) => {
            humanNightActionResolverRef.current = resolve;
          });
          setShowNightActionModal(false);
        } else {
          setIsAiThinking(true);
          const mafiaRes = await executeAiTurn(
            () =>
              requestMafiaNightTarget(
                livingMafia[0],
                currentPlayers,
                currentDay,
                `session-${sessionId}`,
                addLogEntry,
                settings.pressure,
                votesHistoryRef.current
              ),
            sessionId
          );
          setIsAiThinking(false);
          chosenMafiaTarget = mafiaRes.targetId;
        }

        const target = currentPlayers.find((p) => p.id === chosenMafiaTarget);
        if (target) {
          addMessage(
            `[Спецсводка]: Мафия выбрала цель: ${target.name}`,
            'system',
            'Ночной надзор',
            'night',
            false
          );
        }
      }

      // 2. DOCTOR ACTION
      const doctor = currentPlayers.find((p) => p.isAlive && p.role === 'doctor');
      let chosenDoctorTarget: string | null = null;

      if (doctor) {
        setPhaseText(`🌙 Ночь #${currentDay}: Ход Доктора`);
        await delay(1000, sessionId);

        if (doctor.isHuman) {
          setHumanNightActionRole('doctor');
          setShowNightActionModal(true);
          chosenDoctorTarget = await new Promise<string>((resolve) => {
            humanNightActionResolverRef.current = resolve;
          });
          setShowNightActionModal(false);
        } else {
          setIsAiThinking(true);
          const docRes = await executeAiTurn(
            () =>
              requestDoctorNightTarget(
                doctor,
                currentPlayers,
                currentDay,
                `session-${sessionId}`,
                addLogEntry,
                settings.pressure,
                votesHistoryRef.current
              ),
            sessionId
          );
          setIsAiThinking(false);
          chosenDoctorTarget = docRes.targetId;
        }

        const savedPlayer = currentPlayers.find((p) => p.id === chosenDoctorTarget);
        if (savedPlayer) {
          addMessage(
            `[Спецсводка]: Доктор (${doctor.name}) оказывает помощь: ${savedPlayer.name}`,
            'system',
            'Ночной надзор',
            'night',
            false
          );
        }
      }

      // 3. SHERIFF ACTION
      const sheriff = currentPlayers.find((p) => p.isAlive && p.role === 'sheriff');
      let chosenSheriffTarget: string | null = null;

      if (sheriff) {
        setPhaseText(`🌙 Ночь #${currentDay}: Проверка Шерифа`);
        await delay(1000, sessionId);

        if (sheriff.isHuman) {
          setHumanNightActionRole('sheriff');
          setShowNightActionModal(true);
          chosenSheriffTarget = await new Promise<string>((resolve) => {
            humanNightActionResolverRef.current = resolve;
          });
          setShowNightActionModal(false);
        } else {
          setIsAiThinking(true);
          const shRes = await executeAiTurn(
            () =>
              requestSheriffNightTarget(
                sheriff,
                currentPlayers,
                currentDay,
                alreadyCheckedIdsRef.current,
                `session-${sessionId}`,
                addLogEntry,
                settings.pressure,
                votesHistoryRef.current
              ),
            sessionId
          );
          setIsAiThinking(false);
          chosenSheriffTarget = shRes.targetId;
        }

        if (chosenSheriffTarget) {
          alreadyCheckedIdsRef.current.add(chosenSheriffTarget);
          const investigated = currentPlayers.find((p) => p.id === chosenSheriffTarget);
          if (investigated) {
            const isMaf = investigated.role === 'mafia';
            sheriffHistoryRef.current.push({
              targetId: investigated.id,
              targetName: investigated.name,
              isMafia: isMaf,
              nightNumber: currentDay,
            });

            if (sheriff.isHuman) {
              setHumanSheriffResult({ targetName: investigated.name, isMafia: isMaf });
            }

            addMessage(
              `[Спецсводка]: Шериф проверил ${investigated.name} — результат: ${isMaf ? 'Мафия 🔪' : 'Мирный 🕊️'}`,
              'system',
              'Ночной надзор',
              'night',
              false
            );
          }
        }
      }

      // RESOLVE NIGHT & MORNING
      await resolveNightAndWakeUp(
        currentPlayers,
        chosenMafiaTarget,
        chosenDoctorTarget,
        chosenSheriffTarget,
        currentDay,
        sessionId
      );
    } catch (err: any) {
      if (err?.message === 'MATCH_STOPPED') {
        setIsAiThinking(false);
        setActiveSpeakerId(null);
        setPhaseText('⏹️ Матч остановлен');
        return;
      }
      if (err?.message !== 'SESSION_CANCELLED') {
        console.error('Night sequence error:', err);
      }
    }
  };

  const resolveNightAndWakeUp = async (
    currentPlayers: Player[],
    curMafia: string | null,
    curDoc: string | null,
    curSheriff: string | null,
    currentDay: number,
    sessionId: number
  ) => {
    if (matchSessionIdRef.current !== sessionId || isStoppedRef.current) return;

    dayNumberRef.current = currentDay;
    setIsNight(false);
    setPhaseText(`☀️ Утро #${currentDay}: Пробуждение города`);
    sound.playMorning();
    await delay(1200, sessionId);

    const nightResult = resolveNight(curMafia, curDoc, curSheriff, currentPlayers);
    let updatedPlayers = [...currentPlayers];

    if (nightResult.savedByDoctor) {
      chronicleRef.current.push(`Ночь ${currentDay}: Доктор спас жителя от нападения Мафии.`);
      addMessage(
        'Этой ночью было совершено нападение, но благодаря Доктору жертва спасена! Потерь нет.',
        'system',
        'Город',
        'day',
        true
      );
    } else if (nightResult.killedPlayerId) {
      const victim = updatedPlayers.find((p) => p.id === nightResult.killedPlayerId);
      if (victim) {
        updatedPlayers = updatedPlayers.map((p) =>
          p.id === victim.id
            ? { ...p, isAlive: false, diedAtDay: currentDay, deathReason: 'night_kill' as const }
            : p
        );
        playersRef.current = updatedPlayers;
        setPlayers(updatedPlayers);
        chronicleRef.current.push(
          `Ночь ${currentDay}: Погиб ${victim.name} (${ROLE_INFO[victim.role].title}).`
        );
        sound.playElimination();
        addMessage(
          `Этой ночью был убит ${victim.name} (${ROLE_INFO[victim.role].title}).`,
          'system',
          'Город',
          'day',
          true
        );
      }
    } else {
      chronicleRef.current.push(`Ночь ${currentDay}: Прошла спокойно, потерь нет.`);
      addMessage('Ночь прошла спокойно. Никто не погиб.', 'system', 'Город', 'day', true);
    }

    const win = checkWinCondition(updatedPlayers);
    if (win) {
      await delay(1200, sessionId);
      setWinner(win);
      return;
    }

    await startDayDiscussion(updatedPlayers, currentDay, sessionId);
  };

  // 2-ROUND DEBATE FLOW (CLAUDE ARCHITECTURE)
  const startDayDiscussion = async (currentPlayers: Player[], currentDay: number, sessionId: number) => {
    if (matchSessionIdRef.current !== sessionId || isStoppedRef.current) return;

    try {
      dayNumberRef.current = currentDay;
      for (let round = 1; round <= 2; round++) {
        if (matchSessionIdRef.current !== sessionId || isStoppedRef.current) return;

        setPhaseText(`☀️ День #${currentDay}: Дебаты (круг ${round})`);
        addMessage(
          round === 1
            ? `💬 Начало обсуждения (круг 1). Участники выдвигают первые подозрения.`
            : `💬 Второй круг дебатов. Участники парируют обвинения и готовятся к голосованию.`,
          'system',
          'Город',
          'day',
          true
        );
        await delay(900, sessionId);

        const living = currentPlayers.filter((p) => p.isAlive);
        const speechOrder = [...living].sort(() => Math.random() - 0.5);

        for (const speaker of speechOrder) {
          if (matchSessionIdRef.current !== sessionId || isStoppedRef.current) return;
          if (!speaker.isAlive) continue;

          setActiveSpeakerId(speaker.id);

          if (speaker.isHuman) {
            // Human player turn
            setIsWaitingForHumanSpeech(true);
            const userSpeech = await new Promise<string>((resolve) => {
              humanSpeechResolverRef.current = resolve;
            });
            setIsWaitingForHumanSpeech(false);

            if (userSpeech.trim()) {
              addMessage(userSpeech.trim(), speaker.id, 'Ты', 'day', true);
              sound.playTap();
            } else {
              addMessage('(пропустил речь)', speaker.id, 'Ты', 'day', true);
            }
          } else {
            // AI player turn with thought reading
            setIsAiThinking(true);
            const res = await executeAiTurn(
              () =>
                requestDaySpeech(
                  speaker,
                  currentPlayers,
                  currentDay,
                  chatMessagesRef.current,
                  speaker.role === 'sheriff' ? sheriffHistoryRef.current : [],
                  chronicleRef.current,
                  `session-${sessionId}`,
                  addLogEntry,
                  round,
                  settings.pressure,
                  votesHistoryRef.current
                ),
              sessionId
            );
            setIsAiThinking(false);

            addMessage(res.speech, speaker.id, speaker.name, 'day', true, res.thought);
            sound.playTap();
          }

          await delay(settings.speechDelayMs || 1200, sessionId);
        }

        setActiveSpeakerId(null);
      }

      await startDayVoting(currentPlayers, currentDay, sessionId);
    } catch (err: any) {
      if (err?.message === 'MATCH_STOPPED') {
        setIsAiThinking(false);
        setActiveSpeakerId(null);
        setIsWaitingForHumanSpeech(false);
        setPhaseText('⏹️ Матч остановлен');
        return;
      }
      if (err?.message !== 'SESSION_CANCELLED') {
        console.error('Discussion error:', err);
      }
    }
  };

  // DAY VOTING FLOW
  const startDayVoting = async (currentPlayers: Player[], currentDay: number, sessionId: number) => {
    if (matchSessionIdRef.current !== sessionId || isStoppedRef.current) return;

    try {
      dayNumberRef.current = currentDay;
      setPhaseText(`🗳️ День #${currentDay}: Голосование`);
      addMessage('Жители приступают к голосованию на исключение подозреваемого.', 'system', 'Город', 'day', true);
      sound.playVote();
      await delay(1000, sessionId);

      const living = currentPlayers.filter((p) => p.isAlive);
      const votesCast: Record<string, string> = {};

      for (const voter of living) {
        if (matchSessionIdRef.current !== sessionId || isStoppedRef.current) return;
        if (!voter.isAlive) continue;

        let targetId = '';
        let targetName = '';
        let reason = '';
        let thought = '';

        if (voter.isHuman) {
          setShowHumanVotePanel(true);
          targetId = await new Promise<string>((resolve) => {
            humanVoteResolverRef.current = resolve;
          });
          setShowHumanVotePanel(false);
          const chosen = living.find((p) => p.id === targetId);
          targetName = chosen ? chosen.name : '';
          reason = 'мой выбор';
        } else {
          setIsAiThinking(true);
          const voteResult = await executeAiTurn(
            () =>
              requestDayVote(
                voter,
                currentPlayers,
                currentDay,
                chatMessagesRef.current,
                voter.role === 'sheriff' ? sheriffHistoryRef.current : [],
                chronicleRef.current,
                `session-${sessionId}`,
                addLogEntry,
                settings.pressure,
                votesHistoryRef.current
              ),
            sessionId
          );
          setIsAiThinking(false);
          targetId = voteResult.targetId;
          targetName = voteResult.targetName;
          reason = voteResult.reason;
          thought = voteResult.thought;
        }

        if (targetId) {
          votesCast[voter.id] = targetId;
          votesHistoryRef.current.push({
            dayNumber: currentDay,
            voterId: voter.id,
            voterName: voter.isHuman ? 'Ты' : voter.name,
            targetId,
            targetName,
            why: reason,
          });
          addMessage(
            `${voter.isHuman ? 'Ты голосуешь' : voter.name + ' голосует'} против ${targetName}. (${reason})`,
            voter.id,
            voter.isHuman ? 'Ты' : voter.name,
            'vote',
            true,
            thought
          );
        }
        sound.playVote();
        await delay(1000, sessionId);
      }

      setPhaseText('⚖️ Подведение итогов голосования...');
      await delay(1200, sessionId);

      const voteOutcome = resolveVotes(votesCast, currentPlayers);
      let finalPlayers = [...currentPlayers];

      if (voteOutcome.isTie || !voteOutcome.eliminatedId) {
        chronicleRef.current.push(`День ${currentDay}: Голосование завершилось вничью, никто не изгнан.`);
        addMessage('Голоса разделились поровну! Город никого не исключил.', 'system', 'Город', 'day', true);
      } else {
        const eliminated = currentPlayers.find((p) => p.id === voteOutcome.eliminatedId);
        if (eliminated) {
          // Last words before death
          if (!eliminated.isHuman) {
            setIsAiThinking(true);
            const lw = await executeAiTurn(
              () =>
                requestLastWords(
                  eliminated,
                  currentPlayers,
                  currentDay,
                  `session-${sessionId}`,
                  addLogEntry,
                  settings.pressure
                ),
              sessionId
            );
            setIsAiThinking(false);
            addMessage(`💀 Последние слова: "${lw.speech}"`, eliminated.id, eliminated.name, 'day', true, lw.thought);
            await delay(1200, sessionId);
          }

          sound.playElimination();
          finalPlayers = currentPlayers.map((p) =>
            p.id === eliminated.id
              ? { ...p, isAlive: false, diedAtDay: currentDay, deathReason: 'voted_out' as const }
              : p
          );
          playersRef.current = finalPlayers;
          setPlayers(finalPlayers);
          chronicleRef.current.push(
            `День ${currentDay}: Казнён ${eliminated.name} (${ROLE_INFO[eliminated.role].title}).`
          );
          addMessage(
            `⚰️ По решению большинства из города изгнан ${eliminated.name}! Роль: ${ROLE_INFO[eliminated.role].title}.`,
            'system',
            'Город',
            'day',
            true
          );

          const win = checkWinCondition(finalPlayers);
          if (win) {
            await delay(1000, sessionId);
            setWinner(win);
            return;
          }
        }
      }

      await delay(1800, sessionId);
      const nextDay = currentDay + 1;
      setDayNumber(nextDay);
      dayNumberRef.current = nextDay;
      runNightSequence(finalPlayers, nextDay, sessionId);
    } catch (err: any) {
      if (err?.message === 'MATCH_STOPPED') {
        setIsAiThinking(false);
        setActiveSpeakerId(null);
        setShowHumanVotePanel(false);
        setPhaseText('⏹️ Матч остановлен');
        return;
      }
      if (err?.message !== 'SESSION_CANCELLED') {
        console.error('Voting error:', err);
      }
    }
  };

  const handleAdminIntervention = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminCustomNotice.trim()) return;
    sound.playTap();
    addMessage(`[ОБЪЯВЛЕНИЕ ВЕДУЩЕГО]: ${adminCustomNotice.trim()}`, 'system', 'Администратор', 'admin', true);
    setAdminCustomNotice('');
    setShowAdminPanel(false);
  };

  if (inLobby) {
    return (
      <LobbyView
        key={`lobby-${matchSessionIdRef.current}`}
        initialSettings={settings}
        onStartGame={handleStartGame}
        onHardReset={handleHardReset}
      />
    );
  }

  const aliveCount = players.filter((p) => p.isAlive).length;

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-950 text-slate-100 font-sans select-text overflow-hidden border-x border-slate-900 shadow-2xl">
      {/* 1. TOP HEADER */}
      <header
        className={`px-3 py-2 border-b transition-colors duration-500 flex flex-col gap-1.5 shrink-0 z-20 ${
          isStopped
            ? 'bg-rose-950/90 border-rose-900/80 text-rose-200'
            : isPaused
            ? 'bg-amber-950/90 border-amber-900/80 text-amber-200'
            : isNight
            ? 'bg-slate-950/95 border-indigo-950/80 text-indigo-200'
            : 'bg-slate-900/95 border-amber-950/60 text-amber-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setInLobby(true);
              }}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-750 text-slate-300 active:scale-95 transition-all flex items-center gap-1 text-xs"
              title="Перейти в меню лобби"
            >
              <Home className="w-3.5 h-3.5" />
              <span>В лобби</span>
            </button>

            <button
              type="button"
              onClick={handleHardReset}
              className="px-2 py-1.5 rounded-lg bg-rose-950/60 border border-rose-800/50 text-rose-300 hover:bg-rose-900 active:scale-95 transition-all flex items-center gap-1 text-xs font-semibold"
              title="Полный сброс партии"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Сброс</span>
            </button>
          </div>

          {/* Phase Badge */}
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-sm ${
              isStopped
                ? 'bg-rose-950/90 border-rose-600 text-rose-300'
                : isPaused
                ? 'bg-amber-950/90 border-amber-600 text-amber-300 animate-pulse'
                : isNight
                ? 'bg-indigo-950/80 border-indigo-700/60 text-indigo-300'
                : 'bg-amber-950/80 border-amber-600/60 text-amber-300'
            }`}
          >
            {isStopped ? (
              <Square className="w-3.5 h-3.5 fill-rose-400 text-rose-400" />
            ) : isPaused ? (
              <Pause className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            ) : isNight ? (
              <Moon className="w-3.5 h-3.5" />
            ) : (
              <Sun className="w-3.5 h-3.5" />
            )}
            <span>{isStopped ? 'Матч остановлен' : isPaused ? 'Матч на паузе' : phaseText}</span>
          </div>

          {/* Controls: Mind Reading, Debug Log, Sound, Speed */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setShowThoughts(!showThoughts);
              }}
              className={`p-1.5 rounded-lg border text-xs font-bold active:scale-95 transition-all flex items-center gap-0.5 ${
                showThoughts
                  ? 'bg-purple-950/80 border-purple-600 text-purple-300 shadow-sm'
                  : 'bg-slate-800/80 border-slate-700 text-slate-500'
              }`}
              title="Чтение тайных мыслей ИИ (вкл/выкл)"
            >
              <Brain className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setShowDebugModal(true);
              }}
              className="px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-bold active:scale-95 transition-all flex items-center gap-1"
              title="Открыть журнал отладки ИИ"
            >
              <Terminal className="w-3 h-3" />
              <span>{debugLogEntries.length}</span>
            </button>

            <button
              type="button"
              onClick={toggleSound}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-750 text-slate-300 active:scale-95 transition-all"
              title="Звук"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setSpeed((prev) => (prev === 1 ? 2 : prev === 2 ? 4 : 1));
              }}
              className="px-1.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-750 text-xs font-bold text-amber-400 active:scale-95 transition-all"
              title="Скорость симуляции"
            >
              {speed === 4 ? '⚡4x' : `${speed}x`}
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex items-center justify-between text-[11px] px-1 text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="text-indigo-400 font-semibold">{settings.mode === 'play' ? 'Игрок:' : 'Обзор:'}</span>
            <span>
              В живых: <strong className="text-slate-200">{aliveCount}/{players.length}</strong>
            </span>
            <ProviderBadge compact />
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setShowRolesToAdmin(!showRolesToAdmin);
            }}
            className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
          >
            {showRolesToAdmin ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
            <span>{showRolesToAdmin ? 'Роли открыты' : 'Роли скрыты'}</span>
          </button>
        </div>
      </header>

      {/* 2. PLAYERS STRIP */}
      <div className="bg-slate-900/60 border-b border-slate-800/80 px-2 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 select-text">
        {players.map((player) => {
          const isAlive = player.isAlive;
          const isSpeaking = activeSpeakerId === player.id;
          const showRole = showRolesToAdmin || !isAlive || player.isHuman;

          return (
            <button
              key={player.id}
              type="button"
              onClick={() => {
                sound.playTap();
                setSelectedPlayerInfo(player);
              }}
              className={`flex flex-col items-center p-1.5 rounded-xl border min-w-[76px] shrink-0 transition-all text-center relative active:scale-95 ${
                !isAlive
                  ? 'bg-slate-950/40 border-slate-900 opacity-50 grayscale'
                  : isSpeaking
                  ? 'bg-amber-500/20 border-amber-500 ring-2 ring-amber-500/40 shadow-md'
                  : 'bg-slate-800/70 border-slate-700/60 hover:bg-slate-800'
              }`}
            >
              <div className="relative text-2xl leading-none my-0.5">
                <span>{player.isHuman ? '🙂' : player.avatar}</span>
                {!isAlive && (
                  <span className="absolute -bottom-1 -right-1 text-xs bg-slate-950 rounded-full px-0.5">
                    💀
                  </span>
                )}
                {isSpeaking && (
                  <span className="absolute -top-1 -right-1 text-[10px] animate-bounce">
                    💬
                  </span>
                )}
              </div>
              <span className="text-[11px] font-bold text-slate-200 truncate w-full">
                {player.name}
              </span>
              <span className="text-[9px] mt-0.5 line-clamp-1">
                {showRole ? (
                  <span className={ROLE_INFO[player.role].color}>
                    {ROLE_INFO[player.role].title}
                  </span>
                ) : (
                  <span className="text-slate-500">Скрыто</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. CENTRAL CHAT / DISCUSSION FEED */}
      <main className="flex-1 overflow-y-auto p-3 space-y-2.5 select-text">
        {/* System Pause Banner if API is unavailable */}
        {isSystemPaused && (
          <div className="p-3 rounded-2xl bg-amber-950/90 border border-amber-500/80 shadow-lg text-xs text-amber-200 flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 animate-bounce" />
              <div>
                <p className="font-bold text-amber-300">Провайдер LLM временно недоступен</p>
                <p className="text-[11px] text-amber-400/80">Все повторные попытки исчерпаны. Нажмите для повтора.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRetrySystemPause}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-md shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Повторить ход</span>
            </button>
          </div>
        )}

        {chatMessages.map((msg) => {
          const isSystem = msg.phase === 'system' || msg.phase === 'admin';
          const senderPlayer = players.find((p) => p.id === msg.senderId);
          const isCopied = copiedMsgId === msg.id;

          if (isSystem) {
            const isAdminNotice = msg.phase === 'admin' || !msg.isPublic;
            return (
              <div
                key={msg.id}
                className={`group relative my-1.5 px-3 py-2 rounded-2xl border text-xs text-center font-medium shadow-sm backdrop-blur-xs flex items-center justify-center gap-1.5 ${
                  isAdminNotice
                    ? 'bg-indigo-950/80 border-indigo-700/70 text-indigo-200'
                    : 'bg-slate-900/80 border-slate-800/70 text-slate-300'
                }`}
              >
                {isAdminNotice ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                <span className="select-text">{msg.text}</span>
                <button
                  type="button"
                  onClick={() => handleCopyMessage(msg.id, msg.text)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity ml-1.5 p-0.5 rounded text-slate-400 hover:text-white"
                  title="Скопировать текст сообщения"
                >
                  {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            );
          }

          return (
            <div key={msg.id} className="group flex items-start gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-lg shrink-0 shadow-sm">
                {senderPlayer?.isHuman ? '🙂' : senderPlayer?.avatar || '👤'}
              </div>
              <div className="relative max-w-[85%] rounded-2xl rounded-tl-none px-3.5 py-2 text-xs shadow-sm bg-slate-900 border border-slate-800 text-slate-200">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-slate-300 select-text">
                      {msg.senderName}
                    </span>
                    {senderPlayer && (
                      <>
                        {(showRolesToAdmin || !senderPlayer.isAlive || senderPlayer.isHuman) && (
                          <span className={`text-[9px] font-semibold ${ROLE_INFO[senderPlayer.role].color}`}>
                            [{ROLE_INFO[senderPlayer.role].title}]
                          </span>
                        )}
                        <span className="text-[9px] text-slate-500">
                          • {senderPlayer.personality}
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyMessage(msg.id, msg.text)}
                    className="p-1 rounded bg-slate-800/60 hover:bg-slate-750 text-slate-400 hover:text-white active:scale-90 transition-all shrink-0"
                    title="Скопировать реплику"
                  >
                    {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>

                <p className="leading-relaxed whitespace-pre-wrap select-text">{msg.text}</p>

                {/* 🧠 MIND READING (Claude feature: peek into AI inner monologue) */}
                {showThoughts && msg.thought && (
                  <div className="mt-1.5 text-[11px] text-purple-300/90 italic bg-purple-950/40 border border-purple-800/40 rounded-xl p-2 select-text animate-in fade-in">
                    <span className="font-semibold text-purple-400 not-italic">🧠 Мысль ИИ: </span>
                    <span>{msg.thought}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* AI Thinking Indicator */}
        {isAiThinking && (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
            <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs">
              🤖
            </div>
            <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              <span>ИИ обдумывает ход и анализирует дебаты...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </main>

      {/* 4. HUMAN PLAYER INTERACTION BAR (When human plays) */}
      {isWaitingForHumanSpeech && (
        <div className="p-2.5 bg-rose-950/90 border-t border-rose-800 backdrop-blur-md shrink-0 flex items-center gap-2 animate-in slide-in-from-bottom-2">
          <input
            type="text"
            value={humanSpeechText}
            onChange={(e) => setHumanSpeechText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && humanSpeechResolverRef.current) {
                humanSpeechResolverRef.current(humanSpeechText);
                setHumanSpeechText('');
              }
            }}
            placeholder="Твой ход! Выскажись в чат..."
            className="flex-1 bg-slate-900 border border-rose-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 outline-none focus:border-amber-400"
            autoFocus
          />
          <button
            type="button"
            onClick={() => {
              if (humanSpeechResolverRef.current) {
                humanSpeechResolverRef.current(humanSpeechText);
                setHumanSpeechText('');
              }
            }}
            className="px-3 py-2 rounded-xl bg-rose-600 text-white font-bold text-xs active:scale-95 transition-all shadow-md"
            title="Отправить реплику"
          >
            <Send className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (humanSpeechResolverRef.current) {
                humanSpeechResolverRef.current('');
                setHumanSpeechText('');
              }
            }}
            className="px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold active:scale-95"
            title="Пропустить речь"
          >
            <FastForward className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 5. HUMAN VOTING PANEL */}
      {showHumanVotePanel && (
        <div className="p-3 bg-indigo-950/90 border-t border-indigo-800 backdrop-blur-md shrink-0 space-y-2 animate-in slide-in-from-bottom-2">
          <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
            <span>🗳️ Твой голос: кого ты хочешь казнить?</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
            {players
              .filter((p) => p.isAlive && !p.isHuman)
              .map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    if (humanVoteResolverRef.current) {
                      humanVoteResolverRef.current(candidate.id);
                    }
                  }}
                  className="py-2 px-2.5 rounded-xl bg-slate-900 border border-slate-750 hover:border-amber-500 text-slate-200 text-xs font-bold text-left flex items-center gap-2 active:scale-95 transition-all"
                >
                  <span className="text-lg">{candidate.avatar}</span>
                  <span className="truncate">{candidate.name}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* 6. BOTTOM ADMIN CONTROL BAR */}
      {!isWaitingForHumanSpeech && !showHumanVotePanel && (
        <footer className="p-2.5 bg-slate-950/95 border-t border-slate-900 backdrop-blur-md shrink-0">
          {showAdminPanel ? (
            <form onSubmit={handleAdminIntervention} className="space-y-2">
              <div className="flex items-center justify-between text-xs text-indigo-300">
                <span className="font-semibold">Объявление ведущего в чат:</span>
                <button
                  type="button"
                  onClick={() => setShowAdminPanel(false)}
                  className="text-slate-400 hover:text-white text-[11px]"
                >
                  Отмена
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={adminCustomNotice}
                  onChange={(e) => setAdminCustomNotice(e.target.value)}
                  placeholder="Сделать объявление ведущего..."
                  className="flex-1 bg-slate-900 border border-indigo-800/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!adminCustomNotice.trim()}
                  className="p-2.5 rounded-xl bg-indigo-600 disabled:opacity-40 text-white font-bold active:scale-95 transition-all shadow-md"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isStopped
                      ? 'bg-rose-500'
                      : isPaused
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-emerald-400 animate-pulse'
                  }`}
                />
                <span className="text-[11px] text-slate-300 truncate">
                  {isStopped ? 'Матч остановлен' : isPaused ? 'На паузе' : 'Матч идёт'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Pause / Resume */}
                {!isStopped && (
                  <button
                    type="button"
                    onClick={togglePause}
                    className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all ${
                      isPaused
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                        : 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                    }`}
                    title={isPaused ? 'Возобновить игру' : 'Поставить игру на паузу'}
                  >
                    {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
                    <span>{isPaused ? 'Продолжить' : 'Пауза'}</span>
                  </button>
                )}

                {/* Real STOP MATCH: halts in place */}
                {!isStopped ? (
                  <button
                    type="button"
                    onClick={handleStopMatch}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 hover:bg-rose-900 active:scale-95 text-[11px] font-bold flex items-center gap-1 transition-all"
                    title="Остановить матч на месте (не выходит в лобби)"
                  >
                    <Square className="w-3 h-3 fill-rose-300" />
                    <span>Стоп матч</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStartGame(settings)}
                    className="px-2.5 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black active:scale-95 text-[11px] flex items-center gap-1 shadow-md shadow-amber-500/20"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Начать заново</span>
                  </button>
                )}

                {/* Custom Admin Announcement */}
                <button
                  type="button"
                  onClick={() => setShowAdminPanel(true)}
                  className="text-[11px] px-2 py-1.5 rounded-xl bg-indigo-950/70 border border-indigo-800 text-indigo-300 hover:bg-indigo-900 active:scale-95"
                  title="Написать объявление в чат"
                >
                  Чат
                </button>
              </div>
            </div>
          )}
        </footer>
      )}

      {/* 7. PLAYER DETAILS SHEET */}
      {selectedPlayerInfo && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs flex items-end justify-center p-3 select-text">
          <div className="bg-slate-900 border border-slate-750 w-full max-w-sm rounded-3xl p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-3xl">{selectedPlayerInfo.isHuman ? '🙂' : selectedPlayerInfo.avatar}</span>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                    {selectedPlayerInfo.name}
                    {selectedPlayerInfo.isHuman && <span className="text-[10px] text-emerald-400 font-bold">(Ты)</span>}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {selectedPlayerInfo.isAlive ? 'В живых' : 'Погиб'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlayerInfo(null)}
                className="p-1 rounded-full bg-slate-800 text-slate-400 hover:text-white"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs bg-slate-950 p-3 rounded-2xl border border-slate-800/80 mb-3 select-text">
              <div>
                <span className="text-slate-500 font-semibold block text-[10px] uppercase tracking-wider">
                  Характер поведения:
                </span>
                <span className="text-slate-200 font-medium select-text">{selectedPlayerInfo.personality}</span>
              </div>
              {selectedPlayerInfo.beliefs && (
                <div>
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase tracking-wider">
                    Убеждения:
                  </span>
                  <span className="text-slate-300 select-text">{selectedPlayerInfo.beliefs}</span>
                </div>
              )}
              {selectedPlayerInfo.style && (
                <div>
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase tracking-wider">
                    Манера речи:
                  </span>
                  <span className="text-slate-300 select-text">{selectedPlayerInfo.style}</span>
                </div>
              )}
              <div>
                <span className="text-slate-500 font-semibold block text-[10px] uppercase tracking-wider">
                  Роль:
                </span>
                <RoleBadge role={selectedPlayerInfo.role} size="sm" />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedPlayerInfo(null)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-750 rounded-xl font-bold text-xs text-slate-200 active:scale-95"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* 8. NIGHT ACTION MODAL (FOR HUMAN PLAYER) */}
      {showNightActionModal && (
        <NightActionModal
          role={humanNightActionRole}
          livingPlayers={players.filter((p) => p.isAlive)}
          userId="human"
          onConfirmAction={(targetId) => {
            if (humanNightActionResolverRef.current) {
              humanNightActionResolverRef.current(targetId);
            }
          }}
          sheriffResult={humanSheriffResult}
          onDismissSheriffResult={() => setHumanSheriffResult(null)}
        />
      )}

      {/* 9. DEBUG LOG MODAL */}
      {showDebugModal && (
        <DebugLogModal
          entries={debugLogEntries}
          players={players}
          chronicle={chronicleRef.current}
          chatMessages={chatMessages}
          onClose={() => setShowDebugModal(false)}
          onClear={() => setDebugLogEntries([])}
        />
      )}

      {/* 10. GAME OVER MODAL */}
      {winner && (
        <GameOverModal
          winner={winner}
          players={players}
          dayNumber={dayNumber}
          onRestart={() => handleStartGame(settings)}
          onLobby={() => setInLobby(true)}
          onOpenDebugLogs={() => setShowDebugModal(true)}
        />
      )}
    </div>
  );
}
