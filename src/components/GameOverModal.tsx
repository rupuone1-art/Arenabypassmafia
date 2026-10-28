import React from 'react';
import { Player, Role } from '../game/mafiaEngine';
import { RoleBadge } from './RoleBadge';
import { Trophy, RotateCcw, Home, Skull, Shield } from 'lucide-react';
import { sound } from './SoundEffects';

interface GameOverModalProps {
  winner: 'mafia' | 'citizens';
  players: Player[];
  dayNumber: number;
  onRestart: () => void;
  onLobby: () => void;
  onOpenDebugLogs?: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winner,
  players,
  dayNumber,
  onRestart,
  onLobby,
  onOpenDebugLogs,
}) => {
  const isMafiaWin = winner === 'mafia';

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-750 w-full max-w-sm rounded-3xl p-5 shadow-2xl flex flex-col max-h-[90vh] select-text">
        {/* Banner */}
        <div className="text-center pb-3">
          <div
            className={`w-16 h-16 mx-auto rounded-3xl flex items-center justify-center mb-2 shadow-lg ${
              isMafiaWin
                ? 'bg-rose-950/80 border border-rose-600/60 text-rose-400 shadow-rose-900/30'
                : 'bg-amber-950/80 border border-amber-600/60 text-amber-400 shadow-amber-900/30'
            }`}
          >
            {isMafiaWin ? <Skull className="w-8 h-8" /> : <Trophy className="w-8 h-8" />}
          </div>
          <h2 className="text-xl font-black text-white">
            {isMafiaWin ? 'ПОБЕДА МАФИИ!' : 'ПОБЕДА ГОРОДА!'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {isMafiaWin
              ? 'Мафия захватила контроль над городом.'
              : 'Все члены мафии были вычислены и устранены!'}
          </p>
          <div className="text-[11px] text-slate-400 mt-1">
            Партия продлилась: {dayNumber} {dayNumber === 1 ? 'день' : dayNumber < 5 ? 'дня' : 'дней'}
          </div>
        </div>

        {/* Players reveal list */}
        <div className="text-xs font-semibold text-slate-400 mb-1.5 px-1 flex justify-between">
          <span>Раскрытие ролей:</span>
          <span>Статус</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 mb-3">
          {players.map((player) => (
            <div
              key={player.id}
              className={`flex items-center justify-between p-2.5 rounded-2xl border ${
                player.isAlive
                  ? 'bg-slate-950/80 border-slate-800'
                  : 'bg-slate-950/40 border-slate-900 opacity-70'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{player.avatar}</span>
                <div>
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    {player.name}
                    {player.isHuman && (
                      <span className="text-[10px] text-emerald-400">(Вы)</span>
                    )}
                  </div>
                  <div className="mt-0.5">
                    <RoleBadge role={player.role} size="sm" />
                  </div>
                </div>
              </div>

              <div>
                {player.isAlive ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 font-medium">
                    Выжил
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-950/60 border border-rose-800/40 text-rose-400 font-medium">
                    Погиб
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          {onOpenDebugLogs && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onOpenDebugLogs();
              }}
              className="w-full py-2.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-200 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <span>📋</span>
              <span>Скопировать весь лог отладки партии</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onLobby();
              }}
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-750 font-bold text-xs active:scale-95 transition-all"
            >
              <Home className="w-4 h-4 text-slate-400" />
              <span>Настройки</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onRestart();
              }}
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs active:scale-95 transition-all shadow-md shadow-amber-500/20"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Реванш</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
