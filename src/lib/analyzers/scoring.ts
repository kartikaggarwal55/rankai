import {
  SiteAnalysis, PageAnalysis, GEOAnalysis, AEOAnalysis,
  CategoryScore, Finding, Recommendation, getGrade, GEO_WEIGHTS, AEO_WEIGHTS
} from '../types';

export function calculateGEOScore(geo: GEOAnalysis): number {
  return Math.round(
    geo.contentStructure.score * GEO_WEIGHTS.contentStructure +
    geo.schemaMarkup.score * GEO_WEIGHTS.schemaMarkup +
    geo.topicalAuthority.score * GEO_WEIGHTS.topicalAuthority +
    geo.citationWorthiness.score * GEO_WEIGHTS.citationWorthiness +
    geo.contentFreshness.score * GEO_WEIGHTS.contentFreshness +
    geo.languagePatterns.score * GEO_WEIGHTS.languagePatterns +
    geo.metaInformation.score * GEO_WEIGHTS.metaInformation +
    geo.technicalHealth.score * GEO_WEIGHTS.technicalHealth +
    geo.contentUniqueness.score * GEO_WEIGHTS.contentUniqueness +
    geo.multiFormatContent.score * GEO_WEIGHTS.multiFormatContent
  );
}

export function calculateAEOScore(aeo: AEOAnalysis): number {
  return Math.round(
    aeo.documentationStructure.score * AEO_WEIGHTS.documentationStructure +
    aeo.apiDocumentation.score * AEO_WEIGHTS.apiDocumentation +
    aeo.codeExamples.score * AEO_WEIGHTS.codeExamples +
    aeo.llmsTxt.score * AEO_WEIGHTS.llmsTxt +
    aeo.sdkQuality.score * AEO_WEIGHTS.sdkQuality +
    aeo.authSimplicity.score * AEO_WEIGHTS.authSimplicity +
    aeo.quickstartGuide.score * AEO_WEIGHTS.quickstartGuide +
    aeo.errorMessages.score * AEO_WEIGHTS.errorMessages +
    aeo.changelogVersioning.score * AEO_WEIGHTS.changelogVersioning +
    aeo.mcpServer.score * AEO_WEIGHTS.mcpServer +
    aeo.integrationGuides.score * AEO_WEIGHTS.integrationGuides +
    aeo.machineReadableSitemaps.score * AEO_WEIGHTS.machineReadableSitemaps
  );
}

export function aggregateGEOFromPages(pageAnalyses: PageAnalysis[]): GEOAnalysis {
  if (pageAnalyses.length === 0) {
    throw new Error('No pages analyzed');
  }
  if (pageAnalyses.length === 1) {
    return pageAnalyses[0].geo;
  }

  const keys: (keyof GEOAnalysis)[] = [
    'contentStructure', 'schemaMarkup', 'topicalAuthority', 'citationWorthiness',
    'contentFreshness', 'languagePatterns', 'metaInformation', 'technicalHealth',
    'contentUniqueness', 'multiFormatContent',
  ];

  const result: Partial<GEOAnalysis> = {};

  for (const key of keys) {
    const allFindings = pageAnalyses.flatMap(p => p.geo[key].findings);
    const allRecommendations = [...new Set(pageAnalyses.flatMap(p => p.geo[key].recommendations))];
    const avgScore = Math.round(
      pageAnalyses.reduce((sum, p) => sum + p.geo[key].score, 0) / pageAnalyses.length
    );

    result[key] = {
      score: avgScore,
      grade: getGrade(avgScore),
      weight: pageAnalyses[0].geo[key].weight,
      findings: deduplicateFindings(allFindings),
      recommendations: allRecommendations.slice(0, 5),
    };
  }

  return result as GEOAnalysis;
}

function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    const existing = seen.get(f.check);
    if (!existing || f.points < existing.points) {
      seen.set(f.check, f);
    }
  }
  return Array.from(seen.values());
}

