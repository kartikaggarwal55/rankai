import * as cheerio from 'cheerio';
import { CrawlResult } from '../types';

const USER_AGENT = 'RankAI-Analyzer/1.0 (GEO/AEO website analysis tool)';
const SITE_RESOURCE_TIMEOUT_MS = 3000;
const OPENAPI_DISCOVERY_TIMEOUT_MS = 3000;
const OPENAPI_PATHS = ['/openapi.json', '/swagger.json', '/api-docs', '/api/openapi.json', '/docs/openapi.json'] as const;

export async function crawlPage(url: string): Promise<CrawlResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    const html = await response.text();
    const loadTime = Date.now() - start;
    const $ = cheerio.load(html);
    const title = $('title').text().trim() || url;

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return { url, html, title, statusCode: response.status, headers, loadTime };
  } finally {
    clearTimeout(timeout);
  }
}

export async function discoverPages(baseUrl: string, html: string, maxPages: number = 30): Promise<string[]> {
  const base = new URL(baseUrl);
  const pages = new Set<string>();
  pages.add(baseUrl);

  // Try sitemap first
  const sitemapUrls = await fetchSitemap(base.origin);
  for (const url of sitemapUrls) {
    pages.add(url);
  }

  // Also extract links from the page
  const $ = cheerio.load(html);
  $('a[href]').each((_, el) => {
    try {
      const href = $(el).attr('href');
      if (!href) return;
      const resolved = new URL(href, baseUrl);
      if (resolved.origin === base.origin && !resolved.hash && !isAssetUrl(resolved.pathname)) {
        resolved.search = '';
        pages.add(resolved.toString());
      }
    } catch { /* skip invalid URLs */ }
  });

  const allUrls = Array.from(pages);
  const prioritized = prioritizeUrls(allUrls, base.origin);
  return prioritized.slice(0, maxPages);
}

async function fetchSitemap(origin: string): Promise<string[]> {
  const urls: string[] = [];
  try {
    const response = await fetch(`${origin}/sitemap.xml`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return urls;
    const xml = await response.text();
    const $ = cheerio.load(xml, { xml: true });

    // Handle sitemap index
    $('sitemapindex > sitemap > loc').each((_, el) => {
      // Could recursively fetch sub-sitemaps but skip for performance
    });

    // Handle regular sitemap
    $('urlset > url > loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) urls.push(loc);
    });
  } catch { /* sitemap not available */ }
  return urls.slice(0, 50);
}

function prioritizeUrls(urls: string[], baseOrigin: string): string[] {
  const scored = urls.map(url => {
    const path = new URL(url).pathname.toLowerCase();
    let priority = 0;

    // High-value content pages
    if (/\/blog\/|\/articles\/|\/docs\/|\/guide/.test(path)) priority += 10;
    if (/\/about|\/team|\/company/.test(path)) priority += 8;
    if (/\/products\/|\/services\/|\/features/.test(path)) priority += 8;
    if (/\/pricing/.test(path)) priority += 6;
    if (/\/faq|\/help|\/support/.test(path)) priority += 6;
    if (/\/case-stud|\/testimonial|\/review/.test(path)) priority += 7;

    // Penalize low-value pages
    if (/\/tag\/|\/category\/|\/page\/\d/.test(path)) priority -= 5;
    if (/\/privacy|\/terms|\/cookie|\/legal/.test(path)) priority -= 3;
    if (/\/login|\/signup|\/register|\/cart|\/checkout/.test(path)) priority -= 8;
    if (/\/search|\/404|\/50\d/.test(path)) priority -= 10;

    // Prefer shorter paths (closer to root = more important)
    const depth = path.split('/').filter(Boolean).length;
    priority -= depth * 0.5;

    return { url, priority };
  });

  return scored.sort((a, b) => b.priority - a.priority).map(s => s.url);
}

function isAssetUrl(path: string): boolean {
  const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
    '.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip',
    '.mp4', '.mp3', '.avi', '.mov', '.json', '.xml'];
  const lower = path.toLowerCase();
  return extensions.some(ext => lower.endsWith(ext));
}

export async function fetchRobotsTxt(origin: string): Promise<string | null> {
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(SITE_RESOURCE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch { return null; }
}

export async function fetchLlmsTxt(origin: string): Promise<string | null> {
  try {
    const response = await fetch(`${origin}/llms.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(SITE_RESOURCE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch { return null; }
}

export async function fetchLlmsFullTxt(origin: string): Promise<string | null> {
  try {
    const response = await fetch(`${origin}/llms-full.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(SITE_RESOURCE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch { return null; }
}

export async function fetchOpenApiSpec(origin: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAPI_DISCOVERY_TIMEOUT_MS);

  try {
    const attempts = OPENAPI_PATHS.map(async path => {
      const response = await fetch(`${origin}${path}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error('OpenAPI path not found');
      }
      const text = await response.text();
      if (text.includes('"openapi"') || text.includes('"swagger"')) {
        return text;
      }
      throw new Error('Path does not contain an OpenAPI/Swagger document');
    });

    const spec = await Promise.any(attempts);
    return spec;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
