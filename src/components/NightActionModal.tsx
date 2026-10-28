import React, { useState } from 'react';
import { Player, Role } from '../game/mafiaEngine';
import { RoleBadge, ROLE_INFO } from './RoleBadge';
import { Moon, Check, Skull, Shield, HeartPulse } from 'lucide-react';
import { sound } from './SoundEffects';

interface NightActionModalProps {
  role: Role;
  livingPlayers: Player[];
  userId: string;
  onConfirmAction: (targetId: string) => void;
  sheriffResult?: { targetName: string; isMafia: boolean } | null;
  onDismissSheriffResult?: () => void;
}

export const NightActionModal: React.FC<NightActionModalProps> = ({
  role,
  livingPlayers,
  userId,
  onConfirmAction,
  sheriffResult,
  onDismissSheriffResult,
}) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');

  // Mafia cannot shoot other mafia
  // Sheriff cannot check self
  const candidates = livingPlayers.filter(p => {
    if (role === 'mafia') {
      return p.role !== 'mafia'; // only shoot non-mafia
    }
    if (role === 'sheriff') {
      return p.id !== userId; // cannot check yourself
    }
    return true; // doctor can heal anyone including self
  });

  const getActionPrompt = () => {
    if (role === 'mafia') {
      return {
        title: 'Ночной выстрел Мафии',
        desc: 'Выберите мирного жителя для ликвидации:',
        icon: Skull,
        color: 'text-rose-400',
        btnText: 'Ликвидировать цель',
        btnColor: 'bg-rose-600 hover:bg-rose-500 text-white',
      };
    }
    if (role === 'doctor') {
      return {
        title: 'Помощь Доктора',
        desc: 'Выберите игрока, которого вы защитите этой ночью:',
        icon: HeartPulse,
        color: 'text-emerald-400',
        btnText: 'Защитить игрока',
        btnColor: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      };
    }
    return {
      title: 'Проверка Шерифа',
      desc: 'Выберите подозреваемого для проверки роли:',
      icon: Shield,
      color: 'text-sky-400',
      btnText: 'Проверить досье',
      btnColor: 'bg-sky-600 hover:bg-sky-500 text-white',
    };
  };

  const action = getActionPrompt();
  const Icon = action.icon;

  if (sheriffResult) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl p-5 shadow-2xl text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-sky-950/60 border border-sky-600/40 flex items-center justify-center mb-3">
            <Shield className="w-7 h-7 text-sky-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">Результат расследования</h3>
          <p className="text-xs text-slate-400 mb-4">Шериф тайно проверил подозреваемого</p>

          <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 mb-4">
            <div className="text-base font-semibold text-slate-200 mb-1">
              {sheriffResult.targetName}
            </div>
            {sheriffResult.isMafia ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-600 text-rose-300 font-bold text-sm">
                <span>🔪</span> Это МАФИЯ!
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-600 text-emerald-300 font-bold text-sm">
                <span>🕊️</span> Мирный гражданин
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onDismissSheriffResult?.();
            }}
            className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl active:scale-95 transition-all text-sm"
          >
            Запомнить и ждать утра
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-750 w-full max-w-sm rounded-3xl p-4 shadow-2xl">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 rounded-xl bg-slate-800 border border-slate-700">
            <Icon className={`w-5 h-5 ${action.color}`} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">{action.title}</h3>
            <p className="text-[11px] text-slate-400">{action.desc}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto py-2 pr-1 my-2">
          {candidates.map((player) => {
            const isSelected = selectedTargetId === player.id;
            return (
              <button
                key={player.id}
                type="button"
                onClick={() => {
                  sound.playTap();
                  setSelectedTargetId(player.id);
                }}
                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all text-left active:scale-98 ${
                  isSelected
                    ? 'bg-slate-800 border-amber-500 ring-1 ring-amber-500/50 shadow-md'
                    : 'bg-slate-950/60 border-slate-800 hover:bg-slate-850 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{player.avatar}</span>
                  <div>
                    <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      {player.name}
                      {player.id === userId && (
                        <span className="text-[10px] text-emerald-400">(Вы)</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 line-clamp-1">
                      {player.personality.split('(')[0].trim()}
                    </div>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-amber-500 border-amber-500 text-slate-950'
                      : 'border-slate-700 bg-slate-900'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="pt-2">
          <button
            type="button"
            disabled={!selectedTargetId}
            onClick={() => {
              if (selectedTargetId) {
                sound.playTap();
                onConfirmAction(selectedTargetId);
              }
            }}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 ${
              selectedTargetId
                ? `${action.btnColor} cursor-pointer`
                : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
            }`}
          >
            {action.btnText}
          </button>
        </div>
      </div>
    </div>
  );
};
