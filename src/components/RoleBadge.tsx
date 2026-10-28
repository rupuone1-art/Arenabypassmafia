import React from 'react';
import { Role } from '../game/mafiaEngine';
import { Shield, Crosshair, HeartPulse, User } from 'lucide-react';

interface RoleBadgeProps {
  role: Role;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const ROLE_INFO: Record<Role, { title: string; color: string; bg: string; border: string; icon: any; desc: string }> = {
  mafia: {
    title: 'Мафия',
    color: 'text-rose-300',
    bg: 'bg-rose-950/70',
    border: 'border-rose-700/60',
    icon: Crosshair,
    desc: 'Устраняйте мирных жителей каждую ночь и оставайтесь незамеченными днем.',
  },
  sheriff: {
    title: 'Шериф',
    color: 'text-sky-300',
    bg: 'bg-sky-950/70',
    border: 'border-sky-600/60',
    icon: Shield,
    desc: 'Каждую ночь проверяйте статус одного игрока, чтобы вычислить мафию.',
  },
  doctor: {
    title: 'Доктор',
    color: 'text-emerald-300',
    bg: 'bg-emerald-950/70',
    border: 'border-emerald-600/60',
    icon: HeartPulse,
    desc: 'Каждую ночь спасайте одного человека от пули мафии.',
  },
  citizen: {
    title: 'Мирный житель',
    color: 'text-amber-200',
    bg: 'bg-slate-900/80',
    border: 'border-slate-700/60',
    icon: User,
    desc: 'Находите противоречия в словах подозрительных игроков и голосуйте днем.',
  },
};

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, showIcon = true, size = 'sm' }) => {
  const info = ROLE_INFO[role] || ROLE_INFO.citizen;
  const Icon = info.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-sm px-2.5 py-1 gap-1.5',
    lg: 'text-base px-3 py-1.5 gap-2 font-medium',
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full border ${info.bg} ${info.border} ${info.color} ${sizeClasses}`}
    >
      {showIcon && <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />}
      <span>{info.title}</span>
    </span>
  );
};
