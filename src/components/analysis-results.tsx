'use client';

import { useState } from 'react';
import {
  Globe, Sparkles, Bot, FileText, BarChart3, Zap, ExternalLink,
  AlertTriangle, Clock, ArrowUp, TrendingUp, Share2, Download,
  LayoutList, Grid3X3, Check, ChevronDown
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SiteAnalysis, GEOAnalysis, AEOAnalysis, SiteType, ShareableResult } from '@/lib/types';
import { ScoreRing, PositionLabel, getScoreColor } from '@/components/score-ring';
import { CategoryCard } from '@/components/category-card';
import { RecommendationCard } from '@/components/recommendation-card';
import { ImpactMatrix } from '@/components/impact-matrix';
import { getPercentileLabel } from '@/lib/benchmarks';

export const SITE_TYPE_LABELS: Record<SiteType, string> = {
  'saas-api': 'SaaS / API',
  'ecommerce': 'E-commerce',
  'local-business': 'Local Business',
  'content-publisher': 'Content Publisher',
  'general': 'General',
};

export function getErrorGuidance(error: string): { title: string; suggestion: string } {
  if (error.includes('HTTP 403') || error.includes('HTTP 401'))
    return { title: 'Access Denied', suggestion: 'This site blocks automated crawlers. Try a different page or check if the site requires authentication.' };
  if (error.includes('HTTP 404'))
    return { title: 'Page Not Found', suggestion: 'Double-check the URL. Make sure it points to an existing page.' };
  if (error.includes('timeout') || error.includes('abort'))
    return { title: 'Request Timed Out', suggestion: 'The site took too long to respond. It might be temporarily down — try again in a few minutes.' };
  if (error.includes('ENOTFOUND') || error.includes('getaddrinfo'))
    return { title: 'Domain Not Found', suggestion: "This domain doesn't exist. Check for typos in the URL." };
  if (error.includes('Invalid URL') || error.includes('valid URL'))
    return { title: 'Invalid URL', suggestion: 'Enter a complete URL like "example.com" or "https://example.com/page".' };
  return { title: 'Analysis Failed', suggestion: 'Something went wrong. Try again or try a different URL.' };
}

export const PHASES = [
  { id: 'crawling', label: 'Crawling', desc: 'Discovering pages' },
  { id: 'analyzing-geo', label: 'GEO Analysis', desc: 'Scoring content' },
  { id: 'analyzing-aeo', label: 'AEO Analysis', desc: 'Evaluating readiness' },
  { id: 'generating-insights', label: 'AI Insights', desc: 'Generating strategy' },
] as const;

export type AnalysisPhase = 'idle' | 'crawling' | 'analyzing-geo' | 'analyzing-aeo' | 'generating-insights' | 'done' | 'error';

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

function formatCategoryKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
}

