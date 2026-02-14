import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { AEOAnalysis, CategoryScore, GEOAnalysis, SiteAnalysis } from '@/lib/types';
import { buildReportFilename, generateAnalysisReportPdf } from './pdf-report';

function makeCategory(score: number, weight: number): CategoryScore {
  return {
    score,
    grade: score >= 85 ? 'A' : score >= 70 ? 'B' : 'C',
    weight,
    findings: [
      {
        check: 'Sample check',
        status: score >= 70 ? 'pass' : 'partial',
        details: `Observed score ${score}`,
        points: Math.max(1, Math.round(score / 10)),
        maxPoints: 10,
      },
    ],
    recommendations: ['Improve this category with better structure.'],
  };
}

function makeGeo(base: number): GEOAnalysis {
  return {
    contentStructure: makeCategory(base, 0.12),
    schemaMarkup: makeCategory(base - 2, 0.13),
    topicalAuthority: makeCategory(base - 4, 0.1),
    citationWorthiness: makeCategory(base - 6, 0.13),
    contentFreshness: makeCategory(base - 8, 0.08),
    languagePatterns: makeCategory(base - 3, 0.08),
    metaInformation: makeCategory(base - 1, 0.03),
    technicalHealth: makeCategory(base - 5, 0.05),
    contentUniqueness: makeCategory(base - 7, 0.1),
    multiFormatContent: makeCategory(base - 9, 0.08),
    eeatSignals: makeCategory(base - 10, 0.1),
  };
}

function makeAeo(base: number): AEOAnalysis {
  return {
    documentationStructure: makeCategory(base, 0.1),
    apiDocumentation: makeCategory(base - 3, 0.12),
    codeExamples: makeCategory(base - 6, 0.1),
    llmsTxt: makeCategory(base - 4, 0.08),
    sdkQuality: makeCategory(base - 5, 0.08),
    authSimplicity: makeCategory(base - 2, 0.08),
    quickstartGuide: makeCategory(base - 1, 0.1),
    errorMessages: makeCategory(base - 7, 0.06),
    changelogVersioning: makeCategory(base - 8, 0.05),
    mcpServer: makeCategory(base - 9, 0.08),
    integrationGuides: makeCategory(base - 4, 0.08),
    machineReadableSitemaps: makeCategory(base - 6, 0.07),
  };
}

function makeAnalysis(url: string, overallScore: number): SiteAnalysis {
  const geo = makeGeo(78);
  const aeo = makeAeo(72);

  return {
    url,
    crawledAt: '2026-02-14T12:00:00.000Z',
    pagesAnalyzed: 3,
    siteType: 'saas-api',
    pageAnalyses: [
      { url, title: 'Home', geo },
      { url: `${url}/docs`, title: 'Docs', geo: makeGeo(74) },
      { url: `${url}/pricing`, title: 'Pricing', geo: makeGeo(70) },
    ],
    geoScore: 75,
    geoGrade: 'B',
    aeoScore: 70,
    aeoGrade: 'B',
    overallScore,
    overallGrade: 'B',
    geo,
    aeo,
    topRecommendations: [
      {
        category: 'schemaMarkup',
        type: 'geo',
        priority: 'high',
        effort: 'medium',
        title: 'Improve schema coverage',
        description: 'Add Organization and FAQ schema on key pages.',
        currentScore: 56,
        potentialScore: 80,
        impact: 'Higher chance of reliable citations by LLMs.',
        codeSnippet: {
          language: 'json',
          label: 'JSON-LD',
          code: '{ "@context": "https://schema.org" }',
        },
      },
    ],
    aiInsights: '## Strategy\n\n1. Focus on docs depth.\n2. Improve machine-readable artifacts.',
  };
}

describe('generateAnalysisReportPdf', () => {
  it('creates a valid multi-page pdf payload', async () => {
    const primary = makeAnalysis('https://example.com', 74);
    const competitor = makeAnalysis('https://competitor.com', 81);

    const bytes = await generateAnalysisReportPdf(primary, [competitor]);
    expect(bytes.length).toBeGreaterThan(2000);

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(loaded.getTitle()).toContain('RankAI Report');
  });

  it('handles unicode content without failing PDF encoding', async () => {
    const primary = makeAnalysis('https://example.com', 74);
    primary.aiInsights = 'Plan → Improve docs, then iterate 🚀 with teams.';
    primary.topRecommendations[0].impact = 'Visibility ↑ and stronger citations → better outcomes.';

    const bytes = await generateAnalysisReportPdf(primary, []);
    expect(bytes.length).toBeGreaterThan(1500);

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThan(0);
  });
});

describe('buildReportFilename', () => {
  it('builds stable filename from url and crawl date', () => {
    const filename = buildReportFilename('https://docs.example.com/path', '2026-02-14T12:00:00.000Z');
    expect(filename).toBe('rankai-report-docs.example.com-2026-02-14.pdf');
  });
});
