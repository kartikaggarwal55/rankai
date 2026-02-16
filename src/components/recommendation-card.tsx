'use client';

import { useState } from 'react';
import { Zap, ArrowUp, Clock, AlertTriangle, TrendingUp, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { Recommendation } from '@/lib/types';

export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const priorityConfig = {
    critical: { color: 'var(--color-score-fail)', icon: AlertTriangle, label: 'Critical' },
    high: { color: 'var(--color-score-caution)', icon: Zap, label: 'High' },
    medium: { color: 'var(--color-score-warn)', icon: ArrowUp, label: 'Medium' },
    low: { color: 'var(--color-aeo)', icon: Clock, label: 'Low' },
  };

  const effortConfig = {
    low: { label: 'Quick Win', color: 'var(--color-score-pass)' },
    medium: { label: 'Moderate', color: 'var(--color-score-warn)' },
    high: { label: 'Investment', color: 'var(--color-score-caution)' },
  };

  const p = priorityConfig[rec.priority];
  const e = effortConfig[rec.effort];
  const Icon = p.icon;
  const typeColor = rec.type === 'geo' ? 'var(--color-geo)' : 'var(--color-aeo)';

  const handleCopy = async () => {
    if (!rec.codeSnippet) return;
    await navigator.clipboard.writeText(rec.codeSnippet.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl bg-bg-card p-5 hover:bg-bg-elevated/50 transition-all group ring-1 ring-transparent hover:ring-border">
      <div className="flex items-start gap-4">
        <div
          className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: `color-mix(in srgb, ${p.color} 8%, transparent)` }}
        >
          <Icon size={16} style={{ color: p.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
              style={{ background: `color-mix(in srgb, ${p.color} 8%, transparent)`, color: p.color }}
            >
              {p.label}
            </span>
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
              style={{ background: `color-mix(in srgb, ${typeColor} 6%, transparent)`, color: typeColor }}
            >
              {rec.type.toUpperCase()}
            </span>
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
              style={{ background: `color-mix(in srgb, ${e.color} 6%, transparent)`, color: e.color }}
            >
              {e.label}
            </span>
          </div>
          <h3 className="font-semibold text-text text-[15px] leading-snug">{rec.category}</h3>
          <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{rec.description}</p>

          {rec.affectedPages && rec.affectedPages.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Affected:</span>
              {rec.affectedPages.map((url, j) => {
                let label: string;
                try { label = new URL(url).pathname; } catch { label = url; }
                return (
                  <span
                    key={j}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted font-mono truncate max-w-[180px]"
                    title={url}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Code snippet */}
          {rec.codeSnippet && (
            <div className="mt-3">
              <button
                onClick={() => setShowCode(!showCode)}
                className="flex items-center gap-1.5 text-xs text-accent-light hover:text-accent font-medium cursor-pointer"
              >
                {showCode ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {rec.codeSnippet.label}
              </button>
              {showCode && (
                <div className="mt-2 rounded-lg bg-bg-elevated border border-border overflow-hidden" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
                    <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">{rec.codeSnippet.language}</span>
                    <button onClick={handleCopy} className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text transition-colors cursor-pointer">
                      {copied ? <Check size={11} className="text-score-pass" /> : <Copy size={11} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="p-3 text-xs font-mono text-text-secondary overflow-x-auto leading-relaxed">
                    <code>{rec.codeSnippet.code}</code>
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Score improvement bar */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-text-muted tabular-nums">{rec.currentScore}</span>
              <div className="w-24 h-1.5 bg-track rounded-full overflow-hidden relative">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-text-muted/30"
                  style={{ width: `${rec.currentScore}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${rec.potentialScore}%`, background: `color-mix(in srgb, ${p.color} 25%, transparent)` }}
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
