import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { crawlPage, discoverPages, fetchRobotsTxt, fetchLlmsTxt, fetchLlmsFullTxt, fetchOpenApiSpec } from '@/lib/crawler';
import { analyzeGEO } from '@/lib/analyzers/geo-analyzer';
import { analyzeAEO } from '@/lib/analyzers/aeo-analyzer';
import { aggregateGEOFromPages, buildSiteAnalysis, calculateGEOScore, calculateAEOScore, generateRecommendations } from '@/lib/analyzers/scoring';
import { generateAIInsights } from '@/lib/analyzers/ai-insights';
import { PageAnalysis } from '@/lib/types';

const RequestSchema = z.object({
  url: z.string().url('Please enter a valid URL'),
  maxPages: z.number().min(1).max(20).default(10),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, maxPages } = RequestSchema.parse(body);

    // Normalize URL
    let normalizedUrl = url;
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const origin = new URL(normalizedUrl).origin;

    // Phase 1: Crawl main page
    const mainPage = await crawlPage(normalizedUrl);
    if (mainPage.statusCode >= 400) {
      return NextResponse.json(
        { error: `Failed to fetch ${normalizedUrl}: HTTP ${mainPage.statusCode}` },
        { status: 400 }
      );
    }

    // Phase 2: Discover and crawl sub-pages
    const pageUrls = await discoverPages(normalizedUrl, mainPage.html, maxPages);
    const crawlResults = [mainPage];

    // Crawl sub-pages concurrently (with concurrency limit)
    const subUrls = pageUrls.filter(u => u !== normalizedUrl);
    const batchSize = 5;
    for (let i = 0; i < subUrls.length; i += batchSize) {
      const batch = subUrls.slice(i, i + batchSize);
      const results = await Promise.allSettled(batch.map(u => crawlPage(u)));
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.statusCode < 400) {
          crawlResults.push(result.value);
        }
      }
    }

    // Phase 3: Fetch site-level resources concurrently
    const [robotsTxt, llmsTxt, llmsFullTxt, openApiSpec] = await Promise.all([
      fetchRobotsTxt(origin),
      fetchLlmsTxt(origin),
      fetchLlmsFullTxt(origin),
      fetchOpenApiSpec(origin),
    ]);

    // Phase 4: Analyze each page for GEO
    const pageAnalyses: PageAnalysis[] = crawlResults.map(cr => ({
      url: cr.url,
      title: cr.title,
      geo: analyzeGEO(cr.html, cr.url, cr.headers, cr.loadTime),
    }));

    // Phase 5: Aggregate GEO scores across pages
    const aggregatedGEO = aggregateGEOFromPages(pageAnalyses);

    // Phase 6: Analyze site-level AEO
    const aeo = analyzeAEO({
      allPages: crawlResults.map(cr => ({ url: cr.url, html: cr.html, title: cr.title })),
      robotsTxt,
      llmsTxt,
      llmsFullTxt,
      openApiSpec,
      origin,
    });

    // Phase 7: Calculate scores and generate recommendations
    const geoScore = calculateGEOScore(aggregatedGEO);
    const aeoScore = calculateAEOScore(aeo);
    const topRecommendations = generateRecommendations(aggregatedGEO, aeo);

    // Phase 8: Generate AI insights
    const aiInsights = await generateAIInsights(
      normalizedUrl,
      geoScore,
      aeoScore,
      aggregatedGEO,
      aeo,
      topRecommendations,
      pageAnalyses.length
    );

    // Phase 9: Build final result
    const analysis = buildSiteAnalysis(
      normalizedUrl,
      pageAnalyses,
      aggregatedGEO,
      aeo,
      aiInsights
    );

    return NextResponse.json(analysis);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Analysis failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
