import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, Check, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { sound } from './SoundEffects';
import {
  clearYukinoKey,
  getYukinoKey,
  maskKey,
  setYukinoKey,
} from '../services/keys';

/**
 * Ввод API-ключа Yukino прямо в интерфейсе.
 *
 * Ключ не хранится в коде и не уходит на наш сервер в открытом виде:
 * он лежит в localStorage браузера и передаётся только в запросах к Yukino
 * (через собственный прокси в заголовке x-yukino-key).
 */
export const ApiKeyPanel: React.FC = () => {
  const [savedKey, setSavedKey] = useState<string>(() => getYukinoKey());
  const [draft, setDraft] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [justSaved, setJustSaved] = useState<boolean>(false);

  const handleSave = () => {
    sound.playTap();
    const clean = draft.trim();
    if (!clean) return;
    setYukinoKey(clean);
    setSavedKey(clean);
    setDraft('');
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleClear = () => {
    sound.playTap();
    clearYukinoKey();
    setSavedKey('');
    setDraft('');
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    // «Вставил и играешь»: сразу сохраняем вставленный ключ.
    const pasted = e.clipboardData?.getData('text')?.trim();
    if (!pasted) return;
    e.preventDefault();
    setDraft(pasted);
    setYukinoKey(pasted);
    setSavedKey(pasted);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-lg space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-slate-200">API-ключ Yukino</span>
        </div>
        {savedKey ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-950/60 border border-emerald-700/60 rounded-full px-2 py-0.5">
            <Check className="w-3 h-3" /> {maskKey(savedKey)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-950/60 border border-amber-700/60 rounded-full px-2 py-0.5">
            <AlertTriangle className="w-3 h-3" /> не задан
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            type={showKey ? 'text' : 'password'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            placeholder={savedKey ? 'Ключ сохранён — можно вставить новый' : 'Вставьте ключ sk-yuk-…'}
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-2.5 pr-9 py-2 text-[11px] text-slate-100 font-mono outline-none focus:border-amber-500 placeholder:text-slate-600 placeholder:font-sans"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-500 hover:text-slate-300"
            title={showKey ? 'Скрыть ключ' : 'Показать ключ'}
          >
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={!draft.trim()}
          className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
            draft.trim()
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          {justSaved ? 'Готово' : 'Вставить'}
        </button>

        {savedKey && (
          <button
            type="button"
            onClick={handleClear}
            className="p-2 rounded-xl bg-rose-950/60 border border-rose-800/50 text-rose-300 hover:bg-rose-900 active:scale-95 transition-all"
            title="Удалить ключ из браузера"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed flex items-start gap-1">
        <ShieldCheck className="w-3 h-3 text-emerald-500/80 shrink-0 mt-0.5" />
        <span>
          Ключ хранится только в этом браузере (localStorage) и уходит лишь в запросах к Yukino.
          В коде и на сервере его нет. Без ключа партия не запустится.
        </span>
      </p>
    </section>
  );
};
