import {
  SiteAnalysis, PageAnalysis, GEOAnalysis, AEOAnalysis,
  CategoryScore, Finding, Recommendation, getGrade, GEO_WEIGHTS,
  SiteType, GEO_AEO_SPLIT, ADAPTIVE_AEO_WEIGHTS
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
    geo.multiFormatContent.score * GEO_WEIGHTS.multiFormatContent +
    geo.eeatSignals.score * GEO_WEIGHTS.eeatSignals
  );
}

export function calculateAEOScore(aeo: AEOAnalysis): number {
  let score = 0;
  for (const [key, category] of Object.entries(aeo)) {
    score += category.score * category.weight;
  }
  return Math.round(score);
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
    'contentUniqueness', 'multiFormatContent', 'eeatSignals',
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

export function generateRecommendations(geo: GEOAnalysis, aeo: AEOAnalysis, siteType: SiteType = 'saas-api'): Recommendation[] {
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
    { key: 'eeatSignals', name: 'E-E-A-T Signals', weight: GEO_WEIGHTS.eeatSignals },
  ];

  for (const cat of geoCategories) {
    const category = geo[cat.key];
    if (category.score < 70) {
      const impact = cat.weight * (100 - category.score);
      const effort = getEffortLevel(cat.key);
      for (const rec of category.recommendations) {
        const recommendation: Recommendation = {
          category: cat.name,
          type: 'geo',
          priority: impact > 8 ? 'critical' : impact > 5 ? 'high' : impact > 3 ? 'medium' : 'low',
          effort,
          title: rec.split('.')[0] + '.',
          description: rec,
          currentScore: category.score,
          potentialScore: Math.min(100, category.score + 30),
          impact: `${Math.round(impact)}% potential overall improvement`,
        };
        addCodeSnippet(recommendation, cat.key, category);
        recommendations.push(recommendation);
      }
    }
  }

  const aeoWeights = ADAPTIVE_AEO_WEIGHTS[siteType];
  for (const [key, category] of Object.entries(aeo)) {
    const weight = aeoWeights[key] || category.weight;
    if (category.score < 70) {
      const impact = weight * (100 - category.score);
      const effort = getAEOEffortLevel(key);
      for (const rec of category.recommendations) {
        const recommendation: Recommendation = {
          category: formatKey(key),
          type: 'aeo',
          priority: impact > 8 ? 'critical' : impact > 5 ? 'high' : impact > 3 ? 'medium' : 'low',
          effort,
          title: rec.split('.')[0] + '.',
          description: rec,
          currentScore: category.score,
          potentialScore: Math.min(100, category.score + 30),
          impact: `${Math.round(impact)}% potential overall improvement`,
        };
        addCodeSnippet(recommendation, key, category);
        recommendations.push(recommendation);
      }
    }
  }

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    const effortOrder = { low: 0, medium: 1, high: 2 };
    return effortOrder[a.effort] - effortOrder[b.effort];
  });

  return recommendations;
}

