'use client';

import { useEffect, useState } from 'react';

interface ScoreRingProps {
  score: number;
  grade: string;
  size?: number;
  label?: string;
  delay?: number;
}

export function ScoreRing({ score, grade, size = 120, label, delay = 0 }: ScoreRingProps) {
  const [visible, setVisible] = useState(delay === 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);
  const trackOpacity = 0.06;

  useEffect(() => {
    if (delay > 0) {
      const t = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(t);
    }
  }, [delay]);

  if (!visible) {
    return (
      <div className="flex flex-col items-center gap-3" style={{ width: size }}>
        <div style={{ width: size, height: size }} />
        {label && <span className="text-[11px] text-text-secondary font-medium tracking-widest uppercase">{label}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3" style={{ animation: 'countUp 0.5s ease-out' }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="transform -rotate-90" style={{ width: size, height: size }}>
          {/* Track */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={`rgba(255,255,255,${trackOpacity})`}
            strokeWidth="6"
          />
          {/* Score arc */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              animation: 'scoreRingFill 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              filter: `drop-shadow(0 0 10px ${color}50)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-bold tracking-tight" style={{ color }}>{score}</span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-md mt-1 tracking-wide"
            style={{ background: `${color}15`, color }}
          >
            {grade}
          </span>
        </div>
      </div>
      {label && <span className="text-[11px] text-text-secondary font-medium tracking-widest uppercase">{label}</span>}
    </div>
  );
}

export function getScoreColor(score: number): string {
  if (score >= 80) return '#34d399';
  if (score >= 60) return '#fbbf24';
  if (score >= 40) return '#fb923c';
  return '#f87171';
}

export function getGradeColor(grade: string): string {
  if (grade.startsWith('A')) return '#34d399';
  if (grade === 'B') return '#fbbf24';
  if (grade === 'C') return '#fb923c';
  return '#f87171';
}

export function GradeBadge({ grade, size = 'md' }: { grade: string; size?: 'sm' | 'md' | 'lg' }) {
  const color = getGradeColor(grade);
  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
  };

  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg font-mono font-bold ${sizeClasses[size]}`}
      style={{ background: `${color}15`, color }}
    >
      {grade}
    </span>
  );
}

export function PositionLabel({ score }: { score: number }) {
  const config = getPositionConfig(score);
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide"
      style={{ background: `${config.color}12`, color: config.color }}
    >
      {config.label}
    </span>
  );
}

function getPositionConfig(score: number) {
  if (score >= 80) return { label: 'Strong', color: '#34d399' };
  if (score >= 60) return { label: 'Competitive', color: '#fbbf24' };
  if (score >= 40) return { label: 'Developing', color: '#fb923c' };
  return { label: 'At Risk', color: '#f87171' };
}
