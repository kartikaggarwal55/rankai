import Anthropic from '@anthropic-ai/sdk';
import { GEOAnalysis, AEOAnalysis, Recommendation } from '../types';

export async function generateAIInsights(
  url: string,
  geoScore: number,
  aeoScore: number,
  geo: GEOAnalysis,
  aeo: AEOAnalysis,
  topRecommendations: Recommendation[],
  pagesAnalyzed: number
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return generateFallbackInsights(url, geoScore, aeoScore, geo, aeo, topRecommendations);
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

    const prompt = `You are an expert in Generative Engine Optimization (GEO) and Agentic Engine Optimization (AEO). Analyze this website audit and provide actionable strategic insights.

Website: ${url}
Pages Analyzed: ${pagesAnalyzed}

GEO Score: ${geoScore}/100
${geoBreakdown}

AEO Score: ${aeoScore}/100
${aeoBreakdown}

Top Recommendations Already Generated:
${topRecs}

Based on this data, provide a concise but comprehensive strategic analysis in markdown format covering:

1. **Executive Summary** (2-3 sentences on overall AI-readiness)
2. **Biggest Opportunities** — the 3-5 highest-impact actions ranked by effort-to-impact ratio, with specific implementation guidance
3. **Quick Wins** — things that can be done in under a day to immediately improve scores
4. **Strategic Gaps** — what's missing from a competitive standpoint relative to platforms like Neon, Supabase, and Stripe that excel at GEO/AEO
5. **90-Day Roadmap** — a phased improvement plan

Be specific and actionable. Reference actual scores. Don't repeat the raw data — interpret it. Write for a technical product/engineering leader.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    return textContent?.text || generateFallbackInsights(url, geoScore, aeoScore, geo, aeo, topRecommendations);
  } catch (error) {
    console.error('AI insights generation failed:', error);
    return generateFallbackInsights(url, geoScore, aeoScore, geo, aeo, topRecommendations);
  }
}

function generateFallbackInsights(
  url: string,
  geoScore: number,
  aeoScore: number,
  geo: GEOAnalysis,
  aeo: AEOAnalysis,
  topRecommendations: Recommendation[]
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

  return `## Executive Summary

${url} scores **${geoScore}/100** for Generative Engine Optimization and **${aeoScore}/100** for Agentic Engine Optimization. ${
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

Leading platforms like Neon, Supabase, and Stripe excel through: MCP servers for dynamic AI agent discovery, comprehensive llms.txt files, AI rules files (.cursor/rules, CLAUDE.md), one-command onboarding, and massive community content presence. Compare your scores against these benchmarks to identify the most impactful investments.

## 90-Day Roadmap

**Week 1-2 (Quick Wins):** Implement schema markup, create llms.txt, update robots.txt for AI bots, add FAQ sections.

**Week 3-4 (Content):** Add statistics, expert quotations, and source citations to key pages. Restructure content with answer capsules.

**Month 2 (Infrastructure):** Build MCP server, publish OpenAPI spec, create AI rules files, improve quickstart guide.

**Month 3 (Authority):** Launch community content program, create original research, expand integration guides, build multi-platform presence.`;
}

function formatKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
}
