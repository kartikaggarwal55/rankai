'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import {
  Search, Loader2, Globe, Sparkles, Bot, FileText,
  BarChart3, ArrowRight, AlertTriangle, ArrowUp,
  Share2, RotateCcw, ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SiteAnalysis, SiteType, ShareableResult } from '@/lib/types';
import { ScoreRing, getScoreColor } from '@/components/score-ring';
import { AuthButton } from '@/components/auth-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { useSession } from 'next-auth/react';
import {
  AnalysisResultsView,
  SITE_TYPE_LABELS,
  getErrorGuidance,
  PHASES,
  AnalysisPhase,
} from '@/components/analysis-results';


const PIPELINE_STEPS = [
  { icon: Globe, title: 'Enter URL', desc: 'Paste any website URL to begin' },
  { icon: Search, title: 'Crawl Pages', desc: 'We discover and scan up to 25 pages' },
  { icon: BarChart3, title: 'Score Criteria', desc: '23 checks across GEO and AEO' },
  { icon: Sparkles, title: 'AI Insights', desc: 'Claude generates your strategy' },
];

const GEO_CRITERIA = [
  'Content Structure',
  'Schema Markup',
  'Topical Authority',
  'Citation Worthiness',
  'Content Freshness',
  'Language Patterns',
  'Meta Information',
  'Technical Health',
  'Content Uniqueness',
  'Multi-Format Content',
  'E-E-A-T Signals',
];

const AEO_CRITERIA = [
  'Documentation Structure',
  'API Documentation',
  'Code Examples',
  'llms.txt Support',
  'SDK Quality',
  'Auth Simplicity',
  'Quickstart Guide',
  'Error Messages',
  'Changelog & Versioning',
  'MCP Server',
  'Integration Guides',
  'Machine-Readable Sitemaps',
];

const STATS = [
  { stat: '25-37%', label: 'Visibility boost from adding statistics', color: 'var(--color-accent)' },
  { stat: '3.2x', label: 'Higher citation rates for FAQ content', color: 'var(--color-score-pass)' },
  { stat: '844K+', label: 'Websites using the llms.txt standard', color: 'var(--color-aeo)' },
  { stat: '527%', label: 'Increase in AI-sourced traffic in 2025', color: 'var(--color-score-warn)' },
];


function encodeShareableResult(analysis: SiteAnalysis): string {
  const result: ShareableResult = {
    u: analysis.url,
    t: analysis.crawledAt,
    p: analysis.pagesAnalyzed,
    st: analysis.siteType,
    g: analysis.geoScore,
    a: analysis.aeoScore,
    o: analysis.overallScore,
    gc: Object.fromEntries(Object.entries(analysis.geo).map(([k, v]) => [k, v.score])),
    ac: Object.fromEntries(Object.entries(analysis.aeo).map(([k, v]) => [k, v.score])),
  };
  return btoa(JSON.stringify(result));
}

