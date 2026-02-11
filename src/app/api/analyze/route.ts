import { NextRequest } from 'next/server';
import { z } from 'zod';
import { crawlPage, discoverPages, fetchRobotsTxt, fetchLlmsTxt, fetchLlmsFullTxt, fetchOpenApiSpec } from '@/lib/crawler';
import { analyzeGEO } from '@/lib/analyzers/geo-analyzer';
import { classifySite } from '@/lib/analyzers/site-classifier';
import { analyzeAdaptiveAEO } from '@/lib/analyzers/aeo-adaptive';
import { aggregateGEOFromPages, buildSiteAnalysis, calculateGEOScore, calculateAEOScore, generateRecommendations } from '@/lib/analyzers/scoring';
import { generateAIInsights } from '@/lib/analyzers/ai-insights';
import { PageAnalysis, GEO_AEO_SPLIT } from '@/lib/types';

const RequestSchema = z.object({
  url: z.string().url('Please enter a valid URL'),
  maxPages: z.number().min(1).max(50).default(25),
});

function createStream(emit: (event: object) => void, done: () => void) {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  const send = (event: object) => {
    try {
      controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      emit(event);
    } catch { /* stream closed */ }
  };

  const close = () => {
    try {
      controller.close();
    } catch { /* already closed */ }
    done();
  };

  return { stream, send, close };
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ type: 'error', message: 'Invalid request body' }) + '\n',
      { status: 400, headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  let parsed;
  try {
    parsed = RequestSchema.parse(body);
  } catch (error) {
    const msg = error instanceof z.ZodError
      ? error.issues.map(i => i.message).join(', ')
      : 'Invalid input';
    return new Response(
      JSON.stringify({ type: 'error', message: msg }) + '\n',
      { status: 400, headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  const { url, maxPages } = parsed;

  let normalizedUrl = url;
  if (!normalizedUrl.startsWith('http')) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  const origin = new URL(normalizedUrl).origin;

  const { stream, send, close } = createStream(() => {}, () => {});

  (async () => {
    try {
      // Phase 1: Crawl main page
      send({ type: 'phase', phase: 'crawling', detail: `Fetching ${normalizedUrl}` });

      const mainPage = await crawlPage(normalizedUrl);
      if (mainPage.statusCode >= 400) {
        send({ type: 'error', message: `Failed to fetch ${normalizedUrl}: HTTP ${mainPage.statusCode}` });
        close();
        return;
      }

      // Phase 2: Discover and crawl sub-pages
      send({ type: 'phase', phase: 'crawling', detail: 'Discovering pages...' });
      const pageUrls = await discoverPages(normalizedUrl, mainPage.html, maxPages);
      send({ type: 'phase', phase: 'crawling', detail: `Discovered ${pageUrls.length} pages` });

      const crawlResults = [mainPage];
      const subUrls = pageUrls.filter(u => u !== normalizedUrl).slice(0, maxPages - 1);
      const batchSize = 5;

      for (let i = 0; i < subUrls.length; i += batchSize) {
        const batch = subUrls.slice(i, i + batchSize);
        send({ type: 'phase', phase: 'crawling', detail: `Crawling page ${Math.min(i + batchSize, subUrls.length) + 1}/${pageUrls.length}` });
        const results = await Promise.allSettled(batch.map(u => crawlPage(u)));
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.statusCode < 400) {
            crawlResults.push(result.value);
          }
        }
      }

      // Phase 3: Fetch site-level resources
      send({ type: 'phase', phase: 'crawling', detail: 'Fetching robots.txt, llms.txt, OpenAPI spec...' });
      const [robotsTxt, llmsTxt, llmsFullTxt, openApiSpec] = await Promise.all([
        fetchRobotsTxt(origin),
        fetchLlmsTxt(origin),
        fetchLlmsFullTxt(origin),
        fetchOpenApiSpec(origin),
      ]);

      // Phase 4: Classify site type
      const siteType = classifySite({
        pages: crawlResults.map(cr => ({ url: cr.url, html: cr.html, title: cr.title })),
        robotsTxt,
        openApiSpec,
        origin,
      });

      // Phase 5: GEO Analysis
      send({ type: 'phase', phase: 'analyzing-geo', detail: `Scoring ${crawlResults.length} pages across 11 GEO categories` });
      await new Promise(r => setTimeout(r, 2000));

      const pageAnalyses: PageAnalysis[] = crawlResults.map(cr => ({
        url: cr.url,
        title: cr.title,
        geo: analyzeGEO(cr.html, cr.url, cr.headers, cr.loadTime),
      }));

      const aggregatedGEO = aggregateGEOFromPages(pageAnalyses);

      // Phase 6: AEO Analysis
      send({ type: 'phase', phase: 'analyzing-aeo', detail: `Evaluating AEO for ${siteType} site type` });
      await new Promise(r => setTimeout(r, 2000));

      const aeo = analyzeAdaptiveAEO({
        allPages: crawlResults.map(cr => ({ url: cr.url, html: cr.html, title: cr.title })),
        robotsTxt,
        llmsTxt,
        llmsFullTxt,
        openApiSpec,
        origin,
      }, siteType);

      // Phase 7: Calculate scores
      const geoScore = calculateGEOScore(aggregatedGEO);
      const aeoScore = calculateAEOScore(aeo);
      const split = GEO_AEO_SPLIT[siteType];
      const overallScore = Math.round(geoScore * split.geo + aeoScore * split.aeo);
      const topRecommendations = generateRecommendations(aggregatedGEO, aeo, siteType);

      // Phase 8: AI Insights
      send({ type: 'phase', phase: 'generating-insights', detail: 'Claude is analyzing your results' });

      const aiInsights = await generateAIInsights(
        normalizedUrl,
        geoScore,
        aeoScore,
        overallScore,
        aggregatedGEO,
        aeo,
        topRecommendations,
        pageAnalyses.length,
        siteType
      );

      // Phase 9: Build final result
      const analysis = buildSiteAnalysis(
        normalizedUrl,
        pageAnalyses,
        aggregatedGEO,
        aeo,
        aiInsights,
        siteType
      );

      send({ type: 'result', data: analysis });
      close();
    } catch (error) {
      send({ type: 'error', message: error instanceof Error ? error.message : 'Analysis failed' });
      close();
    }
  })();

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
