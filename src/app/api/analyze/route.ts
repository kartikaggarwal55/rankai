import { NextRequest } from 'next/server';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';
import { crawlPage, discoverPages, fetchRobotsTxt, fetchLlmsTxt, fetchLlmsFullTxt, fetchOpenApiSpec } from '@/lib/crawler';
import { analyzeGEO } from '@/lib/analyzers/geo-analyzer';
import { classifySite } from '@/lib/analyzers/site-classifier';
import { analyzeAdaptiveAEO } from '@/lib/analyzers/aeo-adaptive';
import { aggregateGEOFromPages, buildSiteAnalysis, calculateGEOScore, calculateAEOScore, generateRecommendations } from '@/lib/analyzers/scoring';
import { generateAIInsights } from '@/lib/analyzers/ai-insights';
import { PageAnalysis, GEO_AEO_SPLIT } from '@/lib/types';

const RequestSchema = z.object({
  url: z.string().trim().min(1, 'Please enter a valid URL'),
  maxPages: z.coerce.number().min(1).max(50).default(25),
});

const STREAM_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
};

const ANALYSIS_PHASE_DELAY_MS = 2000;

const INTERNAL_HOSTNAMES = new Set([
  'localhost',
  'host.docker.internal',
  'metadata.google.internal',
]);

const INTERNAL_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home'];

function normalizeUrl(rawUrl: string): string {
  const candidate = rawUrl.trim();
  const prefixed = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  let parsed: URL;
  try {
    parsed = new URL(prefixed);
  } catch {
    throw new Error('Please enter a valid URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP(S) URLs are supported');
  }

  return parsed.toString();
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice(7));
  }
  return false;
}

function isPrivateIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return false;
}

function isInternalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return INTERNAL_HOSTNAMES.has(normalized) || INTERNAL_HOST_SUFFIXES.some(suffix => normalized.endsWith(suffix));
}

async function isBlockedTarget(url: URL): Promise<boolean> {
  const hostname = url.hostname;

  if (isInternalHostname(hostname)) return true;
  if (isPrivateIpAddress(hostname)) return true;

  if (isIP(hostname) === 0) {
    try {
      const resolved = await lookup(hostname, { all: true, verbatim: true });
      if (resolved.some(entry => isPrivateIpAddress(entry.address))) {
        return true;
      }
    } catch {
      // If DNS lookup fails, allow downstream fetch error handling to surface the issue.
    }
  }

  return false;
}

function createStream() {
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
    } catch { /* stream closed */ }
  };

  const close = () => {
    try {
      controller.close();
    } catch { /* already closed */ }
  };

  return { stream, send, close };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function yieldToEventLoop() {
  return new Promise<void>(resolve => setImmediate(resolve));
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ type: 'error', message: 'Invalid request body' }) + '\n',
      { status: 400, headers: STREAM_HEADERS }
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
      { status: 400, headers: STREAM_HEADERS }
    );
  }

  const { url, maxPages } = parsed;

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeUrl(url);
  } catch (error) {
    return new Response(
      JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : 'Please enter a valid URL',
      }) + '\n',
      { status: 400, headers: STREAM_HEADERS }
    );
  }

  const normalized = new URL(normalizedUrl);
  if (await isBlockedTarget(normalized)) {
    return new Response(
      JSON.stringify({
        type: 'error',
        message: 'This URL points to a private/internal network target and cannot be analyzed.',
      }) + '\n',
      { status: 400, headers: STREAM_HEADERS }
    );
  }

  const origin = normalized.origin;

  const { stream, send, close } = createStream();

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
        const lastInBatch = Math.min(i + batch.length, subUrls.length);
        send({ type: 'phase', phase: 'crawling', detail: `Crawling pages ${i + 1}-${lastInBatch} of ${subUrls.length}` });
        const results = await Promise.allSettled(batch.map(u => crawlPage(u)));
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.statusCode < 400) {
            crawlResults.push(result.value);
          }
        }
      }
      send({ type: 'phase', phase: 'crawling', detail: `Successfully crawled ${crawlResults.length} pages` });

      // Phase 3: Fetch site-level resources
      send({ type: 'phase', phase: 'crawling', detail: 'Fetching robots.txt, llms.txt, OpenAPI spec...' });
      const resourceResults = await Promise.allSettled([
        fetchRobotsTxt(origin),
        fetchLlmsTxt(origin),
        fetchLlmsFullTxt(origin),
        fetchOpenApiSpec(origin),
      ]);
      const robotsTxt = resourceResults[0].status === 'fulfilled' ? resourceResults[0].value : null;
      const llmsTxt = resourceResults[1].status === 'fulfilled' ? resourceResults[1].value : null;
      const llmsFullTxt = resourceResults[2].status === 'fulfilled' ? resourceResults[2].value : null;
      const openApiSpec = resourceResults[3].status === 'fulfilled' ? resourceResults[3].value : null;

      // Phase 4: Classify site type
      const siteType = classifySite({
        pages: crawlResults.map(cr => ({ url: cr.url, html: cr.html, title: cr.title })),
        robotsTxt,
        openApiSpec,
        origin,
      });

      // Phase 5: GEO Analysis
      send({ type: 'phase', phase: 'analyzing-geo', detail: `Scoring ${crawlResults.length} pages across 11 GEO categories` });
      await sleep(ANALYSIS_PHASE_DELAY_MS);

      const pageAnalyses: PageAnalysis[] = [];
      for (let i = 0; i < crawlResults.length; i++) {
        const page = crawlResults[i];
        pageAnalyses.push({
          url: page.url,
          title: page.title,
          geo: analyzeGEO(page.html, page.url, page.headers, page.loadTime),
        });

        if ((i + 1) % 5 === 0 || i === crawlResults.length - 1) {
          send({
            type: 'phase',
            phase: 'analyzing-geo',
            detail: `Scoring pages ${i + 1}/${crawlResults.length}`,
          });
          await yieldToEventLoop();
        }
      }

      const aggregatedGEO = aggregateGEOFromPages(pageAnalyses);

      // Phase 6: AEO Analysis
      send({ type: 'phase', phase: 'analyzing-aeo', detail: `Evaluating AEO for ${siteType} site type` });
      await sleep(ANALYSIS_PHASE_DELAY_MS);

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
    headers: STREAM_HEADERS,
  });
}