export function AnalysisResultsView({
  analysis,
  competitors = [],
  savedToHistory = false,
  initialTab = 'overview',
}: {
  analysis: SiteAnalysis;
  competitors?: SiteAnalysis[];
  savedToHistory?: boolean;
  initialTab?: 'overview' | 'geo' | 'aeo' | 'recommendations' | 'insights' | 'comparison';
}) {
  const safeInitialTab =
    initialTab === 'comparison' && competitors.length === 0 ? 'overview' : initialTab;
  const [activeTab, setActiveTab] = useState<'overview' | 'geo' | 'aeo' | 'recommendations' | 'insights' | 'comparison'>(safeInitialTab);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const hash = encodeShareableResult(analysis);
    const shareUrl = `${window.location.origin}/#r=${hash}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    window.print();
  };

  return (
    <div style={{ animation: 'fadeInUp 0.6s ease-out' }}>
      {/* URL bar + Issue summary */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-bg-card border border-border flex-1 min-w-0">
          <Globe size={16} className="text-text-muted shrink-0" />
          <a href={analysis.url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-light hover:underline truncate flex items-center gap-1.5">
            {analysis.url}
            <ExternalLink size={12} />
          </a>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest bg-accent-dim text-accent-light shrink-0">
            {SITE_TYPE_LABELS[analysis.siteType]}
          </span>
          <span className="text-xs text-text-muted shrink-0 font-mono tabular-nums">
            {new Date(analysis.crawledAt).toLocaleDateString()}
          </span>
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {savedToHistory && (
              <span className="text-[10px] text-score-pass font-medium" style={{ animation: 'fadeIn 0.3s ease-out' }}>Saved to history</span>
            )}
            <button onClick={handleShare} className="p-1.5 rounded-md hover:bg-bg-elevated transition-colors cursor-pointer" title="Copy link">
              {copied ? <Check size={14} className="text-score-pass" /> : <Share2 size={14} className="text-text-muted" />}
            </button>
            <button onClick={handleExport} className="p-1.5 rounded-md hover:bg-bg-elevated transition-colors cursor-pointer print:hidden" title="Export report">
              <Download size={14} className="text-text-muted" />
            </button>
          </div>
        </div>

        <IssueSummaryBar recommendations={analysis.topRecommendations} />
      </div>

      {/* Score hero */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr_1fr] gap-5 mb-6">
        <div className="p-7 rounded-xl bg-bg-card border border-border flex flex-col items-center justify-center">
          <ScoreRing score={analysis.geoScore} grade={analysis.geoGrade} size={120} label="GEO Score" delay={200} />
          <PositionLabel score={analysis.geoScore} />
          <p className="text-xs text-text-muted mt-2">Generative Engine</p>
          <p className="text-[10px] mt-1 font-medium" style={{ color: getScoreColor(analysis.geoScore) }}>{getPercentileLabel(analysis.geoScore, analysis.siteType)}</p>
        </div>

        <div className="p-9 rounded-xl bg-bg-card border border-border flex flex-col items-center justify-center relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{ background: `radial-gradient(circle at center, ${getScoreColor(analysis.overallScore)}, transparent 70%)` }}
          />
          <div className="relative score-hero-center">
            <ScoreRing score={analysis.overallScore} grade={analysis.overallGrade} size={170} label="Overall Score" />
            <div className="flex items-center justify-center gap-2 mt-2">
              <PositionLabel score={analysis.overallScore} />
              <span className="text-xs text-text-muted font-mono tabular-nums">{analysis.pagesAnalyzed} pages</span>
            </div>
            <p className="text-[11px] text-center mt-1 font-medium" style={{ color: getScoreColor(analysis.overallScore) }}>{getPercentileLabel(analysis.overallScore, analysis.siteType)}</p>
          </div>
        </div>

        <div className="p-7 rounded-xl bg-bg-card border border-border flex flex-col items-center justify-center">
          <ScoreRing score={analysis.aeoScore} grade={analysis.aeoGrade} size={120} label="AEO Score" delay={400} />
          <PositionLabel score={analysis.aeoScore} />
          <p className="text-xs text-text-muted mt-2">Agentic Engine</p>
          <p className="text-[10px] mt-1 font-medium" style={{ color: getScoreColor(analysis.aeoScore) }}>{getPercentileLabel(analysis.aeoScore, analysis.siteType)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 mb-6 border-b border-border overflow-x-auto tab-scroll-container">
        {([
          { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
          { id: 'geo' as const, label: 'GEO Details', icon: FileText },
          { id: 'aeo' as const, label: 'AEO Details', icon: Bot },
          { id: 'recommendations' as const, label: 'Recommendations', icon: Zap },
          { id: 'insights' as const, label: 'AI Insights', icon: Sparkles },
          ...(competitors.length > 0 ? [{ id: 'comparison' as const, label: 'Comparison', icon: BarChart3 }] : []),
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'border-accent text-text'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            <tab.icon size={15} />
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
        {activeTab === 'comparison' && competitors.length > 0 && (
          <ComparisonTab primary={analysis} competitors={competitors} />
        )}
      </div>
    </div>
  );
}

/* -- Issue Summary Bar --------------------------------------------------- */
function IssueSummaryBar({ recommendations }: { recommendations: SiteAnalysis['topRecommendations'] }) {
  const counts = {
    critical: recommendations.filter(r => r.priority === 'critical').length,
    high: recommendations.filter(r => r.priority === 'high').length,
    medium: recommendations.filter(r => r.priority === 'medium').length,
    low: recommendations.filter(r => r.priority === 'low').length,
  };

  const items = [
    { count: counts.critical, label: 'Critical', color: 'var(--color-score-fail)', icon: AlertTriangle },
    { count: counts.high, label: 'High', color: 'var(--color-score-caution)', icon: Zap },
    { count: counts.medium, label: 'Medium', color: 'var(--color-score-warn)', icon: ArrowUp },
    { count: counts.low, label: 'Low', color: 'var(--color-aeo)', icon: Clock },
  ];

  return (
    <div className="flex items-center gap-3.5 px-5 py-3 rounded-xl bg-bg-card border border-border issue-summary-bar">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: item.color }}
          />
          <span className="font-mono text-sm font-bold tabular-nums" style={{ color: item.color }}>{item.count}</span>
          <span className="text-[11px] text-text-muted hidden sm:inline">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/* -- Overview Tab -------------------------------------------------------- */
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
    { key: 'eeatSignals', name: 'E-E-A-T Signals' },
  ];

  const aeoEntries = Object.keys(analysis.aeo).map(key => ({
    key: key as keyof AEOAnalysis,
    name: formatCategoryKey(key),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* GEO Breakdown */}
      <div className="p-7 rounded-xl bg-bg-card border border-border">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-geo-dim flex items-center justify-center">
            <FileText size={16} className="text-geo" />
          </div>
          <h3 className="font-semibold text-base">GEO Breakdown</h3>
          <span className="ml-auto text-[15px] font-mono text-geo tabular-nums">{analysis.geoScore}/100</span>
        </div>
        <div className="space-y-3">
          {geoEntries.map(({ key, name }) => {
            const cat = analysis.geo[key];
            const color = getScoreColor(cat.score);
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-sm text-text-secondary w-36 truncate">{name}</span>
                <div className="flex-1 h-1.5 bg-track rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${cat.score}%`, background: color }}
                  />
                </div>
                <span className="text-xs font-mono text-text-muted w-7 text-right tabular-nums">{cat.score}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* AEO Breakdown */}
      <div className="p-7 rounded-xl bg-bg-card border border-border">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-aeo-dim flex items-center justify-center">
            <Bot size={16} className="text-aeo" />
          </div>
          <h3 className="font-semibold text-base">AEO Breakdown</h3>
          <span className="ml-auto text-[15px] font-mono text-aeo tabular-nums">{analysis.aeoScore}/100</span>
        </div>
        <div className="space-y-3">
          {aeoEntries.map(({ key, name }) => {
            const cat = analysis.aeo[key];
            const color = getScoreColor(cat.score);
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-sm text-text-secondary w-36 truncate">{name}</span>
                <div className="flex-1 h-1.5 bg-track rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${cat.score}%`, background: color }}
                  />
                </div>
                <span className="text-xs font-mono text-text-muted w-7 text-right tabular-nums">{cat.score}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Priority Actions */}
      <div className="lg:col-span-2 p-7 rounded-xl bg-bg-card border border-border">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-score-warn-dim flex items-center justify-center">
            <Zap size={16} className="text-score-warn" />
          </div>
          <h3 className="font-semibold text-base">Top Priority Actions</h3>
          <span className="ml-auto text-xs text-text-muted">{analysis.topRecommendations.length} total</span>
        </div>
        <div className="space-y-3">
          {analysis.topRecommendations.slice(0, 5).map((rec, i) => (
            <div key={i} style={{ animation: `slideInRight 0.3s ease-out ${i * 60}ms both` }}>
              <RecommendationCard rec={rec} />
            </div>
          ))}
        </div>
      </div>

      {/* Pages Analyzed */}
      <PagesAnalyzedAccordion analysis={analysis} />
    </div>
  );
}