function decodeShareableResult(hash: string): ShareableResult | null {
  try {
    return JSON.parse(atob(hash));
  } catch {
    return null;
  }
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<AnalysisPhase>('idle');
  const [phaseDetail, setPhaseDetail] = useState('');
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [sharedResult, setSharedResult] = useState<ShareableResult | null>(null);
  const [error, setError] = useState('');
  const [savedToHistory, setSavedToHistory] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [competitorUrls, setCompetitorUrls] = useState(['', '']);
  const [competitors, setCompetitors] = useState<(SiteAnalysis | null)[]>([null, null]);
  const [comparingPhases, setComparingPhases] = useState<(AnalysisPhase | null)[]>([null, null]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();
  const searchParams = useSearchParams();

  // Load shared result from URL hash on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#r=')) {
      const decoded = decodeShareableResult(window.location.hash.slice(3));
      if (decoded) {
        setSharedResult(decoded);
        setUrl(decoded.u);
      }
    }
  }, []);

  // Load analysis from ?id= query param (deep link from dashboard)
  useEffect(() => {
    const id = searchParams.get('id');
    if (id && session?.user && !analysis) {
      fetch(`/api/analyses/${id}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            setAnalysis(data);
            setUrl(data.url);
            setPhase('done');
          }
        })
        .catch(() => {});
    }
  }, [searchParams, session]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setSharedResult(null);
    setCompetitors([null, null]);

    try {
      const data = await analyzeUrl(url, (p, d) => {
        setPhase(p);
        setPhaseDetail(d);
      });

      setAnalysis(data);
      setPhase('done');

      // Encode shareable URL
      const hash = encodeShareableResult(data);
      window.history.replaceState(null, '', '#r=' + hash);

      // Auto-save for authenticated users
      if (session?.user) {
        fetch('/api/analyses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysis: data }),
        }).then(() => {
          setSavedToHistory(true);
          setTimeout(() => setSavedToHistory(false), 3000);
        }).catch(() => {});
      }

      // Compare mode: analyze competitors in parallel
      if (compareMode) {
        const activeCompetitors = competitorUrls.filter(u => u.trim());
        if (activeCompetitors.length > 0) {
          setComparingPhases(activeCompetitors.map(() => 'crawling' as AnalysisPhase));
          const promises = activeCompetitors.map((compUrl, idx) =>
            analyzeUrl(compUrl, (p) => {
              setComparingPhases(prev => {
                const next = [...prev];
                next[idx] = p;
                return next;
              });
            }).catch(() => null)
          );
          const results = await Promise.all(promises);
          setCompetitors(results.map(r => r || null));
          setComparingPhases([null, null]);
        }
      }

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setPhase('error');
    }
  };

  const isLoading = phase !== 'idle' && phase !== 'done' && phase !== 'error';

  return (
    <div className="min-h-screen">
      {/* ── Sticky Nav ─────────────────────────────────────────────────── */}
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
            <a href="#how-it-works" className="hover:text-text transition-colors hidden sm:inline">How it Works</a>
            <a href="#why-it-matters" className="hover:text-text transition-colors hidden sm:inline">Why It Matters</a>
            {session?.user && (
              <Link
                href="/dashboard"
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium text-[13px] bg-bg-card text-text hover:bg-bg-elevated border border-border-bright transition-all"
              >
                <BarChart3 size={14} />
                Dashboard
              </Link>
            )}
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      {!analysis && (
      <header className="relative overflow-hidden">
        {/* Dot grid texture */}
        <div className="absolute inset-0 dot-grid opacity-50" />

        {/* Mesh gradient */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full blur-[128px]" style={{ background: 'color-mix(in srgb, var(--color-accent) 4%, transparent)' }} />
          <div className="absolute top-32 right-1/4 w-[400px] h-[400px] rounded-full blur-[100px]" style={{ background: 'color-mix(in srgb, var(--color-aeo) 3%, transparent)' }} />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 pt-24 pb-28">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent-dim border border-accent/20 text-accent-light text-xs font-medium mb-8">
              <Bot size={14} />
              <span>22 criteria across GEO + AEO</span>
            </div>

            <h1 className="text-5xl sm:text-[64px] font-bold tracking-[-0.03em] leading-[1.1] mb-6">
              Is your site ready for
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(to right, var(--color-gradient-start), var(--color-gradient-mid), var(--color-gradient-end))' }}
              >
                AI-powered discovery?
              </span>
            </h1>

            <p className="text-[17px] text-text-secondary leading-relaxed mb-14 max-w-xl mx-auto">
              Analyze your website for Generative Engine Optimization and
              Agentic Engine Optimization. Research-backed scoring with actionable fixes.
            </p>

            {/* Input */}
            <div className="max-w-xl mx-auto">
              <div className="relative flex items-center">
                <div className="absolute left-4 text-text-muted">
                  <Globe size={20} />
                </div>
                <input
                  ref={inputRef}
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleAnalyze()}
                  placeholder="docs.stripe.com"
                  className="w-full h-14 pl-12 pr-36 rounded-xl bg-bg-card border border-border focus:border-accent/50 focus:ring-1 focus:ring-accent/20 outline-none text-text placeholder-text-muted transition-all text-base"
                  disabled={isLoading}
                />
                <button
                  onClick={handleAnalyze}
                  disabled={!url.trim() || isLoading}
                  className="absolute right-1.5 h-11 px-6 rounded-[10px] bg-accent hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-[15px] transition-all flex items-center gap-2 analyze-glow cursor-pointer"
                >
                  {isLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <span>{compareMode ? 'Compare All' : 'Analyze'}</span>
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </div>

              {/* Compare mode toggle */}
              <div className="flex items-center justify-center mt-4 gap-2">
                <button
                  onClick={() => setCompareMode(false)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${!compareMode ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary hover:text-text'}`}
                >
                  Single Analysis
                </button>
                <button
                  onClick={() => setCompareMode(true)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${compareMode ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary hover:text-text'}`}
                >
                  Compare <span className="text-[10px]">↔</span>
                </button>
              </div>

              {/* Competitor inputs */}
              {compareMode && (
                <div className="mt-4 space-y-2.5" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                  {competitorUrls.map((compUrl, idx) => (
                    <div key={idx} className="relative flex items-center">
                      <span className="absolute left-3 text-[10px] text-text-muted font-medium uppercase tracking-wider">Competitor {idx + 1}</span>
                      <input
                        type="url"
                        value={compUrl}
                        onChange={(e) => {
                          const next = [...competitorUrls];
                          next[idx] = e.target.value;
                          setCompetitorUrls(next);
                        }}
                        placeholder="competitor.com"
                        className="w-full h-11 pl-28 pr-4 rounded-lg bg-bg-card border border-border focus:border-accent/50 focus:ring-1 focus:ring-accent/20 outline-none text-text placeholder-text-muted transition-all text-sm"
                        disabled={isLoading}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Visual stepper */}
              {isLoading && (
                <div className="mt-8 flex items-center justify-center gap-0" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                  {PHASES.map((p, i) => {
                    const phaseIndex = PHASES.findIndex(ph => ph.id === phase);
                    const isActive = i === phaseIndex;
                    const isDone = i < phaseIndex;

                    return (
                      <div key={p.id} className="flex items-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
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
                            <div className={`text-xs font-medium ${isActive ? 'text-text' : isDone ? 'text-score-pass' : 'text-text-muted'}`}>
                              {p.label}
                            </div>
                            {isActive && (
                              <div className="text-[11px] text-text-secondary" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                                {phaseDetail || p.desc}
                              </div>
                            )}
                          </div>
                        </div>
                        {i < PHASES.length - 1 && (
                          <div className={`w-12 h-px mx-2 mt-[-20px] ${isDone ? 'bg-score-pass/30' : 'bg-border'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {error && (() => {
                const guidance = getErrorGuidance(error);
                return (
                  <div className="mt-5 p-5 rounded-xl bg-bg-card border border-border border-l-4 border-l-danger" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className="text-danger shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-text text-[15px]">{guidance.title}</h4>
                        <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{guidance.suggestion}</p>
                        <div className="flex items-center gap-3 mt-4">
                          <button
                            onClick={handleAnalyze}
                            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <RotateCcw size={13} />
                            Try Again
                          </button>
                          <button
                            onClick={() => { setError(''); setPhase('idle'); }}
                            className="px-4 py-2 rounded-lg bg-bg-elevated text-text-secondary hover:text-text text-sm font-medium transition-all cursor-pointer"
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
          </div>
        </div>
      </header>
      )}

      {/* ── Shared Result Banner ──────────────────────────────────────── */}
      {sharedResult && !analysis && (
        <div className="max-w-6xl mx-auto px-6 pt-8">
          <SharedResultView result={sharedResult} onReanalyze={handleAnalyze} />
        </div>
      )}

      {/* ── Landing Sections ──────────────────────────────────────────── */}
      {!isLoading && phase !== 'error' && (
        <>
          {/* How it Works */}
          <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4 tracking-tight">How it Works</h2>
            <p className="text-text-secondary text-center mb-16 max-w-lg mx-auto text-base">
              From URL to actionable insights in four steps
            </p>

            {/* Pipeline steps */}
            <div className="relative max-w-3xl mx-auto mb-20">
              {/* Connector line (desktop) */}
              <div className="hidden md:block absolute top-8 left-[12.5%] right-[12.5%] h-px bg-border" />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {PIPELINE_STEPS.map((step, i) => (
                  <div key={i} className="flex flex-col items-center gap-3.5 text-center">
                    <div className="relative">
                      <div
                        className="w-16 h-16 rounded-xl border border-accent/20 flex items-center justify-center relative z-10"
                        style={{ boxShadow: '0 0 0 8px var(--color-bg)', background: 'linear-gradient(var(--color-accent-dim), var(--color-accent-dim)), var(--color-bg)' }}
                      >
                        <step.icon size={24} className="text-accent-light" />
                      </div>
                      <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center z-20">
                        {i + 1}
                      </span>
                    </div>
                    <div>
                      <div className="text-[15px] font-semibold text-text">{step.title}</div>
                      <div className="text-sm text-text-secondary mt-1">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  icon: FileText,
                  title: 'GEO Analysis',
                  desc: '11 criteria based on peer-reviewed research into how generative engines cite and surface content.',
                  color: 'var(--color-geo)',
                  badge: 'Princeton Research',
                  criteria: GEO_CRITERIA,
                },
                {
                  icon: Bot,
                  title: 'AEO Analysis',
                  desc: '12 criteria derived from patterns observed in top AI-adopted platforms like Stripe, Twilio, and GitHub.',
                  color: 'var(--color-aeo)',
                  badge: 'Agent-Ready',
                  criteria: AEO_CRITERIA,
                },
                {
                  icon: Sparkles,
                  title: 'AI Insights',
                  desc: 'Claude-powered strategic analysis with a 90-day roadmap, quick wins, and competitive gaps.',
                  color: 'var(--color-score-pass)',
                  badge: 'AI-Powered',
                  criteria: null,
                },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="p-7 rounded-xl bg-bg-card border border-border hover:bg-bg-elevated/50 transition-all group"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex items-center gap-2.5 mb-5">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105"
                      style={{ background: `color-mix(in srgb, ${feature.color} 7%, transparent)` }}
                    >
                      <feature.icon size={20} style={{ color: feature.color }} />
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest" style={{ color: feature.color, background: `color-mix(in srgb, ${feature.color} 6%, transparent)` }}>
                      {feature.badge}
                    </span>
                  </div>
                  <h3 className="font-semibold text-text text-base mb-2">{feature.title}</h3>
                  <p className="text-[15px] text-text-secondary leading-relaxed">{feature.desc}</p>
                  {feature.criteria && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4">
                      {feature.criteria.map((c: string, j: number) => (
                        <div key={j} className="flex items-center gap-2 text-[13px] text-text-secondary">
                          <div className="w-1 h-1 rounded-full shrink-0" style={{ background: feature.color }} />
                          {c}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Why It Matters */}
          <section id="why-it-matters" className="border-t border-border">
            <div className="max-w-6xl mx-auto px-6 py-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4 tracking-tight">Why It Matters</h2>
              <p className="text-text-secondary text-center mb-16 max-w-lg mx-auto text-base">
                AI is reshaping how users discover and interact with content
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {STATS.map((stat, i) => (
                  <div key={i} className="flex items-center gap-4 p-5 rounded-xl bg-bg-card border border-border">
                    <div className="w-1 h-12 rounded-full shrink-0" style={{ background: stat.color }} />
                    <div>
                      <div className="font-mono text-2xl sm:text-3xl font-bold tracking-tight">{stat.stat}</div>
                      <div className="text-xs text-text-secondary leading-snug mt-0.5">{stat.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Bottom CTA */}
          <section className="border-t border-border">
            <div className="max-w-2xl mx-auto px-6 py-20 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">Ready to see where you stand?</h2>
              <p className="text-text-secondary text-base mb-8">
                Get your GEO + AEO scores in under 30 seconds.
              </p>
              <button
                onClick={() => { inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => inputRef.current?.focus(), 500); }}
                className="inline-flex items-center gap-2 h-12 px-8 rounded-xl bg-accent hover:bg-accent-light text-white font-semibold text-[15px] transition-all analyze-glow cursor-pointer"
              >
                <span>Analyze Your Site</span>
                <ArrowUp size={16} />
              </button>
            </div>
          </section>
        </>
      )}

      {/* ── Results ────────────────────────────────────────────────────── */}
      {analysis && (
        <div ref={resultsRef} className="max-w-6xl mx-auto px-6 pb-24">
          {session?.user && (
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors mb-5"
            >
              <ArrowLeft size={14} />
              Back to Dashboard
            </Link>
          )}
          <AnalysisResultsView
            analysis={analysis}
            competitors={competitors.filter((c): c is SiteAnalysis => c !== null)}
            savedToHistory={savedToHistory}
          />
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-border py-8 text-center">
        <p className="text-xs text-text-muted">
          &copy; {new Date().getFullYear()} RankAI &mdash; Methodology based on Princeton GEO research (KDD 2024) and analysis of 680M+ AI citations.
        </p>
      </footer>
    </div>
  );
}

/* ── Helpers for SharedResultView ──────────────────────────────────── */
function formatCategoryKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
}

/* ── Shared Result View ───────────────────────────────────────────── */
function SharedResultView({ result, onReanalyze }: { result: ShareableResult; onReanalyze: () => void }) {
  return (
    <div style={{ animation: 'fadeInUp 0.4s ease-out' }}>
      <div className="p-4 rounded-xl bg-accent-dim border border-accent/20 mb-6 flex items-center gap-3">
        <Share2 size={16} className="text-accent-light shrink-0" />
        <p className="text-sm text-accent-light flex-1">This is a shared snapshot. Analyze again for full details.</p>
        <button onClick={onReanalyze} className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium cursor-pointer hover:bg-accent-light transition-all">
          Analyze
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        <div className="p-7 rounded-xl bg-bg-card border border-border flex flex-col items-center justify-center">
          <ScoreRing score={result.g} grade={result.g >= 90 ? 'A+' : result.g >= 80 ? 'A' : result.g >= 70 ? 'B' : result.g >= 60 ? 'C' : result.g >= 50 ? 'D' : 'F'} size={120} label="GEO Score" />
        </div>
        <div className="p-9 rounded-xl bg-bg-card border border-border flex flex-col items-center justify-center">
          <ScoreRing score={result.o} grade={result.o >= 90 ? 'A+' : result.o >= 80 ? 'A' : result.o >= 70 ? 'B' : result.o >= 60 ? 'C' : result.o >= 50 ? 'D' : 'F'} size={170} label="Overall Score" />
          <p className="text-xs text-text-muted mt-2 font-mono">{result.p} pages &middot; {SITE_TYPE_LABELS[result.st as SiteType] || result.st}</p>
        </div>
        <div className="p-7 rounded-xl bg-bg-card border border-border flex flex-col items-center justify-center">
          <ScoreRing score={result.a} grade={result.a >= 90 ? 'A+' : result.a >= 80 ? 'A' : result.a >= 70 ? 'B' : result.a >= 60 ? 'C' : result.a >= 50 ? 'D' : 'F'} size={120} label="AEO Score" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="p-7 rounded-xl bg-bg-card border border-border">
          <h3 className="font-semibold text-base mb-4">GEO Categories</h3>
          <div className="space-y-3">
            {Object.entries(result.gc).map(([key, score]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-sm text-text-secondary w-36 truncate">{formatCategoryKey(key)}</span>
                <div className="flex-1 h-1.5 bg-track rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${score}%`, background: getScoreColor(score) }} />
                </div>
                <span className="text-xs font-mono text-text-muted w-7 text-right tabular-nums">{score}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-7 rounded-xl bg-bg-card border border-border">
          <h3 className="font-semibold text-base mb-4">AEO Categories</h3>
          <div className="space-y-3">
            {Object.entries(result.ac).map(([key, score]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-sm text-text-secondary w-36 truncate">{formatCategoryKey(key)}</span>
                <div className="flex-1 h-1.5 bg-track rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${score}%`, background: getScoreColor(score) }} />
                </div>
                <span className="text-xs font-mono text-text-muted w-7 text-right tabular-nums">{score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

