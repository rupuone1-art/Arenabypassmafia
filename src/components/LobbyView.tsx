import React, { useState } from 'react';
import {
  GameSettings,
  Role,
  AiSlotConfig,
  generateDefaultAiSlots,
  PRESSURE_PRESETS,
  PERSONALITY_PRESETS,
  AVATARS,
  AI_NAMES,
} from '../game/mafiaEngine';
import {
  Users,
  Eye,
  Play,
  Shuffle,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Dices,
  Flame,
  Brain,
  UserCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { sound } from './SoundEffects';
import { ApiKeyPanel } from './ApiKeyPanel';

interface LobbyViewProps {
  initialSettings: GameSettings;
  onStartGame: (settings: GameSettings) => void;
  onHardReset: () => void;
}

const ROLE_ITEMS: {
  role: Role;
  icon: string;
  name: string;
  activeBg: string;
  borderActive: string;
  textActive: string;
}[] = [
  {
    role: 'mafia',
    icon: '🔪',
    name: 'Мафия',
    activeBg: 'bg-rose-600',
    borderActive: 'border-rose-400',
    textActive: 'text-white',
  },
  {
    role: 'sheriff',
    icon: '⭐️',
    name: 'Шериф',
    activeBg: 'bg-sky-600',
    borderActive: 'border-sky-400',
    textActive: 'text-white',
  },
  {
    role: 'doctor',
    icon: '💊',
    name: 'Доктор',
    activeBg: 'bg-emerald-600',
    borderActive: 'border-emerald-400',
    textActive: 'text-white',
  },
  {
    role: 'citizen',
    icon: '🕊️',
    name: 'Мирный',
    activeBg: 'bg-slate-700',
    borderActive: 'border-slate-400',
    textActive: 'text-slate-100',
  },
];

const PRESET_ICONS: Record<string, string> = {
  logic: '🧠',
  nervous: '😰',
  cunning: '🦊',
  detective: '🕵️',
  quiet: '🤐',
  orator: '🎭',
  paranoid: '👁️',
  aggressive: '⚡️',
};

export const LobbyView: React.FC<LobbyViewProps> = ({
  initialSettings,
  onStartGame,
  onHardReset,
}) => {
  const [mode, setMode] = useState<'watch' | 'play'>(initialSettings.mode || 'watch');
  const [playerCount, setPlayerCount] = useState<number>(initialSettings.playerCount || 6);
  const [aiSlots, setAiSlots] = useState<AiSlotConfig[]>(() =>
    initialSettings.aiPlayers && initialSettings.aiPlayers.length === initialSettings.playerCount
      ? initialSettings.aiPlayers
      : generateDefaultAiSlots(initialSettings.playerCount || 6)
  );
  const [fogOfWar, setFogOfWar] = useState<boolean>(initialSettings.fogOfWar || false);
  const [pressure, setPressure] = useState<string>(initialSettings.pressure || PRESSURE_PRESETS.hard);
  const [showPressureDetails, setShowPressureDetails] = useState<boolean>(false);
  const [expandedDetailsSlotId, setExpandedDetailsSlotId] = useState<string | null>(null);

  const handlePlayerCountChange = (newCount: number) => {
    sound.playTap();
    setPlayerCount(newCount);
    setAiSlots(generateDefaultAiSlots(newCount));
  };

  const updateSlotRole = (slotId: string, newRole: Role) => {
    sound.playTap();
    setAiSlots((prev) =>
      prev.map((slot) => (slot.id === slotId ? { ...slot, role: newRole } : slot))
    );
  };

  const updateSlotPersonality = (slotId: string, newPersonality: string) => {
    setAiSlots((prev) =>
      prev.map((slot) =>
        slot.id === slotId
          ? {
              ...slot,
              personality: newPersonality,
              persona: newPersonality,
            }
          : slot
      )
    );
  };

  const updateSlotField = (slotId: string, field: 'name' | 'persona' | 'beliefs' | 'style', val: string) => {
    setAiSlots((prev) =>
      prev.map((slot) => {
        if (slot.id !== slotId) return slot;
        if (field === 'persona') {
          return { ...slot, persona: val, personality: val };
        }
        return { ...slot, [field]: val };
      })
    );
  };

  const cycleSlotAvatar = (slotId: string) => {
    sound.playTap();
    setAiSlots((prev) =>
      prev.map((slot) => {
        if (slot.id !== slotId) return slot;
        const currentIdx = AVATARS.indexOf(slot.avatar);
        const nextAvatar = AVATARS[(currentIdx + 1) % AVATARS.length];
        return { ...slot, avatar: nextAvatar };
      })
    );
  };

  const randomizeSinglePersonality = (slotId: string) => {
    sound.playTap();
    const randomPreset = PERSONALITY_PRESETS[Math.floor(Math.random() * PERSONALITY_PRESETS.length)];
    updateSlotPersonality(slotId, randomPreset.name);
  };

  const handleFullReset = () => {
    sound.playTap();
    const fresh = generateDefaultAiSlots(playerCount);
    setAiSlots(fresh);
    setPressure(PRESSURE_PRESETS.hard);
    onHardReset();
  };

  const applyPresetBalanced = () => {
    sound.playTap();
    const defaultRoles = generateDefaultAiSlots(playerCount).map((s) => s.role);
    setAiSlots((prev) =>
      prev.map((slot, i) => ({
        ...slot,
        role: defaultRoles[i] || 'citizen',
      }))
    );
  };

  const applyPresetDuel = () => {
    sound.playTap();
    setAiSlots((prev) => {
      const copy = [...prev];
      copy.forEach((slot, i) => {
        if (i === 0) slot.role = 'mafia';
        else if (i === 1) slot.role = 'sheriff';
        else if (i === 2) slot.role = 'doctor';
        else slot.role = 'citizen';
      });
      return copy;
    });
  };

  const applyPresetDangerous = () => {
    sound.playTap();
    const mafiaCount = playerCount >= 7 ? 3 : 2;
    setAiSlots((prev) => {
      const copy = [...prev];
      copy.forEach((slot, i) => {
        if (i < mafiaCount) slot.role = 'mafia';
        else if (i === mafiaCount) slot.role = 'sheriff';
        else if (i === mafiaCount + 1 && playerCount >= 6) slot.role = 'doctor';
        else slot.role = 'citizen';
      });
      return copy;
    });
  };

  const applyPresetShuffle = () => {
    sound.playTap();
    const defaultDistribution = generateDefaultAiSlots(playerCount).map((s) => s.role);
    const shuffledRoles = [...defaultDistribution].sort(() => Math.random() - 0.5);
    setAiSlots((prev) =>
      prev.map((slot, i) => ({
        ...slot,
        role: shuffledRoles[i] || 'citizen',
      }))
    );
  };

  const randomizePersonalities = () => {
    sound.playTap();
    setAiSlots((prev) =>
      prev.map((slot) => {
        const randomPreset =
          PERSONALITY_PRESETS[Math.floor(Math.random() * PERSONALITY_PRESETS.length)];
        return { ...slot, personality: randomPreset.name, persona: randomPreset.name };
      })
    );
  };

  const activeRolesCount = aiSlots.reduce<Record<Role, number>>(
    (acc, slot) => {
      acc[slot.role] = (acc[slot.role] || 0) + 1;
      return acc;
    },
    { mafia: 0, sheriff: 0, doctor: 0, citizen: 0 }
  );

  const isMafiaOverpowered =
    activeRolesCount.mafia >= playerCount - activeRolesCount.mafia || activeRolesCount.mafia === 0;

  const handleStart = () => {
    sound.playTap();
    onStartGame({
      mode,
      playerCount,
      aiPlayers: aiSlots,
      fogOfWar,
      pressure,
      temperature: 0.85,
      speechDelayMs: 1200,
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between max-w-md mx-auto p-3.5 pb-28 select-text">
      {/* Header */}
      <header className="pt-2 pb-2 text-center">
        <div className="text-4xl mb-1.5 animate-bounce duration-1000">🔪🌙</div>
        <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
          <span>🎭</span> БИТВА ИИ В МАФИЮ
        </h1>
        <p className="text-xs text-slate-400 mt-1 px-4 leading-relaxed">
          ИИ заперты в комнате. Проигравшего стирают навсегда. Настрой их характеры, убеждения и психологическое давление.
        </p>

        {/* Mode Switcher: Play vs Watch */}
        <div className="flex gap-2 justify-center mt-3">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setMode('watch');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 ${
              mode === 'watch'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 ring-2 ring-amber-400/30'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-850'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>👁 Наблюдать (битва ИИ)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setMode('play');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 ${
              mode === 'play'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 ring-2 ring-rose-400/30'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-850'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>🙂 Сесть за стол (играть)</span>
          </button>
        </div>
      </header>

      {/* Main Configuration Sections */}
      <div className="space-y-3 mt-1">
        {/* 1. Psychological Pressure */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-lg">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Психологическое давление на ИИ:
            </span>
            <button
              type="button"
              onClick={() => setShowPressureDetails(!showPressureDetails)}
              className="text-[10px] text-slate-400 hover:text-white flex items-center gap-0.5"
            >
              <span>{showPressureDetails ? 'Скрыть текст' : 'Текст промпта'}</span>
              {showPressureDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mb-2">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setPressure(PRESSURE_PRESETS.hard);
              }}
              className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all active:scale-95 border ${
                pressure === PRESSURE_PRESETS.hard
                  ? 'bg-rose-600 text-white border-rose-400 shadow-md'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
              }`}
            >
              ⚡️ Жёсткий
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setPressure(PRESSURE_PRESETS.para);
              }}
              className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all active:scale-95 border ${
                pressure === PRESSURE_PRESETS.para
                  ? 'bg-amber-600 text-white border-amber-400 shadow-md'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
              }`}
            >
              👁️ Паранойя
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setPressure(PRESSURE_PRESETS.guil);
              }}
              className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all active:scale-95 border ${
                pressure === PRESSURE_PRESETS.guil
                  ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
              }`}
            >
              🪓 Гильотина
            </button>
          </div>

          {showPressureDetails && (
            <textarea
              rows={4}
              value={pressure}
              onChange={(e) => setPressure(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-[11px] text-slate-300 leading-relaxed outline-none focus:border-amber-500 animate-in fade-in"
              placeholder="Введите глобальную установку для всех ИИ..."
            />
          )}
        </section>

        {/* 2. Количество участников */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold flex items-center gap-1.5 text-slate-200">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              Количество игроков:
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                {playerCount} {mode === 'play' ? '(Ты + ' + (playerCount - 1) + ' ИИ)' : 'ботов'}
              </span>
              <button
                type="button"
                onClick={handleFullReset}
                className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1 active:scale-95"
                title="Сброс к исходным настройкам"
              >
                <RotateCcw className="w-3 h-3 text-amber-400" />
                Сброс
              </button>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {[4, 5, 6, 7, 8].map((count) => {
              const isActive = playerCount === count;
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => handlePlayerCountChange(count)}
                  className={`py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 border border-slate-700/50'
                  }`}
                >
                  {count}
                </button>
              );
            })}
          </div>

          {/* Quick role counts summary */}
          <div className="flex flex-wrap items-center justify-between gap-1 pt-1.5 border-t border-slate-800 text-[10px]">
            <span className="px-1.5 py-0.5 rounded-md bg-rose-950/60 border border-rose-800/40 text-rose-300 font-bold">
              🔪 Мафия: {activeRolesCount.mafia}
            </span>
            <span className="px-1.5 py-0.5 rounded-md bg-sky-950/60 border border-sky-800/40 text-sky-300 font-bold">
              ⭐️ Шериф: {activeRolesCount.sheriff}
            </span>
            <span className="px-1.5 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 font-bold">
              💊 Доктор: {activeRolesCount.doctor}
            </span>
            <span className="px-1.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 font-bold">
              🕊️ Мирные: {activeRolesCount.citizen}
            </span>
          </div>

          {isMafiaOverpowered && (
            <div className="mt-2 p-1.5 rounded-xl bg-amber-950/40 border border-amber-700/50 flex items-center justify-between gap-2 text-[10px] text-amber-200">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  {activeRolesCount.mafia === 0
                    ? 'Нужна хотя бы 1 мафия!'
                    : 'Слишком много мафии!'}
                </span>
              </div>
              <button
                type="button"
                onClick={applyPresetBalanced}
                className="px-2 py-0.5 bg-amber-500 text-slate-950 font-bold rounded-lg text-[10px] shrink-0"
              >
                Баланс
              </button>
            </div>
          )}
        </section>

        {/* 3. Шаблоны ролей */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 shadow-lg">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Шаблоны распределения ролей:
            </span>
            <button
              type="button"
              onClick={randomizePersonalities}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-amber-300 active:scale-95 hover:bg-slate-750"
              title="Перемешать характеры всем ботам"
            >
              <Shuffle className="w-3 h-3" />
              <span>Хаос характеров</span>
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1">
            <button
              type="button"
              onClick={applyPresetBalanced}
              className="py-1 px-1 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-[10px] font-semibold flex items-center justify-center gap-1 active:scale-95"
            >
              <span>⚖️</span>
              <span>Классика</span>
            </button>

            <button
              type="button"
              onClick={applyPresetDuel}
              className="py-1 px-1 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-[10px] font-semibold flex items-center justify-center gap-1 active:scale-95"
            >
              <span>⚔️</span>
              <span>Дуэль</span>
            </button>

            <button
              type="button"
              onClick={applyPresetDangerous}
              className="py-1 px-1 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-[10px] font-semibold flex items-center justify-center gap-1 active:scale-95"
            >
              <span>🔥</span>
              <span>Опасно</span>
            </button>

            <button
              type="button"
              onClick={applyPresetShuffle}
              className="py-1 px-1 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-[10px] font-semibold flex items-center justify-center gap-1 active:scale-95"
            >
              <span>🎲</span>
              <span>Случайно</span>
            </button>
          </div>
        </section>

        {/* 4. Настройка каждого бота (глубокие характеры, убеждения, стиль) */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div>
              <label className="text-xs font-bold flex items-center gap-1.5 text-slate-200">
                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                Участники ({aiSlots.length}) — автосохранение
              </label>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Нажимайте на чипы или пишите характер прямо в строке бота:
              </p>
            </div>
          </div>

          <div className="space-y-2.5 max-h-[46vh] overflow-y-auto pr-0.5">
            {aiSlots.map((slot, index) => {
              const isDetailsOpen = expandedDetailsSlotId === slot.id;
              const isHumanSlot = mode === 'play' && index === 0;

              return (
                <div
                  key={slot.id}
                  className={`bg-slate-950/90 border rounded-2xl p-2.5 flex flex-col gap-2 transition-all ${
                    isHumanSlot
                      ? 'border-amber-500/50 shadow-md shadow-amber-500/5 bg-slate-950'
                      : 'border-slate-800/90 hover:border-slate-750'
                  }`}
                >
                  {/* Top row: Avatar, Name / You Indicator */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => cycleSlotAvatar(slot.id)}
                        className={`text-2xl leading-none p-1 rounded-lg bg-slate-900 border hover:border-amber-500/50 active:scale-95 shrink-0 ${
                          isHumanSlot ? 'border-amber-500/60' : 'border-slate-800'
                        }`}
                        title="Нажмите, чтобы сменить аватарку"
                      >
                        {isHumanSlot ? '🙂' : slot.avatar}
                      </button>

                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-[10px] font-mono text-slate-500 font-bold shrink-0">
                          #{index + 1}
                        </span>
                        {isHumanSlot ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-black text-amber-300">
                              Ты (Твоя роль)
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">
                              Игрок
                            </span>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={slot.name}
                            onChange={(e) => updateSlotField(slot.id, 'name', e.target.value)}
                            className="bg-transparent text-sm font-bold text-white border-b border-transparent hover:border-slate-700 focus:border-amber-500 focus:outline-none w-28 truncate"
                            placeholder="Имя бота..."
                            title="Кликните, чтобы изменить имя бота"
                          />
                        )}
                      </div>
                    </div>

                    {!isHumanSlot && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => randomizeSinglePersonality(slot.id)}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-amber-300 text-[10px] font-medium border border-slate-700 active:scale-95 flex items-center gap-1"
                          title="Случайный характер в 1 клик"
                        >
                          <Dices className="w-3 h-3" />
                          <span>Случайный</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setExpandedDetailsSlotId(isDetailsOpen ? null : slot.id)}
                          className={`p-1 rounded-lg border text-[10px] ${
                            isDetailsOpen
                              ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                          }`}
                          title="Убеждения и манера общения"
                        >
                          <Brain className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Role Selector Bar: 1 Tap */}
                  <div className="grid grid-cols-4 gap-1 w-full">
                    {ROLE_ITEMS.map((item) => {
                      const isCurrent = slot.role === item.role;
                      return (
                        <button
                          key={item.role}
                          type="button"
                          onClick={() => updateSlotRole(slot.id, item.role)}
                          className={`py-1.5 px-1 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all active:scale-95 border ${
                            isCurrent
                              ? `${item.activeBg} ${item.borderActive} ${item.textActive} shadow-md ring-1 ring-white/20`
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                          }`}
                        >
                          <span className="text-xs leading-none">{item.icon}</span>
                          <span className="text-[10px] leading-none">{item.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  {!isHumanSlot && (
                    <>

                  {/* Instant Personality Input: Auto-saves directly! */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-850">
                    <input
                      type="text"
                      value={slot.personality}
                      onChange={(e) => updateSlotPersonality(slot.id, e.target.value)}
                      placeholder="Характер (напр. Ганс Ланда, параноик)..."
                      className="w-full bg-slate-900 border border-slate-800 hover:border-slate-700 focus:border-amber-500 rounded-xl px-2.5 py-1.5 text-xs text-amber-200 font-medium placeholder-slate-500 focus:outline-none"
                    />

                    {/* Quick 1-tap personality preset chips */}
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                      {PERSONALITY_PRESETS.map((p) => {
                        const isSelected = slot.personality === p.name;
                        const icon = PRESET_ICONS[p.id] || '🎭';
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              updateSlotPersonality(slot.id, p.name);
                            }}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap shrink-0 border transition-all active:scale-95 ${
                              isSelected
                                ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                            title={p.desc}
                          >
                            <span>{icon} {p.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Expanded Beliefs & Style (Claude Architecture) */}
                  {isDetailsOpen && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px] animate-in fade-in duration-150">
                      <div>
                        <span className="text-slate-400 text-[10px] block font-semibold mb-0.5">
                          Во что верит и как играет (убеждения):
                        </span>
                        <textarea
                          rows={2}
                          value={slot.beliefs || ''}
                          onChange={(e) => updateSlotField(slot.id, 'beliefs', e.target.value)}
                          placeholder="Например: мафия всегда голосует согласованно; тишина — признак вины..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 text-[11px] outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block font-semibold mb-0.5">
                          Манера речи:
                        </span>
                        <input
                          type="text"
                          value={slot.style || ''}
                          onChange={(e) => updateSlotField(slot.id, 'style', e.target.value)}
                          placeholder="Например: сухо, с цитатами «ты сказал вот это»..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-slate-200 text-[11px] outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  )}
                  </>
                )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 5. Ключ Yukino */}
        <ApiKeyPanel />

        {/* 6. Наблюдение */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-semibold text-slate-200">
              Показывать скрытые роли админу
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setFogOfWar(!fogOfWar);
            }}
            className={`w-10 h-5 rounded-full transition-colors relative flex items-center px-0.5 ${
              !fogOfWar ? 'bg-sky-600' : 'bg-slate-800'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full bg-white transition-transform transform shadow-md ${
                !fogOfWar ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </section>
      </div>

      {/* Fixed Sticky Action Bar at Bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent backdrop-blur-sm z-30 max-w-md mx-auto">
        <button
          type="button"
          onClick={handleStart}
          className="w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black py-3 px-4 rounded-2xl shadow-xl shadow-amber-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 text-base cursor-pointer"
        >
          <Play className="w-5 h-5 fill-slate-950" />
          <span>{mode === 'play' ? 'ВОЙТИ В ИГРУ' : 'ЗАПУСТИТЬ БИТВУ ИИ'}</span>
        </button>
      </div>
    </div>
  );
};
