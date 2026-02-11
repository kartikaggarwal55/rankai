'use client';

import { useState } from 'react';
import { Recommendation } from '@/lib/types';

const EFFORT_MAP = { low: 0.2, medium: 0.5, high: 0.8 };
const PRIORITY_SIZE = { critical: 12, high: 10, medium: 8, low: 6 };

export function ImpactMatrix({ recommendations }: { recommendations: Recommendation[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 500;
  const height = 400;
  const padding = { top: 30, right: 30, bottom: 40, left: 50 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const dots = recommendations.map((rec, i) => {
    const effort = EFFORT_MAP[rec.effort];
    const impactNum = parseFloat(rec.impact) || 5;
    const impact = Math.min(impactNum / 15, 1);
    const x = padding.left + effort * plotW;
    const y = padding.top + (1 - impact) * plotH;
    const size = PRIORITY_SIZE[rec.priority];
    const color = rec.type === 'geo' ? 'var(--color-geo)' : 'var(--color-aeo)';
    return { x, y, size, color, rec, i };
  });

  return (
    <div className="p-7 rounded-xl bg-bg-card border border-border">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="font-semibold text-base">Impact vs Effort Matrix</h3>
        <div className="flex items-center gap-3 ml-auto text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-geo)' }} /> GEO
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-aeo)' }} /> AEO
          </span>
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[500px] mx-auto" style={{ height: 'auto' }}>
          {/* Grid */}
          <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotH} stroke="var(--color-border)" strokeWidth="1" />
          <line x1={padding.left} y1={padding.top + plotH} x2={padding.left + plotW} y2={padding.top + plotH} stroke="var(--color-border)" strokeWidth="1" />

          {/* Dashed midlines */}
          <line x1={padding.left + plotW / 2} y1={padding.top} x2={padding.left + plotW / 2} y2={padding.top + plotH} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="4 4" />
          <line x1={padding.left} y1={padding.top + plotH / 2} x2={padding.left + plotW} y2={padding.top + plotH / 2} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="4 4" />

          {/* Quadrant labels */}
          <text x={padding.left + plotW * 0.25} y={padding.top + plotH * 0.25} textAnchor="middle" fill="var(--color-text-muted)" fontSize="10" opacity="0.5">Quick Wins</text>
          <text x={padding.left + plotW * 0.75} y={padding.top + plotH * 0.25} textAnchor="middle" fill="var(--color-text-muted)" fontSize="10" opacity="0.5">Major Projects</text>
          <text x={padding.left + plotW * 0.25} y={padding.top + plotH * 0.75} textAnchor="middle" fill="var(--color-text-muted)" fontSize="10" opacity="0.5">Fill-ins</text>
          <text x={padding.left + plotW * 0.75} y={padding.top + plotH * 0.75} textAnchor="middle" fill="var(--color-text-muted)" fontSize="10" opacity="0.5">Avoid</text>

          {/* Axis labels */}
          <text x={padding.left + plotW / 2} y={height - 5} textAnchor="middle" fill="var(--color-text-muted)" fontSize="11">Effort →</text>
          <text x={12} y={padding.top + plotH / 2} textAnchor="middle" fill="var(--color-text-muted)" fontSize="11" transform={`rotate(-90, 12, ${padding.top + plotH / 2})`}>Impact →</text>

          {/* Axis tick labels */}
          <text x={padding.left} y={height - 22} textAnchor="middle" fill="var(--color-text-muted)" fontSize="9">Low</text>
          <text x={padding.left + plotW} y={height - 22} textAnchor="middle" fill="var(--color-text-muted)" fontSize="9">High</text>

          {/* Dots */}
          {dots.map(({ x, y, size, color, rec, i }) => (
            <g key={i} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)} style={{ cursor: 'pointer' }}>
              <circle cx={x} cy={y} r={size} fill={color} opacity={hoveredIdx === null || hoveredIdx === i ? 0.8 : 0.3} />
              {hoveredIdx === i && (
                <g>
                  <rect x={x - 80} y={y - 30} width="160" height="22" rx="4" fill="var(--color-bg-card)" stroke="var(--color-border)" />
                  <text x={x} y={y - 15} textAnchor="middle" fill="var(--color-text)" fontSize="10" fontWeight="500">{rec.category}</text>
                </g>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