function addCodeSnippet(rec: Recommendation, key: string, category: CategoryScore): void {
  const hasFailedCheck = (checkName: string) =>
    category.findings.some(f => f.check.toLowerCase().includes(checkName.toLowerCase()) && f.status === 'fail');

  if (key === 'schemaMarkup') {
    if (hasFailedCheck('FAQPage')) {
      rec.codeSnippet = {
        language: 'json-ld',
        code: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Your question here?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Your answer here."
      }
    }
  ]
}
</script>`,
        label: 'Add this FAQPage schema to your <head>',
      };
    } else if (hasFailedCheck('Article schema')) {
      rec.codeSnippet = {
        language: 'json-ld',
        code: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Your Article Title",
  "author": {
    "@type": "Person",
    "name": "Author Name",
    "url": "https://yoursite.com/about/author"
  },
  "datePublished": "${new Date().toISOString().split('T')[0]}",
  "dateModified": "${new Date().toISOString().split('T')[0]}",
  "image": "https://yoursite.com/images/article.jpg",
  "publisher": {
    "@type": "Organization",
    "name": "Your Organization",
    "logo": { "@type": "ImageObject", "url": "https://yoursite.com/logo.png" }
  }
}
</script>`,
        label: 'Add this Article schema to your <head>',
      };
    } else if (hasFailedCheck('Organization')) {
      rec.codeSnippet = {
        language: 'json-ld',
        code: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Your Organization",
  "url": "https://yoursite.com",
  "logo": "https://yoursite.com/logo.png",
  "sameAs": [
    "https://twitter.com/yourhandle",
    "https://linkedin.com/company/yourcompany",
    "https://github.com/yourorg"
  ]
}
</script>`,
        label: 'Add this Organization schema to your <head>',
      };
    }
  }

  if (key === 'llmsTxt' && hasFailedCheck('llms.txt')) {
    rec.codeSnippet = {
      language: 'txt',
      code: `# Your Site Name

> Brief description of your site and what it offers.

## Documentation
- [Getting Started](https://yoursite.com/docs/getting-started)
- [API Reference](https://yoursite.com/docs/api)
- [Guides](https://yoursite.com/docs/guides)

## Optional
- [Blog](https://yoursite.com/blog)
- [Changelog](https://yoursite.com/changelog)`,
      label: 'Create this as /llms.txt at your domain root',
    };
  }

  if (key === 'machineReadableSitemaps' && hasFailedCheck('AI bot')) {
    rec.codeSnippet = {
      language: 'txt',
      code: `# AI Crawler Access — add to robots.txt
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: OAI-SearchBot
Allow: /`,
      label: 'Add these rules to your robots.txt',
    };
  }

  if (key === 'contentFreshness' && hasFailedCheck('dateModified')) {
    rec.codeSnippet = {
      language: 'json-ld',
      code: `"dateModified": "${new Date().toISOString().split('T')[0]}"`,
      label: 'Add dateModified to your Article/WebPage schema',
    };
  }

  if (key === 'contentStructure' && hasFailedCheck('FAQ')) {
    rec.codeSnippet = {
      language: 'html',
      code: `<section>
  <h2>Frequently Asked Questions</h2>
  <h3>What is [your topic]?</h3>
  <p>[2-4 sentence answer that is self-contained and extractable by AI]</p>
  <h3>How does [feature] work?</h3>
  <p>[Clear, concise answer]</p>
</section>`,
      label: 'Add an FAQ section to your page',
    };
  }
}

function formatKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
}

function getEffortLevel(key: string): 'low' | 'medium' | 'high' {
  const lowEffort = ['schemaMarkup', 'metaInformation', 'technicalHealth', 'eeatSignals'];
  const highEffort = ['contentUniqueness', 'topicalAuthority'];
  if (lowEffort.includes(key)) return 'low';
  if (highEffort.includes(key)) return 'high';
  return 'medium';
}

function getAEOEffortLevel(key: string): 'low' | 'medium' | 'high' {
  const lowEffort = ['llmsTxt', 'machineReadableSitemaps', 'changelogVersioning', 'faqContent', 'categoryTaxonomy', 'photoEvidence', 'newsletterPresence'];
  const highEffort = ['mcpServer', 'sdkQuality', 'apiDocumentation', 'productSchema', 'localSchema', 'originalReporting'];
  if (lowEffort.includes(key)) return 'low';
  if (highEffort.includes(key)) return 'high';
  return 'medium';
}

export function buildSiteAnalysis(
  url: string,
  pageAnalyses: PageAnalysis[],
  geo: GEOAnalysis,
  aeo: AEOAnalysis,
  aiInsights: string,
  siteType: SiteType
): SiteAnalysis {
  const geoScore = calculateGEOScore(geo);
  const aeoScore = calculateAEOScore(aeo);
  const split = GEO_AEO_SPLIT[siteType];
  const overallScore = Math.round(geoScore * split.geo + aeoScore * split.aeo);

  return {
    url,
    crawledAt: new Date().toISOString(),
    pagesAnalyzed: pageAnalyses.length,
    siteType,
    pageAnalyses,
    geoScore,
    geoGrade: getGrade(geoScore),
    aeoScore,
    aeoGrade: getGrade(aeoScore),
    overallScore,
    overallGrade: getGrade(overallScore),
    geo,
    aeo,
    topRecommendations: generateRecommendations(geo, aeo, siteType),
    aiInsights,
  };
}
