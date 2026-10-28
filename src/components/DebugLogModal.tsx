import React, { useState } from 'react';
import { DebugLogEntry, Player, ChatMessage } from '../game/mafiaEngine';
import { RoleBadge } from './RoleBadge';
import { X, Terminal, ChevronDown, ChevronUp, Copy, Check, Filter, FileText, CheckCircle2 } from 'lucide-react';
import { sound } from './SoundEffects';

interface DebugLogModalProps {
  entries: DebugLogEntry[];
  players?: Player[];
  chronicle?: string[];
  chatMessages?: ChatMessage[];
  onClose: () => void;
  onClear: () => void;
}

export const DebugLogModal: React.FC<DebugLogModalProps> = ({
  entries,
  players = [],
  chronicle = [],
  chatMessages = [],
  onClose,
  onClear,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [showFullDumpArea, setShowFullDumpArea] = useState<boolean>(false);
  const [filterRole, setFilterRole] = useState<string>('all');

  const toggleExpand = (id: string) => {
    sound.playTap();
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const generateFullDumpText = () => {
    const timestamp = new Date().toLocaleString('ru-RU');
    let out = `=======================================================\n`;
    out += `🔍 ДЕТЕКТИВНЫЙ ДАМП ОТЛАДКИ ИИ МАФИИ\n`;
    out += `Дата выгрузки: ${timestamp}\n`;
    out += `Количество ходов в журнале: ${entries.length}\n`;
    out += `=======================================================\n\n`;

    if (players.length > 0) {
      out += `--- СОСТАВ ИГРОКОВ И РОЛИ ---\n`;
      players.forEach((p, idx) => {
        out += `${idx + 1}. ${p.name} — Роль: ${p.role.toUpperCase()}, Характер: "${p.personality}", Статус: ${
          p.isAlive ? 'В ЖИВЫХ' : `ВЫБЫЛ (День ${p.diedAtDay || 1}, причина: ${p.deathReason || 'убит'})`
        }\n`;
      });
      out += `\n`;
    }

    if (chronicle.length > 0) {
      out += `--- ХРОНИКА ГОРОДСКИХ СОБЫТИЙ ---\n`;
      chronicle.forEach((c) => {
        out += `• ${c}\n`;
      });
      out += `\n`;
    }

    if (chatMessages.length > 0) {
      out += `--- ИСТОРИЯ ЧАТА ДЕБАТОВ И ГОЛОСОВАНИЙ ---\n`;
      chatMessages.forEach((m) => {
        out += `[${m.phase.toUpperCase()}${m.isPublic ? '' : ' - СЕКРЕТ АДМИНА'}] ${m.senderName}: ${m.text}\n`;
      });
      out += `\n`;
    }

    out += `--- ПОДРОБНЫЙ ЖУРНАЛ КАЖДОГО ХОДА ИИ (ПРОМПТЫ И ОТВЕТЫ) ---\n`;
    entries.forEach((e, i) => {
      out += `\n[ХОД #${i + 1}] ${e.actorName} (${e.actorRole}) — ${e.phase} (День ${e.dayNumber})\n`;
      out += `Характер: ${e.actorPersonality}\n`;
      out += `\n1. СИСТЕМНЫЙ ПРОМПТ:\n${e.promptSystem}\n`;
      out += `\n2. ПОЛЬЗОВАТЕЛЬСКИЙ ПРОМПТ:\n${e.promptUser}\n`;
      out += `\n3. СЫРОЙ ОТВЕТ МОДЕЛИ:\n${e.rawResponse}\n`;
      out += `\n4. РЕЗУЛЬТАТ ХОДА:\n${e.parsedResult}\n`;
      out += `-------------------------------------------------------\n`;
    });

    return out;
  };

  const copyToClipboardSafely = (text: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch {
      return false;
    }
  };

  const handleCopySingle = (entry: DebugLogEntry) => {
    sound.playTap();
    const textToCopy = `=== ХОД: ${entry.actorName} (${entry.actorRole}) - ${entry.phase} (День ${entry.dayNumber}) ===
[СИСТЕМНЫЙ ПРОМПТ]:
${entry.promptSystem}

[ПОЛЬЗОВАТЕЛЬСКИЙ ПРОМПТ]:
${entry.promptUser}

[СЫРОЙ ОТВЕТ МОДЕЛИ]:
${entry.rawResponse}

[РЕЗУЛЬТАТ ХОДА]:
${entry.parsedResult}`;

    copyToClipboardSafely(textToCopy);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = () => {
    sound.playTap();
    const fullText = generateFullDumpText();
    copyToClipboardSafely(fullText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  const filteredEntries = entries.filter((e) => {
    if (filterRole === 'all') return true;
    return e.actorRole === filterRole;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-750 w-full max-w-lg rounded-3xl flex flex-col max-h-[94vh] shadow-2xl overflow-hidden select-text">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                Журнал отладки ИИ
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {entries.length}
                </span>
              </h3>
              <p className="text-[10px] text-slate-400">Полный контекст, промпты и ответы модели</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {entries.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  onClear();
                }}
                className="text-[11px] px-2 py-1 rounded-lg bg-rose-950/50 border border-rose-800/40 text-rose-300 hover:bg-rose-900 active:scale-95"
              >
                Очистить
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onClose();
              }}
              className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Action Bar: Copy All & Dump View */}
        <div className="p-2.5 bg-indigo-950/40 border-b border-indigo-900/40 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={handleCopyAll}
            className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md ${
              copiedAll
                ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
            }`}
          >
            {copiedAll ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Скопировано в буфер обмена!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Скопировать ВСЁ для отладки</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setShowFullDumpArea(!showFullDumpArea);
            }}
            className="py-2 px-3 rounded-xl font-medium text-xs bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 active:scale-95"
            title="Открыть текстовый дамп поверх для ручного копирования"
          >
            <FileText className="w-4 h-4 text-sky-400" />
            <span>{showFullDumpArea ? 'Скрыть текст' : 'Текстовый дамп'}</span>
          </button>
        </div>

        {/* Full Dump Textarea Drawer */}
        {showFullDumpArea && (
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex flex-col gap-2 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Выделите текст ниже, если буфер обмена заблокирован браузером:</span>
              <button
                type="button"
                onClick={(e) => {
                  const target = e.currentTarget.parentElement?.nextElementSibling as HTMLTextAreaElement;
                  if (target) {
                    target.focus();
                    target.select();
                    copyToClipboardSafely(target.value);
                    setCopiedAll(true);
                    setTimeout(() => setCopiedAll(false), 2000);
                  }
                }}
                className="text-amber-400 font-bold hover:underline"
              >
                Выделить всё и скопировать
              </button>
            </div>
            <textarea
              readOnly
              rows={6}
              value={generateFullDumpText()}
              className="w-full bg-slate-900 border border-slate-750 rounded-xl p-2.5 text-[11px] font-mono text-slate-300 resize-none focus:outline-none focus:border-amber-500 select-all"
              onClick={(e) => e.currentTarget.select()}
            />
          </div>
        )}

        {/* Filters */}
        <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-950/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <button
            type="button"
            onClick={() => setFilterRole('all')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all ${
              filterRole === 'all'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Все ({entries.length})
          </button>
          {['mafia', 'sheriff', 'doctor', 'citizen'].map((r) => {
            const count = entries.filter((e) => e.actorRole === r).length;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setFilterRole(r)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                  filterRole === r
                    ? 'bg-slate-200 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {r === 'mafia' ? 'Мафия' : r === 'sheriff' ? 'Шериф' : r === 'doctor' ? 'Доктор' : 'Мирные'} ({count})
              </button>
            );
          })}
        </div>

        {/* Entries list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              Записей журнала пока нет. Запустите партию, чтобы увидеть ходы.
            </div>
          ) : (
            filteredEntries
              .slice()
              .reverse()
              .map((entry) => {
                const isExpanded = expandedId === entry.id;
                const isCopied = copiedId === entry.id;

                return (
                  <div
                    key={entry.id}
                    className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 text-xs transition-all hover:border-slate-700"
                  >
                    {/* Top card row */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="font-bold text-slate-100 text-sm">{entry.actorName}</span>
                          <RoleBadge role={entry.actorRole} size="sm" />
                          <span className="text-[10px] text-slate-500 font-mono">
                            День {entry.dayNumber} • {entry.phase}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Характер: <span className="text-slate-300 font-medium">{entry.actorPersonality}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopySingle(entry)}
                          className="p-1 rounded-md bg-slate-800 text-slate-400 hover:text-white"
                          title="Скопировать этот ход"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleExpand(entry.id)}
                          className="p-1 rounded-md bg-slate-800 text-slate-400 hover:text-white"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Summary Result */}
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/80 text-[11px] text-slate-200">
                      <span className="text-slate-400 font-semibold block text-[10px] uppercase">
                        Результат действия:
                      </span>
                      <p className="mt-0.5 whitespace-pre-wrap">{entry.parsedResult}</p>
                    </div>

                    {/* Expanded Full Context & Raw Response */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-800 space-y-2.5 animate-in fade-in duration-150">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider font-bold text-amber-400 mb-1">
                            1. Контекст: Системный промпт (правила роли и видимость)
                          </div>
                          <pre className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-[10px] font-mono text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                            {entry.promptSystem}
                          </pre>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase tracking-wider font-bold text-sky-400 mb-1">
                            2. Контекст: Пользовательский запрос (события и цель хода)
                          </div>
                          <pre className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-[10px] font-mono text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                            {entry.promptUser}
                          </pre>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-400 mb-1">
                            3. Сырой ответ модели (Raw Response)
                          </div>
                          <pre className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-[10px] font-mono text-emerald-200/90 whitespace-pre-wrap max-h-48 overflow-y-auto">
                            {entry.rawResponse}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  );
};
