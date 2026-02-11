'use client';

import { useState, useRef } from 'react';
import {
  Search, Loader2, Globe, Sparkles, Bot, FileText, Code2,
  BarChart3, Shield, Zap, ExternalLink, ArrowRight, Target,
  AlertTriangle, Clock, ArrowUp
} from 'lucide-react';
import { SiteAnalysis, GEOAnalysis, AEOAnalysis } from '@/lib/types';
import { ScoreRing, PositionLabel, getScoreColor } from '@/components/score-ring';
import { CategoryCard } from '@/components/category-card';
import { RecommendationCard } from '@/components/recommendation-card';

type AnalysisPhase = 'idle' | 'crawling' | 'analyzing-geo' | 'analyzing-aeo' | 'generating-insights' | 'done' | 'error';

const PHASES = [
  { id: 'crawling', label: 'Crawling', desc: 'Discovering pages' },
  { id: 'analyzing-geo', label: 'GEO Analysis', desc: 'Scoring content' },
  { id: 'analyzing-aeo', label: 'AEO Analysis', desc: 'Evaluating readiness' },
  { id: 'generating-insights', label: 'AI Insights', desc: 'Generating strategy' },
] as const;

export default function Home() {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<AnalysisPhase>('idle');
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'geo' | 'aeo' | 'recommendations' | 'insights'>('overview');
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleAnalyze = async () => {
    if (!url.trim()) return;

    setPhase('crawling');
    setError('');
    setAnalysis(null);

    try {
      const phaseTimer = setInterval(() => {
        setPhase(prev => {
          if (prev === 'crawling') return 'analyzing-geo';
          if (prev === 'analyzing-geo') return 'analyzing-aeo';
          if (prev === 'analyzing-aeo') return 'generating-insights';
          return prev;
        });
      }, 3000);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), maxPages: 10 }),
      });

      clearInterval(phaseTimer);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Analysis failed');
      }

      const data = await response.json();
      setAnalysis(data);
      setPhase('done');

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
      {/* Hero */}
      <header className="relative overflow-hidden">
        {/* Mesh gradient background - Stripe-inspired, research: subtle gradient adds depth */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#6366f1]/[0.04] rounded-full blur-[128px]" />
          <div className="absolute top-32 right-1/4 w-[400px] h-[400px] bg-[#60a5fa]/[0.03] rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 pt-14 pb-20">
          {/* Nav - minimal, Linear-style */}
          <nav className="flex items-center justify-between mb-20">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
                <Target size={14} className="text-white" />
              </div>
              <span className="text-[15px] font-bold tracking-tight">RankAI</span>
            </div>
            <div className="flex items-center gap-6 text-[13px] text-text-secondary">
              <a href="#how-it-works" className="hover:text-text transition-colors">How it Works</a>
              <a href="#methodology" className="hover:text-text transition-colors">Methodology</a>
            </div>
          </nav>

          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-dim border border-accent/20 text-accent-light text-xs font-medium mb-8">
              <Bot size={13} />
              <span>22 criteria across GEO + AEO</span>
            </div>

            <h1 className="text-[44px] sm:text-[56px] font-bold tracking-[-0.03em] leading-[1.1] mb-5">
              Is your site ready for
              <br />
              <span className="bg-gradient-to-r from-[#818cf8] via-[#60a5fa] to-[#34d399] bg-clip-text text-transparent">
                AI-powered discovery?
              </span>
            </h1>

            <p className="text-base text-text-secondary leading-relaxed mb-12 max-w-xl mx-auto">
              Analyze your website for Generative Engine Optimization and
              Agentic Engine Optimization. Research-backed scoring with actionable fixes.
            </p>

            {/* Input - clean, Vercel-inspired */}
            <div className="max-w-xl mx-auto">
              <div className="relative flex items-center">
                <div className="absolute left-4 text-text-muted">
                  <Globe size={18} />
                </div>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleAnalyze()}
                  placeholder="docs.stripe.com"
                  className="w-full h-12 pl-11 pr-32 rounded-xl bg-bg-card border border-border focus:border-accent/50 focus:ring-1 focus:ring-accent/20 outline-none text-text placeholder-text-muted transition-all text-[15px]"
                  disabled={isLoading}
                />
                <button
                  onClick={handleAnalyze}
                  disabled={!url.trim() || isLoading}
                  className="absolute right-1.5 h-9 px-5 rounded-[9px] bg-accent hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm transition-all flex items-center gap-2"
                >
                  {isLoading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <>
                      <span>Analyze</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>

              {/* Visual stepper - research: accessiBe step visualization */}
              {isLoading && (
                <div className="mt-8 flex items-center justify-center gap-0" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                  {PHASES.map((p, i) => {
                    const phaseIndex = PHASES.findIndex(ph => ph.id === phase);
                    const isActive = i === phaseIndex;
                    const isDone = i < phaseIndex;
                    const isPending = i > phaseIndex;

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
                                {p.desc}
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

              {error && (
                <div className="mt-5 p-3 rounded-xl bg-danger/8 border border-danger/15 text-danger text-sm text-center">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Features grid - only shown when idle */}
      {!analysis && phase === 'idle' && (
        <section id="how-it-works" className="max-w-5xl mx-auto px-6 pb-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: FileText,
                title: 'GEO Analysis',
                desc: '10 criteria including content structure, schema markup, citation-worthiness, and language patterns.',
                color: '#a78bfa',
                badge: 'Princeton Research',
              },
              {
                icon: Bot,
                title: 'AEO Analysis',
                desc: '12 criteria including llms.txt, MCP servers, API documentation, and machine-readable sitemaps.',
                color: '#60a5fa',
                badge: 'Agent-Ready',
              },
              {
                icon: Sparkles,
                title: 'AI Insights',
                desc: 'Claude-powered strategic analysis with a 90-day roadmap, quick wins, and competitive gaps.',
                color: '#34d399',
                badge: 'AI-Powered',
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="p-6 rounded-xl bg-bg-card hover:bg-bg-elevated/50 transition-all group"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105"
                    style={{ background: `${feature.color}12` }}
                  >
                    <feature.icon size={18} style={{ color: feature.color }} />
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest" style={{ color: feature.color, background: `${feature.color}10` }}>
                    {feature.badge}
                  </span>
                </div>
                <h3 className="font-semibold text-text text-[15px] mb-1.5">{feature.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>

          {/* Methodology - research-backed stats */}
          <div id="methodology" className="mt-20">
            <h2 className="text-xl font-bold text-center mb-2 tracking-tight">Research-Backed Methodology</h2>
            <p className="text-center text-text-secondary text-sm mb-10 max-w-lg mx-auto">
              Grounded in the Princeton GEO paper (KDD 2024), analysis of 680M+ AI citations,
              and patterns from top AI-adopted platforms.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { stat: '25-37%', label: 'Visibility boost from adding statistics', icon: BarChart3 },
                { stat: '3.2x', label: 'Higher citation rates for FAQ content', icon: Code2 },
                { stat: '844K+', label: 'Websites using the llms.txt standard', icon: Shield },
                { stat: '527%', label: 'Increase in AI-sourced traffic in 2025', icon: Zap },
              ].map((stat, i) => (
                <div key={i} className="p-4 rounded-xl bg-bg-card text-center">
                  <div className="font-mono text-2xl font-bold text-text tracking-tight mb-1">{stat.stat}</div>
                  <div className="text-[11px] text-text-secondary leading-snug">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Results */}
      {analysis && (
        <div ref={resultsRef} className="max-w-6xl mx-auto px-6 pb-24" style={{ animation: 'fadeInUp 0.6s ease-out' }}>

          {/* Score hero - featured overall with flanking GEO/AEO (research: Ahrefs big number pattern) */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr_1fr] gap-4 mb-6">
            <div className="p-6 rounded-xl bg-bg-card flex flex-col items-center justify-center">
              <ScoreRing score={analysis.geoScore} grade={analysis.geoGrade} size={110} label="GEO Score" delay={200} />
              <PositionLabel score={analysis.geoScore} />
              <p className="text-[11px] text-text-muted mt-2">Generative Engine</p>
            </div>

            <div className="p-8 rounded-xl bg-bg-card flex flex-col items-center justify-center relative overflow-hidden">
              {/* Subtle gradient tint based on score */}
              <div
                className="absolute inset-0 opacity-[0.03]"
                style={{ background: `radial-gradient(circle at center, ${getScoreColor(analysis.overallScore)}, transparent 70%)` }}
              />
              <div className="relative">
                <ScoreRing score={analysis.overallScore} grade={analysis.overallGrade} size={160} label="Overall Score" />
                <div className="flex items-center justify-center gap-2 mt-2">
                  <PositionLabel score={analysis.overallScore} />
                  <span className="text-[11px] text-text-muted font-mono tabular-nums">{analysis.pagesAnalyzed} pages</span>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-xl bg-bg-card flex flex-col items-center justify-center">
              <ScoreRing score={analysis.aeoScore} grade={analysis.aeoGrade} size={110} label="AEO Score" delay={400} />
              <PositionLabel score={analysis.aeoScore} />
              <p className="text-[11px] text-text-muted mt-2">Agentic Engine</p>
            </div>
          </div>

          {/* URL bar + Issue summary (research: Semrush severity summary) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-bg-card flex-1 min-w-0">
              <Globe size={15} className="text-text-muted shrink-0" />
              <a href={analysis.url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-light hover:underline truncate flex items-center gap-1.5">
                {analysis.url}
                <ExternalLink size={11} />
              </a>
              <span className="text-[11px] text-text-muted ml-auto shrink-0 font-mono tabular-nums">
                {new Date(analysis.crawledAt).toLocaleDateString()}
              </span>
            </div>

            <IssueSummaryBar recommendations={analysis.topRecommendations} />
          </div>

          {/* Tabs - clean, Linear-inspired */}
          <div className="flex items-center gap-0.5 mb-6 border-b border-white/[0.04] overflow-x-auto">
            {([
              { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
              { id: 'geo' as const, label: 'GEO Details', icon: FileText },
              { id: 'aeo' as const, label: 'AEO Details', icon: Bot },
              { id: 'recommendations' as const, label: 'Recommendations', icon: Zap },
              { id: 'insights' as const, label: 'AI Insights', icon: Sparkles },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-accent text-text'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          <div key={activeTab} style={{ animation: 'fadeIn 0.25s ease-out' }}>
            {activeTab === 'overview' && <OverviewTab analysis={analysis} />}
            {activeTab === 'geo' && <GEOTab geo={analysis.geo} />}
            {activeTab === 'aeo' && <AEOTab aeo={analysis.aeo} />}
            {activeTab === 'recommendations' && <RecommendationsTab analysis={analysis} />}
            {activeTab === 'insights' && <InsightsTab insights={analysis.aiInsights} />}
          </div>
        </div>
      )}

      <footer className="border-t border-white/[0.04] py-8 text-center">
        <p className="text-[11px] text-text-muted tracking-wide">
          RankAI &mdash; Methodology based on Princeton GEO research (KDD 2024) and analysis of 680M+ AI citations
        </p>
      </footer>
    </div>
  );
}

/* Issue summary bar - research: Semrush/Ahrefs severity count */
function IssueSummaryBar({ recommendations }: { recommendations: SiteAnalysis['topRecommendations'] }) {
  const counts = {
    critical: recommendations.filter(r => r.priority === 'critical').length,
    high: recommendations.filter(r => r.priority === 'high').length,
    medium: recommendations.filter(r => r.priority === 'medium').length,
    low: recommendations.filter(r => r.priority === 'low').length,
  };

  const items = [
    { count: counts.critical, label: 'Critical', color: '#f87171', icon: AlertTriangle },
    { count: counts.high, label: 'High', color: '#fb923c', icon: Zap },
    { count: counts.medium, label: 'Medium', color: '#fbbf24', icon: ArrowUp },
    { count: counts.low, label: 'Low', color: '#60a5fa', icon: Clock },
  ];

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-bg-card">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: item.color }}
          />
          <span className="font-mono text-xs font-bold tabular-nums" style={{ color: item.color }}>{item.count}</span>
          <span className="text-[10px] text-text-muted hidden sm:inline">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/* Overview Tab - bento grid layout (research: 2026 dashboard trend) */
function OverviewTab({ analysis }: { analysis: SiteAnalysis }) {
  const geoEntries: { key: keyof GEOAnalysis; name: string }[] = [
    { key: 'contentStructure', name: 'Content Structure' },
    { key: 'schemaMarkup', name: 'Schema Markup' },
    { key: 'topicalAuthority', name: 'Topical Authority' },
    { key: 'citationWorthiness', name: 'Citation Worthiness' },
    { key: 'contentFreshness', name: 'Content Freshness' },
    { key: 'languagePatterns', name: 'Language Patterns' },
    { key: 'metaInformation', name: 'Meta Information' },
    { key: 'technicalHealth', name: 'Technical Health' },
    { key: 'contentUniqueness', name: 'Content Uniqueness' },
    { key: 'multiFormatContent', name: 'Multi-Format Content' },
  ];

  const aeoEntries: { key: keyof AEOAnalysis; name: string }[] = [
    { key: 'documentationStructure', name: 'Doc Structure' },
    { key: 'apiDocumentation', name: 'API Docs' },
    { key: 'codeExamples', name: 'Code Examples' },
    { key: 'llmsTxt', name: 'llms.txt' },
    { key: 'sdkQuality', name: 'SDK Quality' },
    { key: 'authSimplicity', name: 'Auth' },
    { key: 'quickstartGuide', name: 'Quickstart' },
    { key: 'errorMessages', name: 'Error Msgs' },
    { key: 'changelogVersioning', name: 'Changelog' },
    { key: 'mcpServer', name: 'MCP Server' },
    { key: 'integrationGuides', name: 'Integrations' },
    { key: 'machineReadableSitemaps', name: 'Sitemaps' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* GEO Breakdown */}
      <div className="p-6 rounded-xl bg-bg-card">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-7 h-7 rounded-lg bg-geo-dim flex items-center justify-center">
            <FileText size={14} className="text-geo" />
          </div>
          <h3 className="font-semibold text-[15px]">GEO Breakdown</h3>
          <span className="ml-auto text-sm font-mono text-geo tabular-nums">{analysis.geoScore}/100</span>
        </div>
        <div className="space-y-2.5">
          {geoEntries.map(({ key, name }) => {
            const cat = analysis.geo[key];
            const color = getScoreColor(cat.score);
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-[13px] text-text-secondary w-36 truncate">{name}</span>
                <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${cat.score}%`, background: color }}
                  />
                </div>
                <span className="text-[11px] font-mono text-text-muted w-6 text-right tabular-nums">{cat.score}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* AEO Breakdown */}
      <div className="p-6 rounded-xl bg-bg-card">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-7 h-7 rounded-lg bg-aeo-dim flex items-center justify-center">
            <Bot size={14} className="text-aeo" />
          </div>
          <h3 className="font-semibold text-[15px]">AEO Breakdown</h3>
          <span className="ml-auto text-sm font-mono text-aeo tabular-nums">{analysis.aeoScore}/100</span>
        </div>
        <div className="space-y-2.5">
          {aeoEntries.map(({ key, name }) => {
            const cat = analysis.aeo[key];
            const color = getScoreColor(cat.score);
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-[13px] text-text-secondary w-36 truncate">{name}</span>
                <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${cat.score}%`, background: color }}
                  />
                </div>
                <span className="text-[11px] font-mono text-text-muted w-6 text-right tabular-nums">{cat.score}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Priority Actions */}
      <div className="lg:col-span-2 p-6 rounded-xl bg-bg-card">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-7 h-7 rounded-lg bg-score-warn-dim flex items-center justify-center">
            <Zap size={14} className="text-score-warn" />
          </div>
          <h3 className="font-semibold text-[15px]">Top Priority Actions</h3>
          <span className="ml-auto text-[11px] text-text-muted">{analysis.topRecommendations.length} total</span>
        </div>
        <div className="space-y-2.5">
          {analysis.topRecommendations.slice(0, 5).map((rec, i) => (
            <div key={i} style={{ animation: `slideInRight 0.3s ease-out ${i * 60}ms both` }}>
              <RecommendationCard rec={rec} />
            </div>
          ))}
        </div>
      </div>

      {/* Pages Analyzed */}
      <div className="lg:col-span-2 p-6 rounded-xl bg-bg-card">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-7 h-7 rounded-lg bg-accent-dim flex items-center justify-center">
            <Globe size={14} className="text-accent-light" />
          </div>
          <h3 className="font-semibold text-[15px]">Pages Analyzed</h3>
          <span className="ml-auto text-[11px] font-mono text-text-muted tabular-nums">{analysis.pagesAnalyzed} pages</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {analysis.pageAnalyses.map((page, i) => {
            const geoScore = Math.round(
              Object.values(page.geo).reduce((sum, cat) => sum + cat.score * cat.weight, 0)
            );
            const color = getScoreColor(geoScore);
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-bg-elevated/40 hover:bg-bg-elevated/70 transition-colors">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-bold shrink-0 tabular-nums"
                  style={{ background: `${color}12`, color }}
                >
                  {geoScore}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text truncate font-medium">{page.title}</p>
                  <p className="text-[11px] text-text-muted truncate font-mono">{new URL(page.url).pathname}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GEOTab({ geo }: { geo: GEOAnalysis }) {
  const categories: { key: keyof GEOAnalysis; name: string }[] = [
    { key: 'schemaMarkup', name: 'Schema Markup & Structured Data' },
    { key: 'citationWorthiness', name: 'Citation Worthiness' },
    { key: 'contentStructure', name: 'Content Structure' },
    { key: 'contentFreshness', name: 'Content Freshness' },
    { key: 'topicalAuthority', name: 'Topical Authority' },
    { key: 'contentUniqueness', name: 'Content Uniqueness' },
    { key: 'multiFormatContent', name: 'Multi-Format Content' },
    { key: 'languagePatterns', name: 'Language Patterns' },
    { key: 'metaInformation', name: 'Meta Information' },
    { key: 'technicalHealth', name: 'Technical Health' },
  ];

  const sorted = [...categories].sort((a, b) => geo[a.key].score - geo[b.key].score);

  return (
    <div className="space-y-2.5">
      <p className="text-sm text-text-secondary mb-5">
        How well your content is optimized for AI-generated answers across ChatGPT, Perplexity, Google AI Overviews, and Claude. Sorted by lowest score.
      </p>
      {sorted.map(({ key, name }, i) => (
        <div key={key} style={{ animation: `fadeInUp 0.3s ease-out ${i * 40}ms both` }}>
          <CategoryCard name={name} category={geo[key]} type="geo" />
        </div>
      ))}
    </div>
  );
}

function AEOTab({ aeo }: { aeo: AEOAnalysis }) {
  const categories: { key: keyof AEOAnalysis; name: string }[] = [
    { key: 'llmsTxt', name: 'llms.txt File' },
    { key: 'mcpServer', name: 'MCP Server' },
    { key: 'apiDocumentation', name: 'API Documentation' },
    { key: 'quickstartGuide', name: 'Quickstart Guide' },
    { key: 'codeExamples', name: 'Code Examples' },
    { key: 'documentationStructure', name: 'Documentation Structure' },
    { key: 'authSimplicity', name: 'Authentication Simplicity' },
    { key: 'sdkQuality', name: 'SDK/Package Quality' },
    { key: 'errorMessages', name: 'Error Messages' },
    { key: 'integrationGuides', name: 'Integration Guides' },
    { key: 'machineReadableSitemaps', name: 'Machine-Readable Sitemaps' },
    { key: 'changelogVersioning', name: 'Changelog & Versioning' },
  ];

  const sorted = [...categories].sort((a, b) => aeo[a.key].score - aeo[b.key].score);

  return (
    <div className="space-y-2.5">
      <p className="text-sm text-text-secondary mb-5">
        How well your platform is optimized for autonomous AI agents. Sorted by lowest score.
      </p>
      {sorted.map(({ key, name }, i) => (
        <div key={key} style={{ animation: `fadeInUp 0.3s ease-out ${i * 40}ms both` }}>
          <CategoryCard name={name} category={aeo[key]} type="aeo" />
        </div>
      ))}
    </div>
  );
}

function RecommendationsTab({ analysis }: { analysis: SiteAnalysis }) {
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'geo' | 'aeo'>('all');

  const filtered = analysis.topRecommendations.filter(r => {
    if (filter !== 'all' && r.priority !== filter) return false;
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    return true;
  });

  const counts = {
    critical: analysis.topRecommendations.filter(r => r.priority === 'critical').length,
    high: analysis.topRecommendations.filter(r => r.priority === 'high').length,
    medium: analysis.topRecommendations.filter(r => r.priority === 'medium').length,
    low: analysis.topRecommendations.filter(r => r.priority === 'low').length,
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-[10px] text-text-muted uppercase tracking-[0.1em] font-bold mr-1">Priority:</span>
        {(['all', 'critical', 'high', 'medium', 'low'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:text-text ring-1 ring-transparent hover:ring-border'
            }`}
          >
            {f === 'all' ? `All (${analysis.topRecommendations.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f]})`}
          </button>
        ))}

        <span className="text-[10px] text-text-muted uppercase tracking-[0.1em] font-bold ml-3 mr-1">Type:</span>
        {(['all', 'geo', 'aeo'] as const).map(f => (
          <button
            key={f}
            onClick={() => setTypeFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              typeFilter === f
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:text-text ring-1 ring-transparent hover:ring-border'
            }`}
          >
            {f === 'all' ? 'All' : f.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {filtered.map((rec, i) => (
          <div key={i} style={{ animation: `fadeInUp 0.3s ease-out ${i * 30}ms both` }}>
            <RecommendationCard rec={rec} />
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-text-muted text-sm">No recommendations match the current filters.</div>
        )}
      </div>
    </div>
  );
}

function InsightsTab({ insights }: { insights: string }) {
  const html = insights
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  return (
    <div className="p-8 rounded-xl bg-bg-card">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-8 h-8 rounded-lg bg-score-pass-dim flex items-center justify-center">
          <Sparkles size={15} className="text-score-pass" />
        </div>
        <div>
          <h3 className="font-semibold text-[15px]">AI-Powered Strategic Analysis</h3>
          <p className="text-[11px] text-text-muted">Generated from your complete GEO/AEO audit</p>
        </div>
      </div>
      <div
        className="max-w-none text-sm leading-relaxed
          [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-text [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:tracking-tight
          [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-text [&_h3]:mt-5 [&_h3]:mb-2
          [&_p]:text-text-secondary [&_p]:mb-3 [&_p]:leading-relaxed
          [&_strong]:text-text [&_strong]:font-semibold
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:text-text-secondary
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:text-text-secondary
          [&_li]:mb-1.5 [&_li]:leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