/* -- Pages Analyzed Accordion -------------------------------------------- */
function PagesAnalyzedAccordion({ analysis }: { analysis: SiteAnalysis }) {
  const [pagesOpen, setPagesOpen] = useState(false);

  return (
    <div className="lg:col-span-2 p-7 rounded-xl bg-bg-card border border-border">
      <button
        onClick={() => setPagesOpen(!pagesOpen)}
        className="w-full flex items-center gap-2.5 text-left cursor-pointer"
      >
        <div className="w-8 h-8 rounded-lg bg-accent-dim flex items-center justify-center">
          <Globe size={16} className="text-accent-light" />
        </div>
        <h3 className="font-semibold text-base">Pages Analyzed</h3>
        <span className="ml-auto text-xs font-mono text-text-muted tabular-nums">{analysis.pagesAnalyzed} pages</span>
        <ChevronDown
          size={16}
          className={`text-text-muted transition-transform duration-200 ${pagesOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {pagesOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-6">
          {analysis.pageAnalyses.map((page, i) => {
            const geoScore = Math.round(
              Object.values(page.geo).reduce((sum, cat) => sum + cat.score * cat.weight, 0)
            );
            const color = getScoreColor(geoScore);
            return (
              <div key={i} className="flex items-center gap-3 p-3.5 rounded-lg bg-bg-elevated/40 hover:bg-bg-elevated/70 transition-colors">
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-mono font-bold shrink-0 tabular-nums"
                  style={{ background: `color-mix(in srgb, ${color} 7%, transparent)`, color }}
                >
                  {geoScore}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-text truncate font-medium">{page.title}</p>
                  <p className="text-xs text-text-muted truncate font-mono">{new URL(page.url).pathname}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -- GEO Tab ------------------------------------------------------------- */
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
    { key: 'eeatSignals', name: 'E-E-A-T Signals' },
  ];

  const sorted = [...categories].sort((a, b) => geo[a.key].score - geo[b.key].score);

  return (
    <div className="space-y-3">
      <p className="text-[15px] text-text-secondary mb-6">
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

/* -- AEO Tab ------------------------------------------------------------- */
function AEOTab({ aeo }: { aeo: AEOAnalysis }) {
  const categories = Object.keys(aeo).map(key => ({
    key: key as keyof AEOAnalysis,
    name: formatCategoryKey(key),
  }));

  const sorted = [...categories].sort((a, b) => aeo[a.key].score - aeo[b.key].score);

  return (
    <div className="space-y-3">
      <p className="text-[15px] text-text-secondary mb-6">
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

/* -- Recommendations Tab ------------------------------------------------- */
function RecommendationsTab({ analysis }: { analysis: SiteAnalysis }) {
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'geo' | 'aeo'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('list');

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
      <div className="flex flex-wrap items-center gap-2.5 mb-6">
        <span className="text-[11px] text-text-muted uppercase tracking-[0.1em] font-bold mr-1">Priority:</span>
        {(['all', 'critical', 'high', 'medium', 'low'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              filter === f
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:text-text ring-1 ring-transparent hover:ring-border'
            }`}
          >
            {f === 'all' ? `All (${analysis.topRecommendations.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f]})`}
          </button>
        ))}

        <span className="text-[11px] text-text-muted uppercase tracking-[0.1em] font-bold ml-3 mr-1">Type:</span>
        {(['all', 'geo', 'aeo'] as const).map(f => (
          <button
            key={f}
            onClick={() => setTypeFilter(f)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              typeFilter === f
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:text-text ring-1 ring-transparent hover:ring-border'
            }`}
          >
            {f === 'all' ? 'All' : f.toUpperCase()}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-all cursor-pointer ${viewMode === 'list' ? 'bg-accent text-white' : 'text-text-muted hover:text-text'}`}
            title="List view"
          >
            <LayoutList size={15} />
          </button>
          <button
            onClick={() => setViewMode('matrix')}
            className={`p-2 rounded-lg transition-all cursor-pointer ${viewMode === 'matrix' ? 'bg-accent text-white' : 'text-text-muted hover:text-text'}`}
            title="Matrix view"
          >
            <Grid3X3 size={15} />
          </button>
        </div>
      </div>

      {viewMode === 'matrix' ? (
        <ImpactMatrix recommendations={filtered} />
      ) : (
        <div className="space-y-3">
          {filtered.map((rec, i) => (
            <div key={i} style={{ animation: `fadeInUp 0.3s ease-out ${i * 30}ms both` }}>
              <RecommendationCard rec={rec} />
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-text-muted text-[15px]">No recommendations match the current filters.</div>
          )}
        </div>
      )}
    </div>
  );
}

/* -- Insights Tab -------------------------------------------------------- */
function InsightsTab({ insights }: { insights: string }) {
  return (
    <div className="p-9 rounded-xl bg-bg-card border border-border">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-lg bg-accent-dim flex items-center justify-center">
          <Sparkles size={17} className="text-accent-light" />
        </div>
        <div>
          <h3 className="font-semibold text-base">AI-Powered Strategic Analysis</h3>
          <p className="text-xs text-text-muted">Generated from your complete GEO/AEO audit</p>
        </div>
      </div>
      <div className="max-w-none text-[15px] leading-relaxed text-text-secondary
          [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-text [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:tracking-tight
          [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-text [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:tracking-tight
          [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-text [&_h3]:mt-5 [&_h3]:mb-2
          [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-text [&_h4]:mt-4 [&_h4]:mb-1.5
          [&_p]:mb-3 [&_p]:leading-relaxed
          [&_strong]:text-text [&_strong]:font-semibold
          [&_em]:italic
          [&_a]:text-accent-light [&_a]:underline [&_a]:underline-offset-2
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3
          [&_li]:mb-1.5 [&_li]:leading-relaxed
          [&_li_ul]:mt-1.5 [&_li_ol]:mt-1.5
          [&_code]:text-[13px] [&_code]:font-mono [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:bg-bg-elevated [&_code]:text-accent-light
          [&_pre]:my-4 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:bg-bg-elevated [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-text-secondary
          [&_blockquote]:border-l-2 [&_blockquote]:border-accent/30 [&_blockquote]:pl-4 [&_blockquote]:my-4 [&_blockquote]:italic [&_blockquote]:text-text-muted
          [&_hr]:border-border [&_hr]:my-6
          [&_table]:w-full [&_table]:my-4 [&_table]:text-sm
          [&_th]:text-left [&_th]:py-2 [&_th]:px-3 [&_th]:border-b [&_th]:border-border [&_th]:text-text [&_th]:font-semibold
          [&_td]:py-2 [&_td]:px-3 [&_td]:border-b [&_td]:border-border/50">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{insights}</ReactMarkdown>
      </div>
    </div>
  );
}

/* -- Comparison Tab ------------------------------------------------------ */
function ComparisonTab({ primary, competitors }: { primary: SiteAnalysis; competitors: SiteAnalysis[] }) {
  const allSites = [primary, ...competitors];
  const allCategories = new Set<string>();
  for (const site of allSites) {
    Object.keys(site.geo).forEach(k => allCategories.add(`geo:${k}`));
    Object.keys(site.aeo).forEach(k => allCategories.add(`aeo:${k}`));
  }

  const getDomain = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };
  const primaryDomain = getDomain(primary.url);

  // Compute advantages
  const advantages: string[] = [];
  const disadvantages: string[] = [];
  const geoKeys = Object.keys(primary.geo) as (keyof GEOAnalysis)[];
  for (const key of geoKeys) {
    const myScore = primary.geo[key].score;
    const avgComp = competitors.reduce((s, c) => s + (c.geo[key]?.score || 0), 0) / competitors.length;
    const diff = Math.round(myScore - avgComp);
    if (diff > 10) advantages.push(`You lead in ${formatCategoryKey(key)} (+${diff} pts vs competitor avg)`);
    if (diff < -10) disadvantages.push(`You trail in ${formatCategoryKey(key)} (${diff} pts vs competitor avg)`);
  }

  return (
    <div className="space-y-6">
      {/* Side-by-side score rings */}
      <div className={`grid gap-5`} style={{ gridTemplateColumns: `repeat(${allSites.length}, 1fr)` }}>
        {allSites.map((site, i) => (
          <div key={i} className="p-6 rounded-xl bg-bg-card border border-border flex flex-col items-center">
            <p className="text-sm font-medium text-text mb-4 truncate w-full text-center">{getDomain(site.url)}</p>
            <ScoreRing score={site.overallScore} grade={site.overallGrade} size={100} label="Overall" />
            <div className="flex gap-4 mt-4">
              <div className="text-center">
                <span className="text-lg font-mono font-bold text-geo">{site.geoScore}</span>
                <p className="text-[10px] text-text-muted">GEO</p>
              </div>
              <div className="text-center">
                <span className="text-lg font-mono font-bold text-aeo">{site.aeoScore}</span>
                <p className="text-[10px] text-text-muted">AEO</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Category comparison table */}
      <div className="p-7 rounded-xl bg-bg-card border border-border overflow-x-auto">
        <h3 className="font-semibold text-base mb-4">Category Comparison</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 text-text-muted font-medium">Category</th>
              {allSites.map((site, i) => (
                <th key={i} className="text-center py-2 px-2 text-text-muted font-medium">{getDomain(site.url)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {geoKeys.map(key => {
              const scores = allSites.map(s => s.geo[key]?.score || 0);
              const maxScore = Math.max(...scores);
              const minScore = Math.min(...scores);
              return (
                <tr key={key} className="border-b border-border/50">
                  <td className="py-2 pr-4 text-text-secondary">{formatCategoryKey(key)}</td>
                  {scores.map((score, i) => (
                    <td key={i} className="text-center py-2 px-2">
                      <span
                        className="font-mono text-sm font-medium tabular-nums"
                        style={{ color: score === maxScore && scores.length > 1 ? 'var(--color-score-pass)' : score === minScore && scores.length > 1 ? 'var(--color-score-fail)' : 'var(--color-text-secondary)' }}
                      >
                        {score}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Advantages / Disadvantages */}
      {(advantages.length > 0 || disadvantages.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {advantages.length > 0 && (
            <div className="p-6 rounded-xl bg-bg-card border border-border">
              <h3 className="font-semibold text-score-pass text-sm mb-3">Advantages</h3>
              <ul className="space-y-2">
                {advantages.map((a, i) => (
                  <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                    <TrendingUp size={13} className="text-score-pass shrink-0 mt-0.5" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {disadvantages.length > 0 && (
            <div className="p-6 rounded-xl bg-bg-card border border-border">
              <h3 className="font-semibold text-score-fail text-sm mb-3">Disadvantages</h3>
              <ul className="space-y-2">
                {disadvantages.map((d, i) => (
                  <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                    <AlertTriangle size={13} className="text-score-fail shrink-0 mt-0.5" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
