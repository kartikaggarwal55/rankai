'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Loader2, Trash2, BarChart3, Globe, ArrowRight,
  AlertTriangle, RotateCcw,
} from 'lucide-react';
import { SiteAnalysis, SiteType } from '@/lib/types';
import { ScoreRing } from '@/components/score-ring';
import {
  SITE_TYPE_LABELS,
  getErrorGuidance,
  PHASES,
  AnalysisPhase,
} from '@/components/analysis-results';

function getDomain(url: string) {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname; } catch { return url; }
}

type AnalysisSummary = {
  id: string;
  url: string;
  overallScore: number;
  overallGrade: string;
  geoScore: number;
  aeoScore: number;
  siteType: string;
  createdAt: string;
};

type ComparisonSummary = {
  id: string;
  primaryAnalysisId: string;
  competitorAnalysisIds: string[];
  competitorCount: number;
  primaryUrl: string | null;
  primaryOverallScore: number | null;
  primaryOverallGrade: string | null;
  createdAt: string;
};

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Dashboard state
  const [history, setHistory] = useState<AnalysisSummary[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingComparisonId, setDeletingComparisonId] = useState<string | null>(null);

  // Analysis state
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<AnalysisPhase>('idle');
  const [phaseDetail, setPhaseDetail] = useState('');
  const [error, setError] = useState('');
  const [maxPages, setMaxPages] = useState(25);

  const [pagesOpen, setPagesOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);

  // Close pages popover on outside click
  useEffect(() => {
    if (!pagesOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (pagesRef.current && !pagesRef.current.contains(e.target as Node)) {
        setPagesOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [pagesOpen]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/');
    }
  }, [status, router]);

  // Auto-focus input when navigating with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1' && !loading) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [searchParams, loading]);

  // Fetch analyses and comparisons
  useEffect(() => {
    if (session?.user) {
      Promise.all([
        fetch('/api/analyses').then(res => res.ok ? res.json() : []),
        fetch('/api/comparisons').then(res => res.ok ? res.json() : []),
      ])
        .then(([analysisData, comparisonData]) => {
          setHistory(analysisData);
          setComparisons(comparisonData);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [session]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/analyses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setHistory(prev => prev.filter(h => h.id !== id));
      }
    } catch { /* ignore */ }
    setDeletingId(null);
  };

  const handleDeleteComparison = async (id: string) => {
    setDeletingComparisonId(id);
    try {
      const res = await fetch(`/api/comparisons/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setComparisons(prev => prev.filter(c => c.id !== id));
      }
    } catch { /* ignore */ }
    setDeletingComparisonId(null);
  };

  const analyzeUrl = async (targetUrl: string, onPhase?: (phase: AnalysisPhase, detail: string) => void): Promise<SiteAnalysis> => {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl.trim(), maxPages }),
    });

    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result: SiteAnalysis | null = null;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'phase') {
            onPhase?.(event.phase, event.detail || '');
          } else if (event.type === 'result') {
            result = event.data;
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }

    if (!result) throw new Error('Analysis failed — no result received');
    return result;
  };

  const handleAnalyze = async () => {
    if (!url.trim()) return;

    setPhase('crawling');
    setPhaseDetail('');
    setError('');

    try {
      const data = await analyzeUrl(url, (p, d) => {
        setPhase(p);
        setPhaseDetail(d);
      });

      setPhase('done');

      // Auto-save and redirect to the analysis page
      const saveRes = await fetch('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis: data }),
      });
      if (!saveRes.ok) {
        throw new Error('Failed to save analysis');
      }
      const payload = await saveRes.json();
      if (!payload?.id || typeof payload.id !== 'string') {
        throw new Error('Failed to save analysis');
      }
      const { id } = payload;
      router.push(`/dashboard/analysis/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setPhase('error');
    }
  };

  const isLoading = phase !== 'idle' && phase !== 'done' && phase !== 'error';

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (!session?.user) return null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 w-full flex-1">
      {/* ── Compact Input Bar ─────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center flex-1">
            <div className="absolute left-4 text-text-muted">
              <Globe size={18} />
            </div>
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleAnalyze()}
              placeholder="Enter URL to analyze..."
              className="w-full h-12 pl-11 pr-36 rounded-xl bg-bg-card border border-border focus:border-accent/50 focus:ring-1 focus:ring-accent/20 outline-none text-text placeholder-text-muted transition-all text-sm"
              disabled={isLoading}
            />
            <div className="absolute right-1.5 flex items-center gap-1.5">
              {/* Pages selector */}
              <div ref={pagesRef} className="relative">
                <button
                  onClick={() => setPagesOpen(!pagesOpen)}
                  disabled={isLoading}
                  className="h-9 px-2.5 rounded-[10px] bg-bg-elevated hover:bg-bg-hover border border-border text-text-secondary hover:text-text disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono font-medium transition-all flex items-center gap-1 cursor-pointer tabular-nums"
                  title="Pages to crawl"
                >
                  {maxPages}p
                </button>
                {pagesOpen && (
                  <div
                    className="absolute top-full right-0 mt-2 p-2 rounded-xl bg-bg-card border border-border shadow-lg min-w-[140px] z-50"
                    style={{ animation: 'fadeIn 0.15s ease-out' }}
                  >
                    <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold px-1 mb-1.5">Pages to crawl</p>
                    <div className="grid grid-cols-2 gap-1">
                      {[5, 10, 15, 25, 35, 50].map(n => (
                        <button
                          key={n}
                          onClick={() => { setMaxPages(n); setPagesOpen(false); }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
                            maxPages === n
                              ? 'bg-accent text-white'
                              : 'bg-bg-elevated text-text-secondary hover:text-text hover:bg-bg-hover'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* Analyze button */}
              <button
                onClick={handleAnalyze}
                disabled={!url.trim() || isLoading}
                className="h-9 px-5 rounded-[10px] bg-accent hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all flex items-center gap-1.5 analyze-glow cursor-pointer"
              >
                {isLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <>
                    <span>Analyze</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Stepper */}
        {isLoading && (
          <div className="mt-5 flex items-center justify-center gap-0" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            {PHASES.map((p, i) => {
              const phaseIndex = PHASES.findIndex(ph => ph.id === phase);
              const isActive = i === phaseIndex;
              const isDone = i < phaseIndex;

              return (
                <div key={p.id} className="flex items-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-accent text-white'
                          : isDone
                          ? 'bg-score-pass/20 text-score-pass'
                          : 'bg-bg-card text-text-muted'
                      }`}
                      style={isActive ? { animation: 'stepperPulse 2s ease-in-out infinite' } : {}}
                    >
                      {isDone ? '✓' : i + 1}
                    </div>
                    <div className="text-center">
                      <div className={`text-[11px] font-medium ${isActive ? 'text-text' : isDone ? 'text-score-pass' : 'text-text-muted'}`}>
                        {p.label}
                      </div>
                      {isActive && (
                        <div className="text-[10px] text-text-secondary" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                          {phaseDetail || p.desc}
                        </div>
                      )}
                    </div>
                  </div>
                  {i < PHASES.length - 1 && (
                    <div className={`w-10 h-px mx-1.5 mt-[-20px] ${isDone ? 'bg-score-pass/30' : 'bg-border'}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Error */}
        {error && (() => {
          const guidance = getErrorGuidance(error);
          return (
            <div className="mt-4 p-4 rounded-xl bg-bg-card border border-border border-l-4 border-l-danger" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
              <div className="flex items-start gap-3">
                <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-text text-sm">{guidance.title}</h4>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">{guidance.suggestion}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={handleAnalyze}
                      className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-light text-white text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw size={12} />
                      Retry
                    </button>
                    <button
                      onClick={() => { setError(''); setPhase('idle'); }}
                      className="px-3 py-1.5 rounded-lg bg-bg-elevated text-text-secondary hover:text-text text-xs font-medium transition-all cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Analyses Grid ────────────────────────────────────────────── */}
      {!isLoading && (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Your Analyses</h2>
              <p className="text-sm text-text-secondary mt-0.5">
                {history.length === 0 ? 'No analyses yet — enter a URL above to get started' : `${history.length} analysis${history.length !== 1 ? 'es' : ''}`}
              </p>
            </div>
          </div>

          {history.length === 0 ? (
            <div className="relative overflow-hidden rounded-2xl border border-border bg-bg-card">
              {/* Decorative background */}
              <div className="absolute inset-0 dot-grid opacity-30" />
              <div className="absolute top-0 left-1/3 w-[400px] h-[400px] rounded-full blur-[120px]" style={{ background: 'color-mix(in srgb, var(--color-accent) 5%, transparent)' }} />
              <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] rounded-full blur-[100px]" style={{ background: 'color-mix(in srgb, var(--color-aeo) 4%, transparent)' }} />

              <div className="relative px-8 py-16 sm:py-20 flex flex-col items-center text-center">
                {/* Animated icon cluster */}
                <div className="relative mb-8">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent to-accent-light flex items-center justify-center shadow-lg" style={{ boxShadow: '0 8px 32px color-mix(in srgb, var(--color-accent) 25%, transparent)' }}>
                    <BarChart3 size={32} className="text-white" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-lg bg-geo-dim border border-geo/20 flex items-center justify-center" style={{ animation: 'fadeIn 0.5s ease-out 0.2s both' }}>
                    <Globe size={14} className="text-geo" />
                  </div>
                  <div className="absolute -bottom-2 -left-2 w-8 h-8 rounded-lg bg-aeo-dim border border-aeo/20 flex items-center justify-center" style={{ animation: 'fadeIn 0.5s ease-out 0.4s both' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-aeo"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                  </div>
                </div>

                <h3 className="text-2xl font-bold tracking-tight text-text mb-2">Run your first analysis</h3>
                <p className="text-[15px] text-text-secondary max-w-md mx-auto leading-relaxed mb-8">
                  Paste any website URL above to get a comprehensive GEO + AEO score. All results are saved automatically to your dashboard.
                </p>

                {/* Quick-start suggestions */}
                <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
                  <span className="text-xs text-text-muted mr-1">Try:</span>
                  {['stripe.com', 'docs.github.com', 'vercel.com'].map(example => (
                    <button
                      key={example}
                      onClick={() => { setUrl(`https://${example}`); inputRef.current?.focus(); }}
                      className="px-3 py-1.5 rounded-lg bg-bg-elevated/60 border border-border text-xs text-text-secondary hover:text-text hover:border-accent/30 transition-all cursor-pointer font-mono"
                    >
                      {example}
                    </button>
                  ))}
                </div>

                {/* Feature highlights */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-lg">
                  {[
                    { label: '22 Criteria', desc: 'GEO + AEO audit' },
                    { label: 'AI Insights', desc: 'Claude-powered strategy' },
                    { label: 'Auto-Saved', desc: 'Track progress over time' },
                  ].map((f, i) => (
                    <div key={i} className="p-3 rounded-lg bg-bg-elevated/40 border border-border/50 text-center">
                      <p className="text-sm font-semibold text-text">{f.label}</p>
                      <p className="text-[11px] text-text-muted mt-0.5">{f.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {history.map(h => (
                <button
                  key={h.id}
                  onClick={() => router.push(`/dashboard/analysis/${h.id}`)}
                  className="group relative p-5 rounded-xl bg-bg-card border border-border hover:bg-bg-elevated/50 hover:ring-1 hover:ring-border transition-all cursor-pointer text-left"
                >
                  {/* Delete button */}
                  <div
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    onClick={(e) => { e.stopPropagation(); handleDelete(h.id); }}
                  >
                    <div className="p-1.5 rounded-md hover:bg-bg-hover transition-colors">
                      {deletingId === h.id ? (
                        <Loader2 size={13} className="text-text-muted animate-spin" />
                      ) : (
                        <Trash2 size={13} className="text-text-muted hover:text-danger" />
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="shrink-0">
                      <ScoreRing score={h.overallScore} grade={h.overallGrade} size={56} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] text-text font-semibold truncate">{getDomain(h.url)}</p>
                      <p className="text-xs text-text-muted truncate font-mono mt-0.5">{h.url}</p>
                      <div className="flex items-center gap-3 mt-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest bg-accent-dim text-accent-light">
                          {SITE_TYPE_LABELS[h.siteType as SiteType] || h.siteType}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-geo" />
                      <span className="text-xs font-mono font-medium text-text-secondary tabular-nums">{h.geoScore}</span>
                      <span className="text-[10px] text-text-muted">GEO</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-aeo" />
                      <span className="text-xs font-mono font-medium text-text-secondary tabular-nums">{h.aeoScore}</span>
                      <span className="text-[10px] text-text-muted">AEO</span>
                    </div>
                    <span className="text-[11px] text-text-muted ml-auto">
                      {new Date(h.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Saved Comparisons</h2>
                <p className="text-sm text-text-secondary mt-0.5">
                  {comparisons.length === 0
                    ? 'No comparisons yet — run Compare mode from the home page'
                    : `${comparisons.length} comparison${comparisons.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>

            {comparisons.length === 0 ? (
              <div className="p-5 rounded-xl bg-bg-card border border-border text-sm text-text-secondary">
                Use Compare mode on the homepage to run multiple sites side-by-side and save the comparison here.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {comparisons.map(c => (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/dashboard/comparison/${c.id}`)}
                    className="group relative p-5 rounded-xl bg-bg-card border border-border hover:bg-bg-elevated/50 hover:ring-1 hover:ring-border transition-all cursor-pointer text-left"
                  >
                    <div
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      onClick={(e) => { e.stopPropagation(); handleDeleteComparison(c.id); }}
                    >
                      <div className="p-1.5 rounded-md hover:bg-bg-hover transition-colors">
                        {deletingComparisonId === c.id ? (
                          <Loader2 size={13} className="text-text-muted animate-spin" />
                        ) : (
                          <Trash2 size={13} className="text-text-muted hover:text-danger" />
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="shrink-0">
                        <ScoreRing
                          score={c.primaryOverallScore ?? 0}
                          grade={c.primaryOverallGrade ?? 'N/A'}
                          size={56}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] text-text font-semibold truncate">
                          {c.primaryUrl ? getDomain(c.primaryUrl) : 'Primary analysis unavailable'}
                        </p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {c.competitorCount} competitor{c.competitorCount !== 1 ? 's' : ''}
                        </p>
                        <p className="text-[11px] text-text-muted mt-3">
                          {new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
