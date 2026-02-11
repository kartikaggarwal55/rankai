import * as cheerio from 'cheerio';
import { CrawlResult } from '../types';

const USER_AGENT = 'RankAI-Analyzer/1.0 (GEO/AEO website analysis tool)';

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

export async function discoverPages(baseUrl: string, html: string, maxPages: number = 15): Promise<string[]> {
  const base = new URL(baseUrl);
  const pages = new Set<string>();
  pages.add(baseUrl);

  // Try sitemap first
  const sitemapUrls = await fetchSitemap(base.origin);
  for (const url of sitemapUrls) {
    if (pages.size >= maxPages) break;
    pages.add(url);
  }

  // Also extract links from the page
  const $ = cheerio.load(html);
  $('a[href]').each((_, el) => {
    if (pages.size >= maxPages) return false;
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

  return Array.from(pages).slice(0, maxPages);
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
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch { return null; }
}

export async function fetchLlmsTxt(origin: string): Promise<string | null> {
  try {
    const response = await fetch(`${origin}/llms.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch { return null; }
}

export async function fetchLlmsFullTxt(origin: string): Promise<string | null> {
  try {
    const response = await fetch(`${origin}/llms-full.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch { return null; }
}

export async function fetchOpenApiSpec(origin: string): Promise<string | null> {
  const paths = ['/openapi.json', '/swagger.json', '/api-docs', '/api/openapi.json', '/docs/openapi.json'];
  for (const path of paths) {
    try {
      const response = await fetch(`${origin}${path}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const text = await response.text();
        if (text.includes('"openapi"') || text.includes('"swagger"')) return text;
      }
    } catch { continue; }
  }
  return null;
}
