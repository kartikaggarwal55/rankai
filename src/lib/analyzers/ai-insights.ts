import Anthropic from '@anthropic-ai/sdk';
import { GEOAnalysis, AEOAnalysis, Recommendation, SiteType } from '../types';
import { getPercentile, BENCHMARKS } from '../benchmarks';

const SITE_TYPE_BENCHMARKS: Record<SiteType, string> = {
  'saas-api': 'Stripe, Twilio, and Neon',
  'ecommerce': 'Amazon, Shopify product pages, and Wirecutter reviews',
  'local-business': 'top-ranking local competitors and Google Business Profile best practices',
  'content-publisher': 'HubSpot, Healthline, and NerdWallet',
  'general': 'leading sites in your industry',
};

const SITE_TYPE_LABELS: Record<SiteType, string> = {
  'saas-api': 'SaaS/API platform',
  'ecommerce': 'e-commerce site',
  'local-business': 'local business',
  'content-publisher': 'content publisher',
  'general': 'website',
};

export async function generateAIInsights(
  url: string,
  geoScore: number,
  aeoScore: number,
  overallScore: number,
  geo: GEOAnalysis,
  aeo: AEOAnalysis,
  topRecommendations: Recommendation[],
  pagesAnalyzed: number,
  siteType: SiteType
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return generateFallbackInsights(url, geoScore, aeoScore, overallScore, geo, aeo, topRecommendations, siteType);
  }

  try {
    const client = new Anthropic({ apiKey });

    const geoBreakdown = Object.entries(geo)
      .map(([key, val]) => `  ${key}: ${val.score}/100 (${val.grade})`)
      .join('\n');

    const aeoBreakdown = Object.entries(aeo)
      .map(([key, val]) => `  ${key}: ${val.score}/100 (${val.grade})`)
      .join('\n');

    const topRecs = topRecommendations.slice(0, 10)
      .map((r, i) => `  ${i + 1}. [${r.priority.toUpperCase()}] ${r.category}: ${r.title}`)
      .join('\n');

    const percentile = getPercentile(overallScore, siteType);
    const benchmark = BENCHMARKS[siteType];
    const benchmarkRef = SITE_TYPE_BENCHMARKS[siteType];
    const typeLabel = SITE_TYPE_LABELS[siteType];

    const prompt = `You are an expert in Generative Engine Optimization (GEO) and Agentic Engine Optimization (AEO). Analyze this website audit and provide actionable strategic insights.

Website: ${url}
Detected Site Type: ${typeLabel}
Pages Analyzed: ${pagesAnalyzed}

GEO Score: ${geoScore}/100
${geoBreakdown}

AEO Score: ${aeoScore}/100
${aeoBreakdown}

Overall Score: ${overallScore}/100
Percentile: Top ${100 - percentile}% of ${typeLabel}s (median: ${benchmark.median}, top 10%: ${benchmark.top10})

Top Recommendations Already Generated:
${topRecs}

Based on this data, provide a concise but comprehensive strategic analysis in markdown format covering:

1. **Executive Summary** (2-3 sentences on overall AI-readiness, mention the percentile ranking)
2. **Biggest Opportunities** — the 3-5 highest-impact actions ranked by effort-to-impact ratio, with specific implementation guidance
3. **Quick Wins** — things that can be done in under a day to immediately improve scores
4. **Strategic Gaps** — what's missing from a competitive standpoint relative to ${benchmarkRef} that excel at GEO/AEO
5. **90-Day Roadmap** — a phased improvement plan tailored for a ${typeLabel}

Be specific and actionable. Reference actual scores and the benchmark context. Don't repeat the raw data — interpret it. Write for a technical product/engineering leader.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    return textContent?.text || generateFallbackInsights(url, geoScore, aeoScore, overallScore, geo, aeo, topRecommendations, siteType);
  } catch (error) {
    console.error('AI insights generation failed:', error);
    return generateFallbackInsights(url, geoScore, aeoScore, overallScore, geo, aeo, topRecommendations, siteType);
  }
}

function generateFallbackInsights(
  url: string,
  geoScore: number,
  aeoScore: number,
  overallScore: number,
  geo: GEOAnalysis,
  aeo: AEOAnalysis,
  topRecommendations: Recommendation[],
  siteType: SiteType
): string {
  const weakestGEO = Object.entries(geo)
    .sort(([, a], [, b]) => a.score - b.score)
    .slice(0, 3)
    .map(([key, val]) => `**${formatKey(key)}** (${val.score}/100)`);

  const weakestAEO = Object.entries(aeo)
    .sort(([, a], [, b]) => a.score - b.score)
    .slice(0, 3)
    .map(([key, val]) => `**${formatKey(key)}** (${val.score}/100)`);

  const criticalRecs = topRecommendations.filter(r => r.priority === 'critical').slice(0, 3);
  const quickWins = topRecommendations.filter(r => r.effort === 'low').slice(0, 3);

  const percentile = getPercentile(overallScore, siteType);
  const benchmark = BENCHMARKS[siteType];
  const benchmarkRef = SITE_TYPE_BENCHMARKS[siteType];
  const typeLabel = SITE_TYPE_LABELS[siteType];

  return `## Executive Summary

${url} scores **${geoScore}/100** for Generative Engine Optimization and **${aeoScore}/100** for Agentic Engine Optimization, placing it in the **top ${100 - percentile}%** of ${typeLabel}s (median: ${benchmark.median}, top 10%: ${benchmark.top10}). ${
    geoScore >= 70 ? 'GEO performance is solid' : geoScore >= 50 ? 'GEO has significant room for improvement' : 'GEO needs urgent attention'
  } and ${
    aeoScore >= 70 ? 'AEO readiness is strong' : aeoScore >= 50 ? 'AEO requires meaningful investment' : 'AEO is critically underdeveloped'
  }.

## Biggest Opportunities

Your weakest GEO areas are: ${weakestGEO.join(', ')}. Your weakest AEO areas are: ${weakestAEO.join(', ')}.

${criticalRecs.map((r, i) => `${i + 1}. **${r.category}**: ${r.description}`).join('\n\n')}

## Quick Wins

${quickWins.map((r, i) => `${i + 1}. **${r.category}**: ${r.description}`).join('\n\n')}

## Strategic Gaps

Leading ${typeLabel}s like ${benchmarkRef} excel through comprehensive AI-readiness strategies. Compare your scores against these benchmarks to identify the most impactful investments. Key gaps to close: schema markup completeness, structured content for AI extraction, and machine-readable documentation.

## 90-Day Roadmap

**Week 1-2 (Quick Wins):** Implement schema markup, create llms.txt, update robots.txt for AI bots, add FAQ sections.

**Week 3-4 (Content):** Add statistics, expert quotations, and source citations to key pages. Restructure content with answer capsules.

**Month 2 (Infrastructure):** Improve content structure, build comprehensive documentation, enhance E-E-A-T signals.

**Month 3 (Authority):** Launch content optimization program, create original research, expand presence across AI platforms.`;
}

function formatKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
}
