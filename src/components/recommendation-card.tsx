'use client';

import { Zap, ArrowUp, Clock, AlertTriangle, TrendingUp } from 'lucide-react';
import { Recommendation } from '@/lib/types';

export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const priorityConfig = {
    critical: { color: '#f87171', bg: 'rgba(248,113,113,0.08)', icon: AlertTriangle, label: 'Critical' },
    high: { color: '#fb923c', bg: 'rgba(251,146,60,0.08)', icon: Zap, label: 'High' },
    medium: { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', icon: ArrowUp, label: 'Medium' },
    low: { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', icon: Clock, label: 'Low' },
  };

  const effortConfig = {
    low: { label: 'Quick Win', color: '#34d399' },
    medium: { label: 'Moderate', color: '#fbbf24' },
    high: { label: 'Investment', color: '#fb923c' },
  };

  const p = priorityConfig[rec.priority];
  const e = effortConfig[rec.effort];
  const Icon = p.icon;
  const typeColor = rec.type === 'geo' ? '#a78bfa' : '#60a5fa';

  return (
    <div className="rounded-xl bg-bg-card p-5 hover:bg-bg-elevated/50 transition-all group ring-1 ring-transparent hover:ring-border">
      <div className="flex items-start gap-4">
        <div
          className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: p.bg }}
        >
          <Icon size={16} style={{ color: p.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
              style={{ background: p.bg, color: p.color }}
            >
              {p.label}
            </span>
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
              style={{ background: `${typeColor}10`, color: typeColor }}
            >
              {rec.type.toUpperCase()}
            </span>
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
              style={{ background: `${e.color}10`, color: e.color }}
            >
              {e.label}
            </span>
          </div>
          <h3 className="font-semibold text-text text-[15px] leading-snug">{rec.category}</h3>
          <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{rec.description}</p>

          {/* Score improvement bar */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-text-muted tabular-nums">{rec.currentScore}</span>
              <div className="w-24 h-1.5 bg-white/[0.04] rounded-full overflow-hidden relative">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-text-muted/30"
                  style={{ width: `${rec.currentScore}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${rec.potentialScore}%`, background: `${p.color}40` }}
                />
              </div>
              <span className="font-mono text-score-pass tabular-nums">{rec.potentialScore}</span>
            </div>
            <TrendingUp size={12} className="text-score-pass" />
            <span className="text-[11px] text-text-muted">{rec.impact}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