export function generateRecommendations(geo: GEOAnalysis, aeo: AEOAnalysis): Recommendation[] {
  const recommendations: Recommendation[] = [];

  const geoCategories: { key: keyof GEOAnalysis; name: string; weight: number }[] = [
    { key: 'contentStructure', name: 'Content Structure', weight: GEO_WEIGHTS.contentStructure },
    { key: 'schemaMarkup', name: 'Schema Markup', weight: GEO_WEIGHTS.schemaMarkup },
    { key: 'topicalAuthority', name: 'Topical Authority', weight: GEO_WEIGHTS.topicalAuthority },
    { key: 'citationWorthiness', name: 'Citation Worthiness', weight: GEO_WEIGHTS.citationWorthiness },
    { key: 'contentFreshness', name: 'Content Freshness', weight: GEO_WEIGHTS.contentFreshness },
    { key: 'languagePatterns', name: 'Language Patterns', weight: GEO_WEIGHTS.languagePatterns },
    { key: 'metaInformation', name: 'Meta Information', weight: GEO_WEIGHTS.metaInformation },
    { key: 'technicalHealth', name: 'Technical Health', weight: GEO_WEIGHTS.technicalHealth },
    { key: 'contentUniqueness', name: 'Content Uniqueness', weight: GEO_WEIGHTS.contentUniqueness },
    { key: 'multiFormatContent', name: 'Multi-Format Content', weight: GEO_WEIGHTS.multiFormatContent },
  ];

  for (const cat of geoCategories) {
    const category = geo[cat.key];
    if (category.score < 70) {
      const impact = cat.weight * (100 - category.score);
      const effort = getEffortLevel(cat.key);
      for (const rec of category.recommendations) {
        recommendations.push({
          category: cat.name,
          type: 'geo',
          priority: impact > 8 ? 'critical' : impact > 5 ? 'high' : impact > 3 ? 'medium' : 'low',
          effort,
          title: rec.split('.')[0] + '.',
          description: rec,
          currentScore: category.score,
          potentialScore: Math.min(100, category.score + 30),
          impact: `${Math.round(impact)}% potential overall improvement`,
        });
      }
    }
  }

  const aeoCategories: { key: keyof AEOAnalysis; name: string; weight: number }[] = [
    { key: 'documentationStructure', name: 'Documentation Structure', weight: AEO_WEIGHTS.documentationStructure },
    { key: 'apiDocumentation', name: 'API Documentation', weight: AEO_WEIGHTS.apiDocumentation },
    { key: 'codeExamples', name: 'Code Examples', weight: AEO_WEIGHTS.codeExamples },
    { key: 'llmsTxt', name: 'llms.txt', weight: AEO_WEIGHTS.llmsTxt },
    { key: 'sdkQuality', name: 'SDK Quality', weight: AEO_WEIGHTS.sdkQuality },
    { key: 'authSimplicity', name: 'Authentication Simplicity', weight: AEO_WEIGHTS.authSimplicity },
    { key: 'quickstartGuide', name: 'Quickstart Guide', weight: AEO_WEIGHTS.quickstartGuide },
    { key: 'errorMessages', name: 'Error Messages', weight: AEO_WEIGHTS.errorMessages },
    { key: 'changelogVersioning', name: 'Changelog & Versioning', weight: AEO_WEIGHTS.changelogVersioning },
    { key: 'mcpServer', name: 'MCP Server', weight: AEO_WEIGHTS.mcpServer },
    { key: 'integrationGuides', name: 'Integration Guides', weight: AEO_WEIGHTS.integrationGuides },
    { key: 'machineReadableSitemaps', name: 'Machine-Readable Sitemaps', weight: AEO_WEIGHTS.machineReadableSitemaps },
  ];

  for (const cat of aeoCategories) {
    const category = aeo[cat.key];
    if (category.score < 70) {
      const impact = cat.weight * (100 - category.score);
      const effort = getAEOEffortLevel(cat.key);
      for (const rec of category.recommendations) {
        recommendations.push({
          category: cat.name,
          type: 'aeo',
          priority: impact > 8 ? 'critical' : impact > 5 ? 'high' : impact > 3 ? 'medium' : 'low',
          effort,
          title: rec.split('.')[0] + '.',
          description: rec,
          currentScore: category.score,
          potentialScore: Math.min(100, category.score + 30),
          impact: `${Math.round(impact)}% potential overall improvement`,
        });
      }
    }
  }

  // Sort by priority then by impact
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    const effortOrder = { low: 0, medium: 1, high: 2 };
    return effortOrder[a.effort] - effortOrder[b.effort];
  });

  return recommendations;
}

function getEffortLevel(key: string): 'low' | 'medium' | 'high' {
  const lowEffort = ['schemaMarkup', 'metaInformation', 'technicalHealth'];
  const highEffort = ['contentUniqueness', 'topicalAuthority'];
  if (lowEffort.includes(key)) return 'low';
  if (highEffort.includes(key)) return 'high';
  return 'medium';
}

function getAEOEffortLevel(key: string): 'low' | 'medium' | 'high' {
  const lowEffort = ['llmsTxt', 'machineReadableSitemaps', 'changelogVersioning'];
  const highEffort = ['mcpServer', 'sdkQuality', 'apiDocumentation'];
  if (lowEffort.includes(key)) return 'low';
  if (highEffort.includes(key)) return 'high';
  return 'medium';
}

export function buildSiteAnalysis(
  url: string,
  pageAnalyses: PageAnalysis[],
  geo: GEOAnalysis,
  aeo: AEOAnalysis,
  aiInsights: string
): SiteAnalysis {
  const geoScore = calculateGEOScore(geo);
  const aeoScore = calculateAEOScore(aeo);
  const overallScore = Math.round(geoScore * 0.5 + aeoScore * 0.5);

  return {
    url,
    crawledAt: new Date().toISOString(),
    pagesAnalyzed: pageAnalyses.length,
    pageAnalyses,
    geoScore,
    geoGrade: getGrade(geoScore),
    aeoScore,
    aeoGrade: getGrade(aeoScore),
    overallScore,
    overallGrade: getGrade(overallScore),
    geo,
    aeo,
    topRecommendations: generateRecommendations(geo, aeo),
    aiInsights,
  };
}
