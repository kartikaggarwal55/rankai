'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, AlertTriangle, X } from 'lucide-react';
import { CategoryScore } from '@/lib/types';
import { GradeBadge, getScoreColor } from './score-ring';

interface CategoryCardProps {
  name: string;
  category: CategoryScore;
  type: 'geo' | 'aeo';
}

export function CategoryCard({ name, category, type }: CategoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const color = getScoreColor(category.score);
  const typeColor = type === 'geo' ? '#a78bfa' : '#60a5fa';

  return (
    <div className={`rounded-xl bg-bg-card overflow-hidden transition-all ${
      expanded ? 'ring-1 ring-border-bright' : 'ring-1 ring-transparent hover:ring-border'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-bg-elevated/50"
      >
        <GradeBadge grade={category.grade} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h3 className="font-semibold text-text text-[15px] truncate">{name}</h3>
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0"
              style={{ background: `${typeColor}12`, color: typeColor }}
            >
              {type.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${category.score}%`, background: color }}
              />
            </div>
            <span className="text-xs font-mono text-text-secondary tabular-nums">{category.score}</span>
          </div>
        </div>
        <span className="text-text-muted ml-1">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.04] px-5 py-4 space-y-4" style={{ animation: 'fadeIn 0.2s ease-out' }}>
          {/* Findings */}
          <div className="space-y-1.5">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted mb-2">Findings</h4>
            {category.findings.map((finding, i) => (
              <div key={i} className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-bg-elevated/30 transition-colors">
                <span className="mt-0.5 shrink-0">
                  {finding.status === 'pass' && (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-score-pass-dim">
                      <Check size={11} className="text-score-pass" strokeWidth={3} />
                    </span>
                  )}
                  {finding.status === 'partial' && (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-score-warn-dim">
                      <AlertTriangle size={11} className="text-score-warn" strokeWidth={2.5} />
                    </span>
                  )}
                  {finding.status === 'fail' && (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-score-fail-dim">
                      <X size={11} className="text-score-fail" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text">{finding.check}</span>
                    <span className="text-[11px] font-mono text-text-muted tabular-nums">{finding.points}/{finding.maxPoints}</span>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{finding.details}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Recommendations */}
          {category.recommendations.length > 0 && (
            <div className="space-y-1.5 pt-3 border-t border-white/[0.04]">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted mb-2">Recommendations</h4>
              {category.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2.5 py-1.5 px-3">
                  <span className="text-accent-light mt-1 shrink-0 text-[6px]">&#9679;</span>
                  <p className="text-sm text-text-secondary leading-relaxed">{rec}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
