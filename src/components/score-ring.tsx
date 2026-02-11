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
            strokeWidth="6"
            style={{ stroke: 'var(--color-track)' }}
          />
          {/* Score arc */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              stroke: color,
              animation: 'scoreRingFill 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              filter: `drop-shadow(0 0 10px color-mix(in srgb, ${color} 31%, transparent))`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-bold tracking-tight" style={{ color }}>{score}</span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-md mt-1 tracking-wide"
            style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`, color }}
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
  if (score >= 80) return 'var(--color-score-pass)';
  if (score >= 60) return 'var(--color-score-warn)';
  if (score >= 40) return 'var(--color-score-caution)';
  return 'var(--color-score-fail)';
}

export function getGradeColor(grade: string): string {
  if (grade.startsWith('A')) return 'var(--color-score-pass)';
  if (grade === 'B') return 'var(--color-score-warn)';
  if (grade === 'C') return 'var(--color-score-caution)';
  return 'var(--color-score-fail)';
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
      style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`, color }}
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
      style={{ background: `color-mix(in srgb, ${config.color} 7%, transparent)`, color: config.color }}
    >
      {config.label}
    </span>
  );
}

function getPositionConfig(score: number) {
  if (score >= 80) return { label: 'Strong', color: 'var(--color-score-pass)' };
  if (score >= 60) return { label: 'Competitive', color: 'var(--color-score-warn)' };
  if (score >= 40) return { label: 'Developing', color: 'var(--color-score-caution)' };
  return { label: 'At Risk', color: 'var(--color-score-fail)' };
}
