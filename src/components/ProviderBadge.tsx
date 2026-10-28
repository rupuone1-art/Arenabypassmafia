import React, { useEffect, useState } from 'react';
import { Cpu, Sparkles, Cloud } from 'lucide-react';
import { getAiStatus, AiStatus } from '../services/aiClient';

interface ProviderBadgeProps {
  /** Компактный вид для игрового экрана */
  compact?: boolean;
}

const LABELS: Record<string, { title: string; hint: string }> = {
  gemini: {
    title: 'Gemini',
    hint: 'Речь ботов генерирует Google Gemini через серверный ключ',
  },
  yukino: {
    title: 'Yukino',
    hint: 'Речь ботов генерирует Yukino через серверный прокси',
  },
  local: {
    title: 'Локальный движок',
    hint: 'Внешние LLM не настроены — работает встроенная эвристика в браузере',
  },
};

/**
 * Индикатор того, кто на самом деле «думает» за ботов.
 * Помогает сразу понять, почему реплики шаблонные: ключ не настроен → локальный режим.
 */
export const ProviderBadge: React.FC<ProviderBadgeProps> = ({ compact = false }) => {
  const [status, setStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    getAiStatus().then((s) => {
      if (mounted) setStatus(s);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!status) return null;

  const provider = status.provider;
  const info = LABELS[provider] || LABELS.local;
  const Icon = provider === 'gemini' ? Sparkles : provider === 'yukino' ? Cloud : Cpu;

  const palette =
    provider === 'local'
      ? 'bg-slate-800/80 border-slate-700 text-slate-300'
      : 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300';

  return (
    <span
      title={info.hint}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${palette} ${
        compact ? 'text-[10px]' : 'text-[11px]'
      }`}
    >
      <Icon className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      <span>{info.title}</span>
    </span>
  );
};
