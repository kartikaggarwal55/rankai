'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2, Plus, Trash2, BarChart3, Globe, ArrowRight,
  AlertTriangle, RotateCcw, ArrowLeft
} from 'lucide-react';
import { SiteAnalysis, SiteType } from '@/lib/types';
import { ScoreRing, getScoreColor } from '@/components/score-ring';
import { AuthButton } from '@/components/auth-button';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  AnalysisResultsView,
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

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Dashboard state
  const [history, setHistory] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Analysis state
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<AnalysisPhase>('idle');
  const [phaseDetail, setPhaseDetail] = useState('');
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [error, setError] = useState('');
  const [savedToHistory, setSavedToHistory] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/');
    }
  }, [status, router]);

  // Fetch analyses
  useEffect(() => {
    if (session?.user) {
      fetch('/api/analyses')
        .then(res => res.ok ? res.json() : [])
        .then(data => { setHistory(data); setLoading(false); })
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

  const loadAnalysis = async (id: string) => {
    try {
      const res = await fetch(`/api/analyses/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setAnalysis(data);
      setUrl(data.url);
      setPhase('done');
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch { /* ignore */ }
  };

  const analyzeUrl = async (targetUrl: string, onPhase?: (phase: AnalysisPhase, detail: string) => void): Promise<SiteAnalysis> => {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl.trim() }),
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
    setAnalysis(null);

    try {
      const data = await analyzeUrl(url, (p, d) => {
        setPhase(p);
        setPhaseDetail(d);
      });

      setAnalysis(data);
      setPhase('done');

      // Auto-save
      fetch('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis: data }),
      }).then(res => res.json()).then(({ id }) => {
        setSavedToHistory(true);
        setTimeout(() => setSavedToHistory(false), 3000);
        // Add to local history
        setHistory(prev => [{
          id,
          url: data.url,
          overallScore: data.overallScore,
          overallGrade: data.overallGrade,
          geoScore: data.geoScore,
          aeoScore: data.aeoScore,
          siteType: data.siteType,
          createdAt: new Date().toISOString(),
        }, ...prev]);
      }).catch(() => {});

      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setPhase('error');
    }
  };

  const backToGrid = () => {
    setAnalysis(null);
    setPhase('idle');
    setError('');
    setUrl('');
  };

  const isLoading = phase !== 'idle' && phase !== 'done' && phase !== 'error';

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="min-h-screen">
        <Nav />
        <div className="flex items-center justify-center py-32">
          <Loader2 size={24} className="animate-spin text-text-muted" />
        </div>
      </div>
    );
  }

  if (!session?.user) return null;

  return (
    <div className="min-h-screen">
      <Nav />

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* ── Compact Input Bar ─────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            {analysis && (
              <button
                onClick={backToGrid}
                className="shrink-0 p-2.5 rounded-lg bg-bg-card border border-border hover:bg-bg-elevated transition-all cursor-pointer"
                title="Back to all analyses"
              >
                <ArrowLeft size={16} className="text-text-secondary" />
              </button>
            )}
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
                className="w-full h-12 pl-11 pr-28 rounded-xl bg-bg-card border border-border focus:border-accent/50 focus:ring-1 focus:ring-accent/20 outline-none text-text placeholder-text-muted transition-all text-sm"
                disabled={isLoading}
              />
              <button
                onClick={handleAnalyze}
                disabled={!url.trim() || isLoading}
                className="absolute right-1.5 h-9 px-5 rounded-[10px] bg-accent hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all flex items-center gap-1.5 analyze-glow cursor-pointer"
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

        {/* ── Results View ──────────────────────────────────────────────── */}
        {analysis && (
          <div ref={resultsRef} className="pb-16">
            <AnalysisResultsView analysis={analysis} savedToHistory={savedToHistory} />
          </div>
        )}

        {/* ── Analyses Grid ────────────────────────────────────────────── */}
        {!analysis && !isLoading && (
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
              <div className="text-center py-16">
                <div className="w-14 h-14 rounded-2xl bg-accent-dim flex items-center justify-center mx-auto mb-4">
                  <BarChart3 size={24} className="text-accent-light" />
                </div>
                <h3 className="text-base font-semibold text-text mb-1.5">No analyses yet</h3>
                <p className="text-sm text-text-secondary max-w-sm mx-auto">
                  Enter a website URL above to run your first analysis. Results are saved automatically.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {history.map(h => (
                  <button
                    key={h.id}
                    onClick={() => loadAnalysis(h.id)}
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
          </div>
        )}
      </div>

      <footer className="border-t border-border py-8 text-center">
        <p className="text-xs text-text-muted">
          &copy; {new Date().getFullYear()} RankAI &mdash; Methodology based on Princeton GEO research (KDD 2024) and analysis of 680M+ AI citations.
        </p>
      </footer>
    </div>
  );
}

function Nav() {
  return (
    <nav
      className="sticky top-0 z-50 backdrop-blur-xl border-b border-border"
      style={{ backgroundColor: 'var(--nav-bg)' }}
    >
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-light flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="9" width="3" height="6" rx="0.75" fill="white" opacity="0.5" />
              <rect x="6.5" y="5" width="3" height="10" rx="0.75" fill="white" opacity="0.75" />
              <rect x="12" y="1" width="3" height="14" rx="0.75" fill="white" />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight">RankAI</span>
        </Link>
        <div className="flex items-center gap-6 text-sm text-text-secondary">
          <span className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium text-[13px] bg-accent text-white">
            <BarChart3 size={14} />
            Dashboard
          </span>
          <ThemeToggle />
          <AuthButton />
        </div>
      </div>
    </nav>
  );
}
