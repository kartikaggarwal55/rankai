import * as cheerio from 'cheerio';
import { SiteType, AEOAnalysis, CategoryScore, Finding, getGrade, ADAPTIVE_AEO_WEIGHTS } from '../types';
import { analyzeAEO } from './aeo-analyzer';

interface SiteContext {
  allPages: { url: string; html: string; title: string }[];
  robotsTxt: string | null;
  llmsTxt: string | null;
  llmsFullTxt: string | null;
  openApiSpec: string | null;
  origin: string;
}

function buildCategoryScore(findings: Finding[], recommendations: string[], weightMap: Record<string, number>, categoryKey: string): CategoryScore {
  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
  return { score, grade: getGrade(score), weight: weightMap[categoryKey] ?? 0, findings, recommendations };
}

function getAllText(ctx: SiteContext): string {
  return ctx.allPages.map(p => cheerio.load(p.html)('body').text()).join(' ');
}

// ─── Main export ────────────────────────────────────────────────────────────

export function analyzeAdaptiveAEO(ctx: SiteContext, siteType: SiteType): AEOAnalysis {
  if (siteType === 'saas-api') {
    return analyzeAEO(ctx);
  }

  const w = ADAPTIVE_AEO_WEIGHTS[siteType];

  switch (siteType) {
    case 'ecommerce':
      return {
        productSchema: analyzeProductSchema(ctx, w),
        reviewMarkup: analyzeReviewMarkup(ctx, w),
        inventorySignals: analyzeInventorySignals(ctx, w),
        merchantFeed: analyzeMerchantFeed(ctx, w),
        comparisonContent: analyzeComparisonContent(ctx, w),
        customerEvidence: analyzeCustomerEvidence(ctx, w),
        purchaseSimplicity: analyzePurchaseSimplicity(ctx, w),
        llmsTxt: analyzeLlmsTxt(ctx, w),
        machineReadableSitemaps: analyzeMachineReadableSitemaps(ctx, w),
        faqContent: analyzeFaqContent(ctx, w),
        categoryTaxonomy: analyzeCategoryTaxonomy(ctx, w),
      };
    case 'local-business':
      return {
        localSchema: analyzeLocalSchema(ctx, w),
        napConsistency: analyzeNapConsistency(ctx, w),
        reviewPresence: analyzeReviewPresence(ctx, w),
        servicePages: analyzeServicePages(ctx, w),
        locationSignals: analyzeLocationSignals(ctx, w),
        contactAccessibility: analyzeContactAccessibility(ctx, w),
        trustSignals: analyzeTrustSignalsLocal(ctx, w),
        llmsTxt: analyzeLlmsTxt(ctx, w),
        machineReadableSitemaps: analyzeMachineReadableSitemaps(ctx, w),
        localContent: analyzeLocalContent(ctx, w),
        photoEvidence: analyzePhotoEvidence(ctx, w),
      };
    case 'content-publisher':
      return {
        authorCredentials: analyzeAuthorCredentials(ctx, w),
        contentTaxonomy: analyzeContentTaxonomy(ctx, w),
        publishingCadence: analyzePublishingCadence(ctx, w),
        syndicationReadiness: analyzeSyndicationReadiness(ctx, w),
        originalReporting: analyzeOriginalReporting(ctx, w),
        sourceCitation: analyzeSourceCitation(ctx, w),
        llmsTxt: analyzeLlmsTxt(ctx, w),
        machineReadableSitemaps: analyzeMachineReadableSitemaps(ctx, w),
        archiveDiscoverability: analyzeArchiveDiscoverability(ctx, w),
        multimediaIntegration: analyzeMultimediaIntegration(ctx, w),
        newsletterPresence: analyzeNewsletterPresence(ctx, w),
      };
    case 'general':
    default:
      return {
        documentationStructure: analyzeDocumentationStructureGeneral(ctx, w),
        llmsTxt: analyzeLlmsTxt(ctx, w),
        machineReadableSitemaps: analyzeMachineReadableSitemaps(ctx, w),
        contentQuality: analyzeContentQuality(ctx, w),
        trustSignals: analyzeTrustSignalsGeneral(ctx, w),
      };
  }
}

// ─── Shared categories (llmsTxt, machineReadableSitemaps) ───────────────────

function analyzeLlmsTxt(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  const hasLlmsTxt = ctx.llmsTxt !== null;
  findings.push({
    check: '/llms.txt file exists',
    status: hasLlmsTxt ? 'pass' : 'fail',
    details: hasLlmsTxt ? 'llms.txt found' : 'No llms.txt file at site root',
    points: hasLlmsTxt ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasLlmsTxt) recommendations.push('Create an /llms.txt file at your domain root. This standard provides structured, token-efficient content that LLMs can quickly parse to understand your site.');

  if (hasLlmsTxt && ctx.llmsTxt) {
    const hasH1 = /^#\s+\S/m.test(ctx.llmsTxt);
    findings.push({
      check: 'H1 heading with site name',
      status: hasH1 ? 'pass' : 'fail',
      details: hasH1 ? 'H1 heading found' : 'Missing required H1 heading',
      points: hasH1 ? 15 : 0,
      maxPoints: 15,
    });

    const hasBlockquote = ctx.llmsTxt.includes('>');
    findings.push({
      check: 'Summary blockquote',
      status: hasBlockquote ? 'pass' : 'fail',
      details: hasBlockquote ? 'Summary blockquote found' : 'Missing summary blockquote',
      points: hasBlockquote ? 15 : 0,
      maxPoints: 15,
    });

    const h2Sections = (ctx.llmsTxt.match(/^##\s+/gm) || []).length;
    findings.push({
      check: 'H2 sections with categorized links',
      status: h2Sections >= 2 ? 'pass' : h2Sections >= 1 ? 'partial' : 'fail',
      details: `${h2Sections} H2 section(s) found`,
      points: h2Sections >= 2 ? 15 : h2Sections >= 1 ? 8 : 0,
      maxPoints: 15,
    });

    const urlCount = (ctx.llmsTxt.match(/https?:\/\/\S+/g) || []).length;
    findings.push({
      check: 'URL links present',
      status: urlCount >= 5 ? 'pass' : urlCount >= 2 ? 'partial' : 'fail',
      details: `${urlCount} URL(s) in llms.txt`,
      points: urlCount >= 5 ? 15 : urlCount >= 2 ? 8 : 0,
      maxPoints: 15,
    });
  } else {
    ['H1 heading', 'Summary blockquote', 'H2 sections', 'URL links'].forEach(check => {
      findings.push({ check, status: 'fail', details: 'N/A — no llms.txt file', points: 0, maxPoints: 15 });
    });
  }

  const hasFullTxt = ctx.llmsFullTxt !== null;
  findings.push({
    check: '/llms-full.txt companion file',
    status: hasFullTxt ? 'pass' : 'fail',
    details: hasFullTxt ? 'llms-full.txt found' : 'No llms-full.txt file',
    points: hasFullTxt ? 15 : 0,
    maxPoints: 15,
  });
  if (!hasFullTxt) recommendations.push('Create an /llms-full.txt with complete site content in a single Markdown file for AI agents to ingest.');

  return buildCategoryScore(findings, recommendations, w, 'llmsTxt');
}

function analyzeMachineReadableSitemaps(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  const hasRobotsTxt = ctx.robotsTxt !== null;
  findings.push({
    check: 'robots.txt exists',
    status: hasRobotsTxt ? 'pass' : 'fail',
    details: hasRobotsTxt ? 'robots.txt found' : 'No robots.txt',
    points: hasRobotsTxt ? 15 : 0,
    maxPoints: 15,
  });

  if (ctx.robotsTxt) {
    const aiBots = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'OAI-SearchBot'];
    const blockedBots = aiBots.filter(bot => {
      const regex = new RegExp(`User-agent:\\s*${bot}[\\s\\S]*?Disallow:\\s*/`, 'i');
      return regex.test(ctx.robotsTxt!);
    });
    const allAllowed = blockedBots.length === 0;
    findings.push({
      check: 'AI bot access (robots.txt)',
      status: allAllowed ? 'pass' : blockedBots.length <= 2 ? 'partial' : 'fail',
      details: allAllowed ? 'All major AI bots allowed' : `Blocked: ${blockedBots.join(', ')}`,
      points: allAllowed ? 20 : (5 - blockedBots.length) * 4,
      maxPoints: 20,
    });
    if (!allAllowed) recommendations.push(`Unblock AI crawlers in robots.txt. Currently blocked: ${blockedBots.join(', ')}.`);

    const hasSitemapRef = /sitemap:/i.test(ctx.robotsTxt);
    findings.push({
      check: 'Sitemap referenced in robots.txt',
      status: hasSitemapRef ? 'pass' : 'fail',
      details: hasSitemapRef ? 'Sitemap directive found' : 'No Sitemap directive in robots.txt',
      points: hasSitemapRef ? 10 : 0,
      maxPoints: 10,
    });
  } else {
    findings.push({ check: 'AI bot access', status: 'partial', details: 'Cannot check — no robots.txt', points: 10, maxPoints: 20 });
    findings.push({ check: 'Sitemap in robots.txt', status: 'fail', details: 'No robots.txt', points: 0, maxPoints: 10 });
  }

  findings.push({
    check: 'llms.txt present',
    status: ctx.llmsTxt ? 'pass' : 'fail',
    details: ctx.llmsTxt ? 'llms.txt available' : 'No llms.txt',
    points: ctx.llmsTxt ? 15 : 0,
    maxPoints: 15,
  });

  const hasBreadcrumbs = ctx.allPages.some(p => {
    const $ = cheerio.load(p.html);
    return $('[itemtype*="BreadcrumbList"], nav[aria-label="breadcrumb"], .breadcrumb').length > 0;
  });
  findings.push({
    check: 'Breadcrumb navigation',
    status: hasBreadcrumbs ? 'pass' : 'fail',
    details: hasBreadcrumbs ? 'Breadcrumb navigation found' : 'No breadcrumbs detected',
    points: hasBreadcrumbs ? 10 : 0,
    maxPoints: 10,
  });

  const hasSemanticNav = ctx.allPages.some(p => {
    const $ = cheerio.load(p.html);
    return $('nav').length >= 1 && $('main, [role="main"]').length >= 1;
  });
  findings.push({
    check: 'Semantic HTML (<nav>, <main>)',
    status: hasSemanticNav ? 'pass' : 'fail',
    details: hasSemanticNav ? 'Semantic HTML elements used' : 'Missing semantic HTML elements',
    points: hasSemanticNav ? 15 : 0,
    maxPoints: 15,
  });

  const cleanUrls = ctx.allPages.filter(p => {
    try {
      const path = new URL(p.url).pathname;
      return /^\/[\w\-\/]*$/.test(path) && path.length < 80;
    } catch { return false; }
  });
  const cleanRatio = ctx.allPages.length > 0 ? cleanUrls.length / ctx.allPages.length : 0;
  findings.push({
    check: 'Clean URL structure',
    status: cleanRatio >= 0.8 ? 'pass' : cleanRatio >= 0.5 ? 'partial' : 'fail',
    details: `${Math.round(cleanRatio * 100)}% of URLs are clean and hierarchical`,
    points: cleanRatio >= 0.8 ? 15 : cleanRatio >= 0.5 ? 8 : 0,
    maxPoints: 15,
  });

  return buildCategoryScore(findings, recommendations, w, 'machineReadableSitemaps');
}

// ─── E-commerce category analyzers ──────────────────────────────────────────

function analyzeProductSchema(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let pagesWithProductSchema = 0;
  let hasPrice = false;
  let hasAvailability = false;
  let hasImages = false;
  let hasSku = false;
  let hasReviewInSchema = false;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const jsonLdScripts = $('script[type="application/ld+json"]');
    jsonLdScripts.each((_, el) => {
      try {
        const data = JSON.parse($(el).text());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Product' || item['@type'] === 'Offer' || (item['@graph'] && JSON.stringify(item['@graph']).includes('"Product"'))) {
            pagesWithProductSchema++;
            const str = JSON.stringify(item);
            if (/price|priceCurrency/i.test(str)) hasPrice = true;
            if (/availability|InStock|OutOfStock/i.test(str)) hasAvailability = true;
            if (/image/i.test(str)) hasImages = true;
            if (/sku|gtin|mpn|isbn/i.test(str)) hasSku = true;
            if (/aggregateRating|review/i.test(str)) hasReviewInSchema = true;
          }
        }
      } catch {}
    });
  }

  findings.push({
    check: 'Product/Offer JSON-LD present',
    status: pagesWithProductSchema >= 2 ? 'pass' : pagesWithProductSchema >= 1 ? 'partial' : 'fail',
    details: pagesWithProductSchema > 0 ? `Product schema found on ${pagesWithProductSchema} page(s)` : 'No Product/Offer JSON-LD detected',
    points: pagesWithProductSchema >= 2 ? 25 : pagesWithProductSchema >= 1 ? 15 : 0,
    maxPoints: 25,
  });
  if (pagesWithProductSchema === 0) recommendations.push('Add Product JSON-LD structured data to all product pages. AI shopping assistants rely on structured product data to make accurate recommendations.');

  findings.push({
    check: 'Price in product schema',
    status: hasPrice ? 'pass' : 'fail',
    details: hasPrice ? 'Price data found in schema' : 'No price data in product schema',
    points: hasPrice ? 20 : 0,
    maxPoints: 20,
  });

  findings.push({
    check: 'Availability status in schema',
    status: hasAvailability ? 'pass' : 'fail',
    details: hasAvailability ? 'Availability data found' : 'No availability status in schema',
    points: hasAvailability ? 15 : 0,
    maxPoints: 15,
  });

  findings.push({
    check: 'Product images in schema',
    status: hasImages ? 'pass' : 'fail',
    details: hasImages ? 'Image references in product schema' : 'No images in product schema',
    points: hasImages ? 15 : 0,
    maxPoints: 15,
  });

  findings.push({
    check: 'SKU/GTIN identifiers',
    status: hasSku ? 'pass' : 'fail',
    details: hasSku ? 'Product identifiers (SKU/GTIN/MPN) found' : 'No product identifiers in schema',
    points: hasSku ? 10 : 0,
    maxPoints: 10,
  });
  if (!hasSku) recommendations.push('Include SKU, GTIN, or MPN identifiers in product schema. These help AI assistants cross-reference products across retailers.');

  findings.push({
    check: 'Reviews in product schema',
    status: hasReviewInSchema ? 'pass' : 'fail',
    details: hasReviewInSchema ? 'Review/rating data in product schema' : 'No review data in product schema',
    points: hasReviewInSchema ? 15 : 0,
    maxPoints: 15,
  });

  return buildCategoryScore(findings, recommendations, w, 'productSchema');
}

function analyzeReviewMarkup(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let hasAggregateRating = false;
  let hasIndividualReviews = false;
  let hasStarRatings = false;
  let hasReviewCount = false;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const jsonLdScripts = $('script[type="application/ld+json"]');
    jsonLdScripts.each((_, el) => {
      try {
        const str = $(el).text();
        if (/AggregateRating/i.test(str)) hasAggregateRating = true;
        if (/"Review"/i.test(str) || /"@type"\s*:\s*"Review"/i.test(str)) hasIndividualReviews = true;
        if (/ratingValue/i.test(str)) hasStarRatings = true;
        if (/reviewCount|ratingCount/i.test(str)) hasReviewCount = true;
      } catch {}
    });

    if ($('[itemtype*="AggregateRating"]').length > 0) hasAggregateRating = true;
    if ($('[itemtype*="Review"]').length > 0) hasIndividualReviews = true;
    if ($('.star-rating, .stars, [class*="rating"], [data-rating]').length > 0) hasStarRatings = true;
  }

  findings.push({
    check: 'AggregateRating schema',
    status: hasAggregateRating ? 'pass' : 'fail',
    details: hasAggregateRating ? 'AggregateRating markup found' : 'No AggregateRating schema detected',
    points: hasAggregateRating ? 30 : 0,
    maxPoints: 30,
  });
  if (!hasAggregateRating) recommendations.push('Add AggregateRating schema to product pages. AI assistants prioritize products with clear rating signals when making purchase recommendations.');

  findings.push({
    check: 'Individual Review schema',
    status: hasIndividualReviews ? 'pass' : 'fail',
    details: hasIndividualReviews ? 'Individual Review markup found' : 'No individual Review schema',
    points: hasIndividualReviews ? 25 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Star ratings visible',
    status: hasStarRatings ? 'pass' : 'fail',
    details: hasStarRatings ? 'Star/rating display detected' : 'No visible star ratings found',
    points: hasStarRatings ? 25 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Review count displayed',
    status: hasReviewCount ? 'pass' : 'fail',
    details: hasReviewCount ? 'Review count found in schema' : 'No review count in markup',
    points: hasReviewCount ? 20 : 0,
    maxPoints: 20,
  });
  if (!hasReviewCount) recommendations.push('Include reviewCount in your rating schema. AI assistants weigh review volume alongside rating scores when evaluating product quality.');

  return buildCategoryScore(findings, recommendations, w, 'reviewMarkup');
}

function analyzeInventorySignals(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];
  const allText = getAllText(ctx);

  let hasAvailabilitySchema = false;
  let hasPriceCurrency = false;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const str = $(el).text();
        if (/InStock|OutOfStock|PreOrder|availability/i.test(str)) hasAvailabilitySchema = true;
        if (/priceCurrency/i.test(str)) hasPriceCurrency = true;
      } catch {}
    });
  }

  findings.push({
    check: 'Availability in structured data',
    status: hasAvailabilitySchema ? 'pass' : 'fail',
    details: hasAvailabilitySchema ? 'Stock availability found in schema' : 'No availability signals in structured data',
    points: hasAvailabilitySchema ? 30 : 0,
    maxPoints: 30,
  });
  if (!hasAvailabilitySchema) recommendations.push('Add availability status (InStock/OutOfStock) to product schema. AI shopping assistants filter out unavailable products from recommendations.');

  findings.push({
    check: 'Price currency specified',
    status: hasPriceCurrency ? 'pass' : 'fail',
    details: hasPriceCurrency ? 'Price currency found in schema' : 'No price currency in structured data',
    points: hasPriceCurrency ? 25 : 0,
    maxPoints: 25,
  });

  const hasShippingInfo = /shipping|delivery|free shipping|ships in|dispatch/i.test(allText);
  findings.push({
    check: 'Shipping information visible',
    status: hasShippingInfo ? 'pass' : 'fail',
    details: hasShippingInfo ? 'Shipping information detected' : 'No shipping information found',
    points: hasShippingInfo ? 25 : 0,
    maxPoints: 25,
  });

  const hasReturnPolicy = /return policy|returns|refund|money.back/i.test(allText);
  findings.push({
    check: 'Return policy accessible',
    status: hasReturnPolicy ? 'pass' : 'fail',
    details: hasReturnPolicy ? 'Return policy content found' : 'No return policy detected',
    points: hasReturnPolicy ? 20 : 0,
    maxPoints: 20,
  });
  if (!hasReturnPolicy) recommendations.push('Make return policy easily discoverable. AI assistants include return/refund details when recommending products.');

  return buildCategoryScore(findings, recommendations, w, 'inventorySignals');
}

function analyzeMerchantFeed(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let hasCanonical = 0;
  let hasCompleteProductData = 0;
  let hasOgProductTags = false;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    if ($('link[rel="canonical"]').length > 0) hasCanonical++;

    const ogType = $('meta[property="og:type"]').attr('content') || '';
    if (/product/i.test(ogType)) hasOgProductTags = true;

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const str = $(el).text();
        if (/Product/i.test(str) && /price/i.test(str) && /name/i.test(str) && /image/i.test(str)) {
          hasCompleteProductData++;
        }
      } catch {}
    });
  }

  const canonicalRatio = ctx.allPages.length > 0 ? hasCanonical / ctx.allPages.length : 0;
  findings.push({
    check: 'Canonical URLs on all pages',
    status: canonicalRatio >= 0.8 ? 'pass' : canonicalRatio >= 0.5 ? 'partial' : 'fail',
    details: `${Math.round(canonicalRatio * 100)}% of pages have canonical URLs`,
    points: canonicalRatio >= 0.8 ? 25 : canonicalRatio >= 0.5 ? 12 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Complete product structured data',
    status: hasCompleteProductData >= 2 ? 'pass' : hasCompleteProductData >= 1 ? 'partial' : 'fail',
    details: `${hasCompleteProductData} page(s) with complete product data (name, price, image)`,
    points: hasCompleteProductData >= 2 ? 30 : hasCompleteProductData >= 1 ? 15 : 0,
    maxPoints: 30,
  });
  if (hasCompleteProductData === 0) recommendations.push('Ensure product structured data includes name, price, and image at minimum. Google Merchant Center and AI shopping agents require these fields.');

  findings.push({
    check: 'OpenGraph product tags',
    status: hasOgProductTags ? 'pass' : 'fail',
    details: hasOgProductTags ? 'og:type product tags found' : 'No OpenGraph product type tags',
    points: hasOgProductTags ? 20 : 0,
    maxPoints: 20,
  });

  const allText = getAllText(ctx);
  const hasGtinUpc = /gtin|upc|ean|isbn|mpn/i.test(allText);
  findings.push({
    check: 'Product identifier codes (GTIN/UPC)',
    status: hasGtinUpc ? 'pass' : 'fail',
    details: hasGtinUpc ? 'Product identifier codes referenced' : 'No GTIN/UPC/EAN identifiers found',
    points: hasGtinUpc ? 25 : 0,
    maxPoints: 25,
  });

  return buildCategoryScore(findings, recommendations, w, 'merchantFeed');
}

function analyzeComparisonContent(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let comparisonTables = 0;
  let vsPages = 0;
  let featureMatrices = 0;
  let prosConsSections = 0;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const text = $('body').text();

    if (/\bvs\.?\b|versus|compared to|comparison/i.test(page.url) || /\bvs\.?\b|versus/i.test(page.title)) {
      vsPages++;
    }

    const tables = $('table');
    tables.each((_, el) => {
      const tableText = $(el).text();
      if (/yes|no|✓|✗|✔|✘|included|not included/i.test(tableText)) {
        comparisonTables++;
      }
    });

    if (/feature comparison|feature matrix|compare plans|compare products/i.test(text)) {
      featureMatrices++;
    }

    if (/\bpros\b.*\bcons\b|\badvantages\b.*\bdisadvantages\b/i.test(text)) {
      prosConsSections++;
    }
  }

  findings.push({
    check: 'Comparison or "vs" pages',
    status: vsPages >= 2 ? 'pass' : vsPages >= 1 ? 'partial' : 'fail',
    details: `${vsPages} comparison/vs page(s) found`,
    points: vsPages >= 2 ? 25 : vsPages >= 1 ? 12 : 0,
    maxPoints: 25,
  });
  if (vsPages === 0) recommendations.push('Create comparison pages (e.g., "Product A vs Product B"). AI assistants frequently cite comparison content when answering purchase-decision queries.');

  findings.push({
    check: 'Comparison tables',
    status: comparisonTables >= 2 ? 'pass' : comparisonTables >= 1 ? 'partial' : 'fail',
    details: `${comparisonTables} comparison table(s) detected`,
    points: comparisonTables >= 2 ? 25 : comparisonTables >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Feature matrix content',
    status: featureMatrices >= 1 ? 'pass' : 'fail',
    details: featureMatrices > 0 ? `${featureMatrices} feature matrix section(s) found` : 'No feature comparison matrices found',
    points: featureMatrices >= 1 ? 25 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Pros/cons or advantage sections',
    status: prosConsSections >= 1 ? 'pass' : 'fail',
    details: prosConsSections > 0 ? `${prosConsSections} pros/cons section(s) found` : 'No pros/cons content detected',
    points: prosConsSections >= 1 ? 25 : 0,
    maxPoints: 25,
  });

  return buildCategoryScore(findings, recommendations, w, 'comparisonContent');
}

function analyzeCustomerEvidence(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];
  const allText = getAllText(ctx);

  const hasTestimonials = /testimonial|customer review|customer feedback|what our customers say|client testimonial/i.test(allText);
  findings.push({
    check: 'Testimonials present',
    status: hasTestimonials ? 'pass' : 'fail',
    details: hasTestimonials ? 'Customer testimonials found' : 'No testimonials detected',
    points: hasTestimonials ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasTestimonials) recommendations.push('Add customer testimonials to your site. AI assistants cite social proof and customer experiences when recommending products.');

  let reviewCountSignals = 0;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    if (/\d+\s*reviews?|\d+\s*ratings?/i.test($('body').text())) reviewCountSignals++;
  }
  findings.push({
    check: 'Review count visibility',
    status: reviewCountSignals >= 2 ? 'pass' : reviewCountSignals >= 1 ? 'partial' : 'fail',
    details: `${reviewCountSignals} page(s) showing review counts`,
    points: reviewCountSignals >= 2 ? 25 : reviewCountSignals >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  const hasUgc = /user generated|customer photo|customer video|real customer|verified purchase|verified buyer/i.test(allText);
  findings.push({
    check: 'User-generated content signals',
    status: hasUgc ? 'pass' : 'fail',
    details: hasUgc ? 'UGC signals found' : 'No user-generated content signals',
    points: hasUgc ? 25 : 0,
    maxPoints: 25,
  });

  const hasTrustBadges = /trustpilot|bbb|better business bureau|shopper approved|google reviews|yelp|verified|trust badge/i.test(allText);
  findings.push({
    check: 'Trust badges (TrustPilot, BBB, etc.)',
    status: hasTrustBadges ? 'pass' : 'fail',
    details: hasTrustBadges ? 'Trust badges/seals detected' : 'No trust badge references found',
    points: hasTrustBadges ? 25 : 0,
    maxPoints: 25,
  });

  return buildCategoryScore(findings, recommendations, w, 'customerEvidence');
}

function analyzePurchaseSimplicity(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];
  const allText = getAllText(ctx);

  let clearCtas = 0;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    if ($('button, a, [role="button"]').filter((_, el) => /add to cart|buy now|shop now|order now|purchase/i.test($(el).text())).length > 0) {
      clearCtas++;
    }
  }
  findings.push({
    check: 'Clear purchase CTAs',
    status: clearCtas >= 2 ? 'pass' : clearCtas >= 1 ? 'partial' : 'fail',
    details: `${clearCtas} page(s) with purchase CTAs`,
    points: clearCtas >= 2 ? 25 : clearCtas >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  const hasPricingVisible = /\$\d|\€\d|£\d|price|pricing/i.test(allText);
  findings.push({
    check: 'Pricing clearly visible',
    status: hasPricingVisible ? 'pass' : 'fail',
    details: hasPricingVisible ? 'Pricing information visible' : 'No visible pricing detected',
    points: hasPricingVisible ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasPricingVisible) recommendations.push('Make pricing immediately visible on product pages. AI assistants deprioritize recommendations when they cannot confirm pricing.');

  const noLoginWall = !ctx.allPages.some(p => {
    const $ = cheerio.load(p.html);
    return /sign in to see price|login for pricing|log in to view/i.test($('body').text());
  });
  findings.push({
    check: 'No login wall before pricing',
    status: noLoginWall ? 'pass' : 'fail',
    details: noLoginWall ? 'No login-gated pricing detected' : 'Pricing appears to be behind login wall',
    points: noLoginWall ? 25 : 0,
    maxPoints: 25,
  });

  const hasShippingReturn = /shipping policy|return policy|free returns|satisfaction guarantee/i.test(allText);
  findings.push({
    check: 'Shipping/return policies findable',
    status: hasShippingReturn ? 'pass' : 'fail',
    details: hasShippingReturn ? 'Shipping/return policies found' : 'No shipping/return policy content detected',
    points: hasShippingReturn ? 25 : 0,
    maxPoints: 25,
  });

  return buildCategoryScore(findings, recommendations, w, 'purchaseSimplicity');
}

function analyzeFaqContent(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let hasFaqSchema = false;
  let faqSections = 0;
  let productFaqs = 0;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const text = $('body').text();

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        if (/FAQPage/i.test($(el).text())) hasFaqSchema = true;
      } catch {}
    });

    if (/frequently asked|faq/i.test(text)) faqSections++;
    if (/product.*faq|faq.*product|shipping.*question|return.*question/i.test(text)) productFaqs++;
  }

  findings.push({
    check: 'FAQPage schema markup',
    status: hasFaqSchema ? 'pass' : 'fail',
    details: hasFaqSchema ? 'FAQPage JSON-LD found' : 'No FAQPage schema markup',
    points: hasFaqSchema ? 30 : 0,
    maxPoints: 30,
  });
  if (!hasFaqSchema) recommendations.push('Add FAQPage schema to pages with Q&A content. AI assistants frequently extract answers from FAQ structured data for purchase-related queries.');

  findings.push({
    check: 'FAQ content sections',
    status: faqSections >= 2 ? 'pass' : faqSections >= 1 ? 'partial' : 'fail',
    details: `${faqSections} page(s) with FAQ content`,
    points: faqSections >= 2 ? 25 : faqSections >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Product-specific FAQs',
    status: productFaqs >= 1 ? 'pass' : 'fail',
    details: productFaqs > 0 ? `${productFaqs} page(s) with product-specific Q&A` : 'No product-specific FAQ content',
    points: productFaqs >= 1 ? 25 : 0,
    maxPoints: 25,
  });

  const faqPages = ctx.allPages.filter(p => /\/faq|\/help|\/support|\/questions/i.test(p.url));
  findings.push({
    check: 'Dedicated FAQ/help pages',
    status: faqPages.length >= 1 ? 'pass' : 'fail',
    details: faqPages.length > 0 ? `${faqPages.length} FAQ/help page(s) found` : 'No dedicated FAQ page detected',
    points: faqPages.length >= 1 ? 20 : 0,
    maxPoints: 20,
  });

  return buildCategoryScore(findings, recommendations, w, 'faqContent');
}

function analyzeCategoryTaxonomy(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let hasBreadcrumbSchema = false;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        if (/BreadcrumbList/i.test($(el).text())) hasBreadcrumbSchema = true;
      } catch {}
    });
    if ($('[itemtype*="BreadcrumbList"]').length > 0) hasBreadcrumbSchema = true;
  }

  findings.push({
    check: 'BreadcrumbList schema',
    status: hasBreadcrumbSchema ? 'pass' : 'fail',
    details: hasBreadcrumbSchema ? 'BreadcrumbList schema found' : 'No BreadcrumbList schema',
    points: hasBreadcrumbSchema ? 30 : 0,
    maxPoints: 30,
  });
  if (!hasBreadcrumbSchema) recommendations.push('Add BreadcrumbList JSON-LD schema. This helps AI assistants understand your product category hierarchy.');

  const categoryUrls = ctx.allPages.filter(p => /\/category\/|\/collections\/|\/department\/|\/shop\//i.test(p.url));
  findings.push({
    check: 'Category URL hierarchy',
    status: categoryUrls.length >= 2 ? 'pass' : categoryUrls.length >= 1 ? 'partial' : 'fail',
    details: `${categoryUrls.length} category URL(s) found`,
    points: categoryUrls.length >= 2 ? 25 : categoryUrls.length >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  const cleanHierarchy = ctx.allPages.filter(p => {
    try {
      const path = new URL(p.url).pathname;
      const segments = path.split('/').filter(Boolean);
      return segments.length >= 2 && segments.length <= 4;
    } catch { return false; }
  });
  const hierarchyRatio = ctx.allPages.length > 0 ? cleanHierarchy.length / ctx.allPages.length : 0;
  findings.push({
    check: 'Clean hierarchical URL paths',
    status: hierarchyRatio >= 0.6 ? 'pass' : hierarchyRatio >= 0.3 ? 'partial' : 'fail',
    details: `${Math.round(hierarchyRatio * 100)}% of pages have clean hierarchical URLs`,
    points: hierarchyRatio >= 0.6 ? 25 : hierarchyRatio >= 0.3 ? 12 : 0,
    maxPoints: 25,
  });

  let hasNavCategories = false;
  for (const page of ctx.allPages.slice(0, 3)) {
    const $ = cheerio.load(page.html);
    const navLinks = $('nav a, [role="navigation"] a').length;
    if (navLinks >= 5) hasNavCategories = true;
  }
  findings.push({
    check: 'Category navigation structure',
    status: hasNavCategories ? 'pass' : 'fail',
    details: hasNavCategories ? 'Category navigation detected' : 'No category navigation structure found',
    points: hasNavCategories ? 20 : 0,
    maxPoints: 20,
  });

  return buildCategoryScore(findings, recommendations, w, 'categoryTaxonomy');
}

// ─── Local business category analyzers ──────────────────────────────────────

function analyzeLocalSchema(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let hasLocalSchema = false;
  let hasName = false;
  let hasAddress = false;
  let hasPhone = false;
  let hasHours = false;
  let hasGeo = false;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const str = $(el).text();
        if (/LocalBusiness|Restaurant|MedicalBusiness|Dentist|LegalService|AutoRepair|FinancialService|Store|FoodEstablishment|HealthAndBeautyBusiness|HomeAndConstructionBusiness|ProfessionalService/i.test(str)) {
          hasLocalSchema = true;
          if (/"name"/i.test(str)) hasName = true;
          if (/streetAddress|postalCode|addressLocality/i.test(str)) hasAddress = true;
          if (/telephone/i.test(str)) hasPhone = true;
          if (/openingHours|OpeningHoursSpecification/i.test(str)) hasHours = true;
          if (/latitude|longitude|geo/i.test(str)) hasGeo = true;
        }
      } catch {}
    });
  }

  findings.push({
    check: 'LocalBusiness JSON-LD schema',
    status: hasLocalSchema ? 'pass' : 'fail',
    details: hasLocalSchema ? 'LocalBusiness (or subtype) schema found' : 'No LocalBusiness schema detected',
    points: hasLocalSchema ? 20 : 0,
    maxPoints: 20,
  });
  if (!hasLocalSchema) recommendations.push('Add LocalBusiness JSON-LD schema with your business type (Restaurant, Dentist, etc.). AI assistants rely on this structured data for local recommendations.');

  findings.push({
    check: 'Business name in schema',
    status: hasName ? 'pass' : 'fail',
    details: hasName ? 'Business name found in schema' : 'No name in schema',
    points: hasName ? 15 : 0,
    maxPoints: 15,
  });

  findings.push({
    check: 'Address in schema',
    status: hasAddress ? 'pass' : 'fail',
    details: hasAddress ? 'Address data found in schema' : 'No structured address in schema',
    points: hasAddress ? 20 : 0,
    maxPoints: 20,
  });

  findings.push({
    check: 'Phone number in schema',
    status: hasPhone ? 'pass' : 'fail',
    details: hasPhone ? 'Phone number in schema' : 'No phone in schema',
    points: hasPhone ? 15 : 0,
    maxPoints: 15,
  });

  findings.push({
    check: 'Opening hours in schema',
    status: hasHours ? 'pass' : 'fail',
    details: hasHours ? 'Opening hours found' : 'No opening hours in schema',
    points: hasHours ? 15 : 0,
    maxPoints: 15,
  });
  if (!hasHours) recommendations.push('Include openingHoursSpecification in your LocalBusiness schema. AI assistants use this data to answer "Is [business] open now?" queries.');

  findings.push({
    check: 'Geo coordinates in schema',
    status: hasGeo ? 'pass' : 'fail',
    details: hasGeo ? 'Geo coordinates found' : 'No geo coordinates in schema',
    points: hasGeo ? 15 : 0,
    maxPoints: 15,
  });

  return buildCategoryScore(findings, recommendations, w, 'localSchema');
}

function analyzeNapConsistency(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  const phoneNumbers = new Set<string>();
  const addresses = new Set<string>();
  let pagesWithPhone = 0;
  let pagesWithAddress = 0;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const text = $('body').text();

    const phones = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [];
    if (phones.length > 0) {
      pagesWithPhone++;
      phones.forEach(p => phoneNumbers.add(p.replace(/[\s\-().]/g, '')));
    }

    const addrPatterns = text.match(/\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl)[\s,]+[\w\s]+,?\s*[A-Z]{2}\s*\d{5}/gi) || [];
    if (addrPatterns.length > 0) {
      pagesWithAddress++;
      addrPatterns.forEach(a => addresses.add(a.trim().toLowerCase()));
    }
  }

  findings.push({
    check: 'Phone number on multiple pages',
    status: pagesWithPhone >= 3 ? 'pass' : pagesWithPhone >= 1 ? 'partial' : 'fail',
    details: `Phone number found on ${pagesWithPhone} page(s)`,
    points: pagesWithPhone >= 3 ? 25 : pagesWithPhone >= 1 ? 12 : 0,
    maxPoints: 25,
  });
  if (pagesWithPhone === 0) recommendations.push('Display your phone number consistently across the site (header or footer). AI assistants extract contact info from multiple pages to verify consistency.');

  findings.push({
    check: 'Phone number consistency',
    status: phoneNumbers.size <= 1 ? 'pass' : phoneNumbers.size <= 2 ? 'partial' : 'fail',
    details: phoneNumbers.size === 0 ? 'No phone numbers found' : `${phoneNumbers.size} unique phone number(s) detected`,
    points: phoneNumbers.size <= 1 && phoneNumbers.size > 0 ? 25 : phoneNumbers.size <= 2 ? 12 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Address on multiple pages',
    status: pagesWithAddress >= 2 ? 'pass' : pagesWithAddress >= 1 ? 'partial' : 'fail',
    details: `Address found on ${pagesWithAddress} page(s)`,
    points: pagesWithAddress >= 2 ? 25 : pagesWithAddress >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Address consistency',
    status: addresses.size <= 1 ? 'pass' : addresses.size <= 2 ? 'partial' : 'fail',
    details: addresses.size === 0 ? 'No structured addresses found' : `${addresses.size} unique address format(s) detected`,
    points: addresses.size <= 1 && addresses.size > 0 ? 25 : addresses.size <= 2 ? 12 : 0,
    maxPoints: 25,
  });
  if (addresses.size > 2) recommendations.push('Use a consistent address format across all pages. Inconsistent NAP (Name/Address/Phone) signals reduce trust in AI local recommendation systems.');

  return buildCategoryScore(findings, recommendations, w, 'napConsistency');
}

function analyzeReviewPresence(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];
  const allText = getAllText(ctx);

  let hasAggregateRating = false;
  let hasReviewCount = false;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const str = $(el).text();
        if (/AggregateRating/i.test(str)) hasAggregateRating = true;
        if (/reviewCount|ratingCount/i.test(str)) hasReviewCount = true;
      } catch {}
    });
  }

  findings.push({
    check: 'AggregateRating schema',
    status: hasAggregateRating ? 'pass' : 'fail',
    details: hasAggregateRating ? 'AggregateRating schema found' : 'No AggregateRating schema',
    points: hasAggregateRating ? 30 : 0,
    maxPoints: 30,
  });
  if (!hasAggregateRating) recommendations.push('Add AggregateRating schema to your site. AI assistants use ratings to rank local business recommendations.');

  findings.push({
    check: 'Review count in schema',
    status: hasReviewCount ? 'pass' : 'fail',
    details: hasReviewCount ? 'Review count found in schema' : 'No review count in schema',
    points: hasReviewCount ? 25 : 0,
    maxPoints: 25,
  });

  const hasGoogleReviewLink = /google\.com\/maps|g\.co\/|google review|review us on google|write a review/i.test(allText);
  findings.push({
    check: 'Google review link/widget',
    status: hasGoogleReviewLink ? 'pass' : 'fail',
    details: hasGoogleReviewLink ? 'Google review references found' : 'No Google review link detected',
    points: hasGoogleReviewLink ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasGoogleReviewLink) recommendations.push('Add a Google review link or widget. Google reviews are a primary signal AI assistants use for local business credibility.');

  const hasThirdPartyReviews = /yelp|tripadvisor|bbb|angi|homeadvisor|healthgrades|zocdoc|avvo/i.test(allText);
  findings.push({
    check: 'Third-party review platforms',
    status: hasThirdPartyReviews ? 'pass' : 'fail',
    details: hasThirdPartyReviews ? 'Third-party review platform references found' : 'No third-party review references',
    points: hasThirdPartyReviews ? 20 : 0,
    maxPoints: 20,
  });

  return buildCategoryScore(findings, recommendations, w, 'reviewPresence');
}

function analyzeServicePages(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  const servicePages = ctx.allPages.filter(p => /\/services?\/|\/treatments?\/|\/offerings?\/|\/specialties?\//i.test(p.url));
  findings.push({
    check: 'Dedicated service pages',
    status: servicePages.length >= 3 ? 'pass' : servicePages.length >= 1 ? 'partial' : 'fail',
    details: `${servicePages.length} dedicated service page(s) found`,
    points: servicePages.length >= 3 ? 25 : servicePages.length >= 1 ? 12 : 0,
    maxPoints: 25,
  });
  if (servicePages.length === 0) recommendations.push('Create individual pages for each service you offer (e.g., /services/teeth-whitening). AI assistants match specific user queries to dedicated service pages.');

  let serviceContentQuality = 0;
  for (const page of servicePages.slice(0, 5)) {
    const $ = cheerio.load(page.html);
    const mainContent = $('main, article, [role="main"], .content').first();
    const text = (mainContent.length ? mainContent : $('body')).text();
    const words = text.split(/\s+/).length;
    if (words >= 200) serviceContentQuality++;
  }
  findings.push({
    check: 'Service page content depth',
    status: serviceContentQuality >= 2 ? 'pass' : serviceContentQuality >= 1 ? 'partial' : 'fail',
    details: servicePages.length === 0 ? 'No service pages to evaluate' : `${serviceContentQuality}/${Math.min(servicePages.length, 5)} service page(s) with 200+ words`,
    points: serviceContentQuality >= 2 ? 25 : serviceContentQuality >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  const allText = getAllText(ctx);
  const hasServiceSchema = /Service|hasOfferCatalog|serviceType/i.test(allText);
  findings.push({
    check: 'Service schema markup',
    status: hasServiceSchema ? 'pass' : 'fail',
    details: hasServiceSchema ? 'Service-related schema found' : 'No Service schema markup',
    points: hasServiceSchema ? 25 : 0,
    maxPoints: 25,
  });

  const hasPricing = /\$\d|pricing|cost|fee|starting at|from \$/i.test(allText);
  findings.push({
    check: 'Service pricing information',
    status: hasPricing ? 'pass' : 'partial',
    details: hasPricing ? 'Pricing information found' : 'No service pricing visible',
    points: hasPricing ? 25 : 8,
    maxPoints: 25,
  });

  return buildCategoryScore(findings, recommendations, w, 'servicePages');
}

function analyzeLocationSignals(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let hasFooterAddress = false;
  let hasMapsEmbed = false;
  let hasServiceArea = false;
  let hasGeoTargetedContent = false;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const footerText = $('footer').text();
    if (/\d+\s+\w+.*(?:street|st|avenue|ave|road|rd|blvd|drive|dr)/i.test(footerText)) hasFooterAddress = true;

    if ($('iframe[src*="google.com/maps"], iframe[src*="maps.google"], .google-map, #map, [data-map]').length > 0) {
      hasMapsEmbed = true;
    }

    const text = $('body').text();
    if (/service area|serving|we serve|coverage area|areas we serve/i.test(text)) hasServiceArea = true;
    if (/neighborhood|community|local|near\s(?:you|me)|in\s(?:your\s)?area/i.test(text)) hasGeoTargetedContent = true;
  }

  findings.push({
    check: 'Address in footer',
    status: hasFooterAddress ? 'pass' : 'fail',
    details: hasFooterAddress ? 'Address found in footer' : 'No address detected in footer area',
    points: hasFooterAddress ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasFooterAddress) recommendations.push('Display your full address in the site footer. AI assistants extract footer addresses as a primary location signal for local recommendations.');

  findings.push({
    check: 'Google Maps embed or link',
    status: hasMapsEmbed ? 'pass' : 'fail',
    details: hasMapsEmbed ? 'Maps embed/widget detected' : 'No Google Maps embed found',
    points: hasMapsEmbed ? 25 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Service area mentions',
    status: hasServiceArea ? 'pass' : 'fail',
    details: hasServiceArea ? 'Service area content found' : 'No service area mentions detected',
    points: hasServiceArea ? 25 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Geo-targeted content',
    status: hasGeoTargetedContent ? 'pass' : 'fail',
    details: hasGeoTargetedContent ? 'Location-targeted language detected' : 'No geo-targeted content found',
    points: hasGeoTargetedContent ? 25 : 0,
    maxPoints: 25,
  });

  return buildCategoryScore(findings, recommendations, w, 'locationSignals');
}

function analyzeContactAccessibility(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let hasClickablePhone = false;
  let hasContactForm = false;
  let hasMultipleContactMethods = 0;
  let hasHoursDisplayed = false;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);

    if ($('a[href^="tel:"]').length > 0) hasClickablePhone = true;
    if ($('form').filter((_, el) => /contact|message|inquiry|email|name/i.test($(el).text())).length > 0) hasContactForm = true;

    const text = $('body').text();
    if (/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(text)) hasMultipleContactMethods++;
    if (/hours|open|closed|mon|tue|wed|thu|fri|sat|sun|monday|tuesday/i.test(text)) hasHoursDisplayed = true;
  }

  findings.push({
    check: 'Clickable phone number (tel: link)',
    status: hasClickablePhone ? 'pass' : 'fail',
    details: hasClickablePhone ? 'Clickable tel: link found' : 'No clickable phone link detected',
    points: hasClickablePhone ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasClickablePhone) recommendations.push('Make phone numbers clickable with tel: links. Mobile users and AI assistants both benefit from structured phone links.');

  findings.push({
    check: 'Contact form present',
    status: hasContactForm ? 'pass' : 'fail',
    details: hasContactForm ? 'Contact form detected' : 'No contact form found',
    points: hasContactForm ? 25 : 0,
    maxPoints: 25,
  });

  const contactPages = ctx.allPages.filter(p => /\/contact|\/reach|\/get-in-touch/i.test(p.url));
  findings.push({
    check: 'Dedicated contact page',
    status: contactPages.length >= 1 ? 'pass' : 'fail',
    details: contactPages.length > 0 ? 'Contact page found' : 'No dedicated contact page',
    points: contactPages.length >= 1 ? 25 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Business hours displayed',
    status: hasHoursDisplayed ? 'pass' : 'fail',
    details: hasHoursDisplayed ? 'Business hours information found' : 'No business hours displayed',
    points: hasHoursDisplayed ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasHoursDisplayed) recommendations.push('Display business hours prominently. AI assistants frequently answer "When is [business] open?" queries using on-page hours data.');

  return buildCategoryScore(findings, recommendations, w, 'contactAccessibility');
}

function analyzeTrustSignalsLocal(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];
  const allText = getAllText(ctx);

  const hasCertifications = /certified|licensed|accredited|board certified|credential|certification|license #|lic\./i.test(allText);
  findings.push({
    check: 'Certifications and licenses',
    status: hasCertifications ? 'pass' : 'fail',
    details: hasCertifications ? 'Certification/license references found' : 'No certifications or licenses mentioned',
    points: hasCertifications ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasCertifications) recommendations.push('Display professional certifications and licenses on your site. AI assistants use credentials as a trust signal when recommending local businesses.');

  const hasAwards = /award|recognition|best of|top rated|winner|#1|number one/i.test(allText);
  findings.push({
    check: 'Awards and recognition',
    status: hasAwards ? 'pass' : 'fail',
    details: hasAwards ? 'Awards/recognition mentions found' : 'No awards or recognition mentioned',
    points: hasAwards ? 25 : 0,
    maxPoints: 25,
  });

  const hasAssociations = /association|member of|affiliated|chamber of commerce|bbb|better business/i.test(allText);
  findings.push({
    check: 'Industry association membership',
    status: hasAssociations ? 'pass' : 'fail',
    details: hasAssociations ? 'Association/membership references found' : 'No industry association mentions',
    points: hasAssociations ? 25 : 0,
    maxPoints: 25,
  });

  const hasAboutTeam = ctx.allPages.some(p => /\/about|\/team|\/our-team|\/staff|\/providers/i.test(p.url));
  findings.push({
    check: 'Team/about page',
    status: hasAboutTeam ? 'pass' : 'fail',
    details: hasAboutTeam ? 'Team or about page found' : 'No team/about page detected',
    points: hasAboutTeam ? 25 : 0,
    maxPoints: 25,
  });

  return buildCategoryScore(findings, recommendations, w, 'trustSignals');
}

function analyzeLocalContent(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];
  const allText = getAllText(ctx);

  const hasNeighborhoodMentions = /neighborhood|district|downtown|midtown|uptown|east side|west side|north|south|suburb/i.test(allText);
  findings.push({
    check: 'Neighborhood/area mentions',
    status: hasNeighborhoodMentions ? 'pass' : 'fail',
    details: hasNeighborhoodMentions ? 'Neighborhood/area references found' : 'No neighborhood content detected',
    points: hasNeighborhoodMentions ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasNeighborhoodMentions) recommendations.push('Include neighborhood and area-specific content. AI assistants match local queries to businesses that demonstrate geographic relevance.');

  const hasLocalEvents = /event|community|sponsoring|hosting|local|charity|fundraiser|annual/i.test(allText);
  findings.push({
    check: 'Community/local event references',
    status: hasLocalEvents ? 'pass' : 'fail',
    details: hasLocalEvents ? 'Local event or community references found' : 'No community involvement content',
    points: hasLocalEvents ? 25 : 0,
    maxPoints: 25,
  });

  const hasLocalSeo = /near me|in \w+ city|serving \w+|located in|based in/i.test(allText);
  findings.push({
    check: 'Location-specific keyword content',
    status: hasLocalSeo ? 'pass' : 'fail',
    details: hasLocalSeo ? 'Location-specific keywords found' : 'No location-specific content patterns',
    points: hasLocalSeo ? 25 : 0,
    maxPoints: 25,
  });

  const hasBlogOrNews = ctx.allPages.some(p => /\/blog|\/news|\/updates|\/articles/i.test(p.url));
  findings.push({
    check: 'Local blog/news content',
    status: hasBlogOrNews ? 'pass' : 'fail',
    details: hasBlogOrNews ? 'Blog or news section found' : 'No blog or news content',
    points: hasBlogOrNews ? 25 : 0,
    maxPoints: 25,
  });

  return buildCategoryScore(findings, recommendations, w, 'localContent');
}

function analyzePhotoEvidence(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let imagesWithAlt = 0;
  let totalImages = 0;
  let hasGallery = false;
  let hasTeamPhotos = false;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);

    $('img').each((_, el) => {
      totalImages++;
      const alt = $(el).attr('alt') || '';
      if (alt.length >= 5) imagesWithAlt++;
    });

    if ($('.gallery, .portfolio, [class*="gallery"], [class*="portfolio"], [data-gallery]').length > 0) hasGallery = true;
    if (/team photo|our team|staff|doctor|provider|meet our/i.test($('body').text())) hasTeamPhotos = true;
  }

  const altRatio = totalImages > 0 ? imagesWithAlt / totalImages : 0;
  findings.push({
    check: 'Images with descriptive alt text',
    status: altRatio >= 0.7 ? 'pass' : altRatio >= 0.4 ? 'partial' : 'fail',
    details: totalImages === 0 ? 'No images found' : `${Math.round(altRatio * 100)}% of images have descriptive alt text (${imagesWithAlt}/${totalImages})`,
    points: altRatio >= 0.7 ? 30 : altRatio >= 0.4 ? 15 : 0,
    maxPoints: 30,
  });
  if (altRatio < 0.7) recommendations.push('Add descriptive alt text to all images. AI assistants use alt text to understand visual content and include it in recommendations.');

  findings.push({
    check: 'Photo gallery/portfolio',
    status: hasGallery ? 'pass' : 'fail',
    details: hasGallery ? 'Gallery or portfolio section found' : 'No gallery/portfolio detected',
    points: hasGallery ? 25 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Team/staff photos',
    status: hasTeamPhotos ? 'pass' : 'fail',
    details: hasTeamPhotos ? 'Team photo references found' : 'No team photo content detected',
    points: hasTeamPhotos ? 25 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Sufficient image count',
    status: totalImages >= 15 ? 'pass' : totalImages >= 5 ? 'partial' : 'fail',
    details: `${totalImages} image(s) found across site`,
    points: totalImages >= 15 ? 20 : totalImages >= 5 ? 10 : 0,
    maxPoints: 20,
  });

  return buildCategoryScore(findings, recommendations, w, 'photoEvidence');
}

// ─── Content publisher category analyzers ───────────────────────────────────

function analyzeAuthorCredentials(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let hasPersonSchema = false;
  let hasBylines = 0;
  let hasAuthorPages = false;
  let hasSocialLinks = false;
  let hasCredentials = false;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const text = $('body').text();

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const str = $(el).text();
        if (/"Person"/i.test(str) || /author/i.test(str)) hasPersonSchema = true;
        if (/sameAs/i.test(str) && /twitter|linkedin|facebook|github/i.test(str)) hasSocialLinks = true;
      } catch {}
    });

    if (/by\s+[A-Z][a-z]+\s+[A-Z][a-z]+|author:\s*[A-Z]/i.test(text)) hasBylines++;
    if ($('[rel="author"], .author, .byline, [class*="author"]').length > 0) hasBylines++;
  }

  hasAuthorPages = ctx.allPages.some(p => /\/author\/|\/contributor\/|\/writer\/|\/team\//i.test(p.url));
  const allText = getAllText(ctx);
  hasCredentials = /phd|md|certified|years of experience|founder|editor|journalist|correspondent|senior writer|expert/i.test(allText);

  findings.push({
    check: 'Person schema for authors',
    status: hasPersonSchema ? 'pass' : 'fail',
    details: hasPersonSchema ? 'Person schema found' : 'No Person schema for authors',
    points: hasPersonSchema ? 20 : 0,
    maxPoints: 20,
  });
  if (!hasPersonSchema) recommendations.push('Add Person schema for article authors. AI assistants evaluate author credentials when assessing content trustworthiness and E-E-A-T signals.');

  findings.push({
    check: 'Bylines on articles',
    status: hasBylines >= 3 ? 'pass' : hasBylines >= 1 ? 'partial' : 'fail',
    details: `${hasBylines} page(s) with author bylines`,
    points: hasBylines >= 3 ? 20 : hasBylines >= 1 ? 10 : 0,
    maxPoints: 20,
  });

  findings.push({
    check: 'Author bio pages',
    status: hasAuthorPages ? 'pass' : 'fail',
    details: hasAuthorPages ? 'Author/contributor pages found' : 'No dedicated author pages',
    points: hasAuthorPages ? 20 : 0,
    maxPoints: 20,
  });

  findings.push({
    check: 'Author social profile links',
    status: hasSocialLinks ? 'pass' : 'fail',
    details: hasSocialLinks ? 'Social profile links in author schema' : 'No author social profiles linked',
    points: hasSocialLinks ? 20 : 0,
    maxPoints: 20,
  });

  findings.push({
    check: 'Author credentials/expertise',
    status: hasCredentials ? 'pass' : 'fail',
    details: hasCredentials ? 'Author credential language found' : 'No author credentials or expertise mentioned',
    points: hasCredentials ? 20 : 0,
    maxPoints: 20,
  });

  return buildCategoryScore(findings, recommendations, w, 'authorCredentials');
}

function analyzeContentTaxonomy(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  const categoryPages = ctx.allPages.filter(p => /\/category\/|\/topic\/|\/tag\/|\/section\//i.test(p.url));
  findings.push({
    check: 'Category/tag URL structure',
    status: categoryPages.length >= 3 ? 'pass' : categoryPages.length >= 1 ? 'partial' : 'fail',
    details: `${categoryPages.length} category/tag page(s) found`,
    points: categoryPages.length >= 3 ? 25 : categoryPages.length >= 1 ? 12 : 0,
    maxPoints: 25,
  });
  if (categoryPages.length === 0) recommendations.push('Organize content with clear category/tag pages. AI assistants use content taxonomy to understand topic coverage and expertise areas.');

  let hasBreadcrumbSchema = false;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        if (/BreadcrumbList/i.test($(el).text())) hasBreadcrumbSchema = true;
      } catch {}
    });
  }
  findings.push({
    check: 'BreadcrumbList schema',
    status: hasBreadcrumbSchema ? 'pass' : 'fail',
    details: hasBreadcrumbSchema ? 'BreadcrumbList schema found' : 'No BreadcrumbList schema',
    points: hasBreadcrumbSchema ? 25 : 0,
    maxPoints: 25,
  });

  let topicClusters = 0;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const relatedLinks = $('a').filter((_, el) => /related|similar|more on|also read|see also/i.test($(el).text() || $(el).parent().text())).length;
    if (relatedLinks >= 2) topicClusters++;
  }
  findings.push({
    check: 'Topic cluster internal linking',
    status: topicClusters >= 3 ? 'pass' : topicClusters >= 1 ? 'partial' : 'fail',
    details: `${topicClusters} page(s) with related content links`,
    points: topicClusters >= 3 ? 25 : topicClusters >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  let hasTagCloud = false;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    if ($('.tags, .tag-cloud, [class*="tag-list"], [class*="category-list"]').length > 0) hasTagCloud = true;
  }
  findings.push({
    check: 'Tag/category navigation',
    status: hasTagCloud ? 'pass' : 'fail',
    details: hasTagCloud ? 'Tag or category navigation found' : 'No tag/category navigation detected',
    points: hasTagCloud ? 25 : 0,
    maxPoints: 25,
  });

  return buildCategoryScore(findings, recommendations, w, 'contentTaxonomy');
}

function analyzePublishingCadence(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  const dates: Date[] = [];
  let hasDatePublished = 0;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).text());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item.datePublished) {
            const d = new Date(item.datePublished);
            if (!isNaN(d.getTime())) {
              dates.push(d);
              hasDatePublished++;
            }
          }
        }
      } catch {}
    });

    $('time[datetime], [class*="date"], [class*="publish"]').each((_, el) => {
      const dt = $(el).attr('datetime') || $(el).text();
      const d = new Date(dt);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) dates.push(d);
    });
  }

  findings.push({
    check: 'datePublished in structured data',
    status: hasDatePublished >= 3 ? 'pass' : hasDatePublished >= 1 ? 'partial' : 'fail',
    details: `${hasDatePublished} article(s) with datePublished`,
    points: hasDatePublished >= 3 ? 25 : hasDatePublished >= 1 ? 12 : 0,
    maxPoints: 25,
  });
  if (hasDatePublished === 0) recommendations.push('Add datePublished to article schema. AI assistants heavily weight content recency when selecting sources to cite.');

  const now = new Date();
  const thisYear = now.getFullYear();
  const currentYearContent = dates.filter(d => d.getFullYear() === thisYear).length;
  findings.push({
    check: 'Content from current year',
    status: currentYearContent >= 3 ? 'pass' : currentYearContent >= 1 ? 'partial' : 'fail',
    details: `${currentYearContent} article(s) from ${thisYear}`,
    points: currentYearContent >= 3 ? 25 : currentYearContent >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  const recentMonths = new Set<string>();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  dates.filter(d => d >= sixMonthsAgo).forEach(d => recentMonths.add(`${d.getFullYear()}-${d.getMonth()}`));
  findings.push({
    check: 'Consistent publishing frequency',
    status: recentMonths.size >= 4 ? 'pass' : recentMonths.size >= 2 ? 'partial' : 'fail',
    details: `Content published across ${recentMonths.size} month(s) in last 6 months`,
    points: recentMonths.size >= 4 ? 25 : recentMonths.size >= 2 ? 12 : 0,
    maxPoints: 25,
  });

  const dateSpread = dates.length >= 2 ? (Math.max(...dates.map(d => d.getTime())) - Math.min(...dates.map(d => d.getTime()))) / (1000 * 60 * 60 * 24) : 0;
  findings.push({
    check: 'Long-term content archive',
    status: dateSpread >= 365 ? 'pass' : dateSpread >= 90 ? 'partial' : 'fail',
    details: dateSpread > 0 ? `Content spans ${Math.round(dateSpread)} days` : 'Unable to determine content date range',
    points: dateSpread >= 365 ? 25 : dateSpread >= 90 ? 12 : 0,
    maxPoints: 25,
  });

  return buildCategoryScore(findings, recommendations, w, 'publishingCadence');
}

function analyzeSyndicationReadiness(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let hasRssFeed = false;
  let hasCompleteOgTags = 0;
  let hasExcerpts = false;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);

    if ($('link[type="application/rss+xml"], link[type="application/atom+xml"]').length > 0) hasRssFeed = true;

    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogDesc = $('meta[property="og:description"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogTitle && ogDesc && ogImage) hasCompleteOgTags++;

    if ($('meta[name="description"]').attr('content') || $('[class*="excerpt"], [class*="summary"]').length > 0) {
      hasExcerpts = true;
    }
  }

  findings.push({
    check: 'RSS/Atom feed present',
    status: hasRssFeed ? 'pass' : 'fail',
    details: hasRssFeed ? 'RSS/Atom feed found' : 'No RSS/Atom feed detected',
    points: hasRssFeed ? 30 : 0,
    maxPoints: 30,
  });
  if (!hasRssFeed) recommendations.push('Add an RSS or Atom feed. Feeds enable AI content aggregation systems and news AI assistants to discover and index your content automatically.');

  const ogRatio = ctx.allPages.length > 0 ? hasCompleteOgTags / ctx.allPages.length : 0;
  findings.push({
    check: 'Complete OpenGraph tags on articles',
    status: ogRatio >= 0.7 ? 'pass' : ogRatio >= 0.3 ? 'partial' : 'fail',
    details: `${Math.round(ogRatio * 100)}% of pages have complete OG tags (title, description, image)`,
    points: ogRatio >= 0.7 ? 30 : ogRatio >= 0.3 ? 15 : 0,
    maxPoints: 30,
  });

  findings.push({
    check: 'Clean excerpt generation',
    status: hasExcerpts ? 'pass' : 'fail',
    details: hasExcerpts ? 'Excerpt/summary content found' : 'No excerpts or summaries detected',
    points: hasExcerpts ? 20 : 0,
    maxPoints: 20,
  });

  let hasTwitterCards = false;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    if ($('meta[name="twitter:card"], meta[property="twitter:card"]').length > 0) hasTwitterCards = true;
  }
  findings.push({
    check: 'Twitter Card meta tags',
    status: hasTwitterCards ? 'pass' : 'fail',
    details: hasTwitterCards ? 'Twitter Card tags found' : 'No Twitter Card tags',
    points: hasTwitterCards ? 20 : 0,
    maxPoints: 20,
  });

  return buildCategoryScore(findings, recommendations, w, 'syndicationReadiness');
}

function analyzeOriginalReporting(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let firstPersonCount = 0;
  let proprietaryDataCount = 0;
  let originalQuotesCount = 0;
  let analysisPatterns = 0;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const mainContent = $('main, article, [role="main"], .content, .post-content').first();
    const text = (mainContent.length ? mainContent : $('body')).text();

    if (/\bwe found\b|\bwe discovered\b|\bwe tested\b|\bour experience\b|\bwe reviewed\b|\bwe analyzed\b|\bI tried\b|\bI tested\b|\bmy experience\b/i.test(text)) firstPersonCount++;
    if (/our data|our research|our analysis|our survey|our study|proprietary|exclusive data/i.test(text)) proprietaryDataCount++;
    if (/["""].*["""],?\s*(said|says|told|explains|according to)\s/i.test(text) || /according to \w+ \w+/i.test(text)) originalQuotesCount++;
    if (/our research shows|our analysis reveals|we concluded|the data suggests|based on our/i.test(text)) analysisPatterns++;
  }

  findings.push({
    check: 'First-person experience signals',
    status: firstPersonCount >= 3 ? 'pass' : firstPersonCount >= 1 ? 'partial' : 'fail',
    details: `${firstPersonCount} page(s) with first-person experience language`,
    points: firstPersonCount >= 3 ? 25 : firstPersonCount >= 1 ? 12 : 0,
    maxPoints: 25,
  });
  if (firstPersonCount === 0) recommendations.push('Include first-person experience language in articles ("we tested", "our experience"). AI assistants prioritize first-hand experience as an E-E-A-T signal.');

  findings.push({
    check: 'Proprietary data/research',
    status: proprietaryDataCount >= 2 ? 'pass' : proprietaryDataCount >= 1 ? 'partial' : 'fail',
    details: `${proprietaryDataCount} page(s) with original research signals`,
    points: proprietaryDataCount >= 2 ? 25 : proprietaryDataCount >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Original quotes',
    status: originalQuotesCount >= 2 ? 'pass' : originalQuotesCount >= 1 ? 'partial' : 'fail',
    details: `${originalQuotesCount} page(s) with original quotes`,
    points: originalQuotesCount >= 2 ? 25 : originalQuotesCount >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Original analysis patterns',
    status: analysisPatterns >= 2 ? 'pass' : analysisPatterns >= 1 ? 'partial' : 'fail',
    details: `${analysisPatterns} page(s) with analysis/conclusion language`,
    points: analysisPatterns >= 2 ? 25 : analysisPatterns >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  return buildCategoryScore(findings, recommendations, w, 'originalReporting');
}

function analyzeSourceCitation(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let externalLinks = 0;
  let accordingToPatterns = 0;
  let footnotes = 0;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const mainContent = $('main, article, [role="main"], .content').first();
    const container = mainContent.length ? mainContent : $('body');
    const text = container.text();

    container.find('a[href^="http"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      try {
        const linkHost = new URL(href).hostname;
        const siteHost = new URL(ctx.origin).hostname;
        if (linkHost !== siteHost) externalLinks++;
      } catch {}
    });

    const accordingMatches = text.match(/according to|as reported by|study by|research from|data from|published in/gi) || [];
    accordingToPatterns += accordingMatches.length;

    if ($('.footnotes, .references, [class*="footnote"], [class*="source"], sup a[href^="#"]').length > 0) footnotes++;
  }

  findings.push({
    check: 'External reference links',
    status: externalLinks >= 10 ? 'pass' : externalLinks >= 3 ? 'partial' : 'fail',
    details: `${externalLinks} external link(s) found in content`,
    points: externalLinks >= 10 ? 25 : externalLinks >= 3 ? 12 : 0,
    maxPoints: 25,
  });
  if (externalLinks < 3) recommendations.push('Add external reference links to credible sources in articles. AI assistants evaluate source citations as a key authority signal.');

  findings.push({
    check: '"According to" attribution patterns',
    status: accordingToPatterns >= 5 ? 'pass' : accordingToPatterns >= 2 ? 'partial' : 'fail',
    details: `${accordingToPatterns} attribution pattern(s) found`,
    points: accordingToPatterns >= 5 ? 25 : accordingToPatterns >= 2 ? 12 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Footnotes or references sections',
    status: footnotes >= 2 ? 'pass' : footnotes >= 1 ? 'partial' : 'fail',
    details: `${footnotes} page(s) with footnote/reference sections`,
    points: footnotes >= 2 ? 25 : footnotes >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  const allText = getAllText(ctx);
  const hasMethodology = /methodology|how we|our process|our approach|how we rate|how we score|editorial process|fact.check/i.test(allText);
  findings.push({
    check: 'Methodology disclosure',
    status: hasMethodology ? 'pass' : 'fail',
    details: hasMethodology ? 'Methodology or editorial process found' : 'No methodology disclosure detected',
    points: hasMethodology ? 25 : 0,
    maxPoints: 25,
  });

  return buildCategoryScore(findings, recommendations, w, 'sourceCitation');
}

function analyzeArchiveDiscoverability(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  const archivePages = ctx.allPages.filter(p => /\/archive|\/all-posts|\/all-articles|\/sitemap|\/index/i.test(p.url));
  findings.push({
    check: 'Archive/index pages',
    status: archivePages.length >= 1 ? 'pass' : 'fail',
    details: archivePages.length > 0 ? `${archivePages.length} archive/index page(s) found` : 'No archive or index pages',
    points: archivePages.length >= 1 ? 25 : 0,
    maxPoints: 25,
  });

  let hasSearch = false;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    if ($('input[type="search"], [role="search"], .search, #search, form[action*="search"]').length > 0) hasSearch = true;
  }
  findings.push({
    check: 'Search functionality',
    status: hasSearch ? 'pass' : 'fail',
    details: hasSearch ? 'Search functionality found' : 'No search functionality detected',
    points: hasSearch ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasSearch) recommendations.push('Add site search functionality. AI assistants and users both benefit from being able to find specific content within a large archive.');

  let relatedPostsCount = 0;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    if ($('[class*="related"], [class*="recommended"], [class*="more-posts"], [class*="also-like"]').length > 0) relatedPostsCount++;
  }
  findings.push({
    check: 'Related posts/recommended content',
    status: relatedPostsCount >= 2 ? 'pass' : relatedPostsCount >= 1 ? 'partial' : 'fail',
    details: `${relatedPostsCount} page(s) with related content sections`,
    points: relatedPostsCount >= 2 ? 25 : relatedPostsCount >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  let hasPagination = false;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    if ($('[class*="pagination"], [class*="pager"], a[rel="next"], a[rel="prev"], .page-numbers').length > 0) hasPagination = true;
  }
  findings.push({
    check: 'Pagination/previous-next navigation',
    status: hasPagination ? 'pass' : 'fail',
    details: hasPagination ? 'Pagination found' : 'No pagination detected',
    points: hasPagination ? 25 : 0,
    maxPoints: 25,
  });

  return buildCategoryScore(findings, recommendations, w, 'archiveDiscoverability');
}

function analyzeMultimediaIntegration(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let imagesWithAlt = 0;
  let totalContentImages = 0;
  let hasVideo = false;
  let hasInfographics = false;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const mainContent = $('main, article, [role="main"], .content').first();
    const container = mainContent.length ? mainContent : $('body');

    container.find('img').each((_, el) => {
      totalContentImages++;
      const alt = $(el).attr('alt') || '';
      if (alt.length >= 5) imagesWithAlt++;
    });

    if (container.find('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"], [class*="video"]').length > 0) hasVideo = true;
    if (/infographic|data visualization|chart|diagram/i.test(container.text())) hasInfographics = true;
  }

  const altRatio = totalContentImages > 0 ? imagesWithAlt / totalContentImages : 0;
  findings.push({
    check: 'Article images with alt text',
    status: altRatio >= 0.7 ? 'pass' : altRatio >= 0.4 ? 'partial' : 'fail',
    details: totalContentImages === 0 ? 'No content images found' : `${Math.round(altRatio * 100)}% of images have descriptive alt text`,
    points: altRatio >= 0.7 ? 25 : altRatio >= 0.4 ? 12 : 0,
    maxPoints: 25,
  });
  if (altRatio < 0.7) recommendations.push('Add descriptive alt text to all article images. AI assistants use alt text to understand and reference visual content.');

  findings.push({
    check: 'Embedded video content',
    status: hasVideo ? 'pass' : 'fail',
    details: hasVideo ? 'Video content found' : 'No embedded video detected',
    points: hasVideo ? 25 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Infographics/data visualizations',
    status: hasInfographics ? 'pass' : 'fail',
    details: hasInfographics ? 'Infographic/visualization references found' : 'No infographics or data visualizations detected',
    points: hasInfographics ? 25 : 0,
    maxPoints: 25,
  });

  const avgImages = ctx.allPages.length > 0 ? totalContentImages / ctx.allPages.length : 0;
  findings.push({
    check: 'Image density per article',
    status: avgImages >= 2 ? 'pass' : avgImages >= 1 ? 'partial' : 'fail',
    details: `Average ${Math.round(avgImages * 10) / 10} image(s) per page`,
    points: avgImages >= 2 ? 25 : avgImages >= 1 ? 12 : 0,
    maxPoints: 25,
  });

  return buildCategoryScore(findings, recommendations, w, 'multimediaIntegration');
}

function analyzeNewsletterPresence(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let hasSignupForm = false;
  let hasNewsletterArchive = false;
  let hasSubscriberProof = false;

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const text = $('body').text();

    if ($('input[type="email"], form[action*="subscribe"], form[action*="newsletter"], form[action*="mailchimp"], form[action*="convertkit"]').length > 0) {
      hasSignupForm = true;
    }
    if (/subscribe|sign up|newsletter|join.*list|get.*inbox/i.test(text) && $('input, form').length > 0) {
      hasSignupForm = true;
    }

    if (/newsletter archive|past issues|previous newsletters|newsletter history/i.test(text)) hasNewsletterArchive = true;
    if (/\d[\d,]*\s*subscribers?|\d[\d,]*\s*readers?|join\s+\d[\d,]*/i.test(text)) hasSubscriberProof = true;
  }

  const newsletterPages = ctx.allPages.filter(p => /\/newsletter|\/subscribe|\/email/i.test(p.url));

  findings.push({
    check: 'Email signup form',
    status: hasSignupForm ? 'pass' : 'fail',
    details: hasSignupForm ? 'Newsletter signup form found' : 'No email signup form detected',
    points: hasSignupForm ? 30 : 0,
    maxPoints: 30,
  });
  if (!hasSignupForm) recommendations.push('Add an email newsletter signup form. Newsletter presence signals audience engagement and content value to AI ranking systems.');

  findings.push({
    check: 'Dedicated newsletter page',
    status: newsletterPages.length >= 1 ? 'pass' : 'fail',
    details: newsletterPages.length > 0 ? 'Newsletter page found' : 'No dedicated newsletter page',
    points: newsletterPages.length >= 1 ? 25 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Newsletter archive',
    status: hasNewsletterArchive ? 'pass' : 'fail',
    details: hasNewsletterArchive ? 'Newsletter archive found' : 'No newsletter archive detected',
    points: hasNewsletterArchive ? 25 : 0,
    maxPoints: 25,
  });

  findings.push({
    check: 'Subscriber social proof',
    status: hasSubscriberProof ? 'pass' : 'fail',
    details: hasSubscriberProof ? 'Subscriber count/social proof found' : 'No subscriber count displayed',
    points: hasSubscriberProof ? 20 : 0,
    maxPoints: 20,
  });

  return buildCategoryScore(findings, recommendations, w, 'newsletterPresence');
}

// ─── General site category analyzers ────────────────────────────────────────

function analyzeDocumentationStructureGeneral(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  const docPages = ctx.allPages.filter(p => /\/docs|\/documentation|\/guide|\/reference|\/help|\/faq|\/about/i.test(p.url));
  findings.push({
    check: 'Information pages exist',
    status: docPages.length >= 2 ? 'pass' : docPages.length >= 1 ? 'partial' : 'fail',
    details: `${docPages.length} informational page(s) found`,
    points: docPages.length >= 2 ? 20 : docPages.length >= 1 ? 10 : 0,
    maxPoints: 20,
  });
  if (docPages.length === 0) recommendations.push('Create informational pages (about, FAQ, guides) to help AI assistants understand what your site offers.');

  let consistentHeadings = 0;
  const pagesToCheck = ctx.allPages.slice(0, 10);
  for (const page of pagesToCheck) {
    const $ = cheerio.load(page.html);
    const h1Count = $('h1').length;
    const h2Count = $('h2').length;
    if (h1Count === 1 && h2Count >= 2) consistentHeadings++;
  }
  const headingRatio = pagesToCheck.length > 0 ? consistentHeadings / pagesToCheck.length : 0;
  findings.push({
    check: 'Consistent heading hierarchy',
    status: headingRatio >= 0.8 ? 'pass' : headingRatio >= 0.5 ? 'partial' : 'fail',
    details: `${Math.round(headingRatio * 100)}% of pages have consistent heading structure`,
    points: headingRatio >= 0.8 ? 20 : headingRatio >= 0.5 ? 10 : 0,
    maxPoints: 20,
  });
  if (headingRatio < 0.8) recommendations.push('Use consistent heading hierarchy (single H1, multiple H2s) across all pages. LLMs build understanding from headings.');

  const hasNavigation = ctx.allPages.some(p => {
    const $ = cheerio.load(p.html);
    return $('nav, aside, .sidebar, .toc, [role="navigation"]').find('a').length > 5;
  });
  findings.push({
    check: 'Navigation structure',
    status: hasNavigation ? 'pass' : 'fail',
    details: hasNavigation ? 'Navigation structure detected' : 'No navigation structure found',
    points: hasNavigation ? 20 : 0,
    maxPoints: 20,
  });

  const cleanUrls = ctx.allPages.filter(p => {
    try {
      const path = new URL(p.url).pathname;
      return /^\/[\w\-\/]*$/.test(path) && path.length < 100;
    } catch { return false; }
  });
  const cleanUrlRatio = ctx.allPages.length > 0 ? cleanUrls.length / ctx.allPages.length : 0;
  findings.push({
    check: 'Clean URL structure',
    status: cleanUrlRatio >= 0.8 ? 'pass' : cleanUrlRatio >= 0.5 ? 'partial' : 'fail',
    details: `${Math.round(cleanUrlRatio * 100)}% of pages have clean URL structure`,
    points: cleanUrlRatio >= 0.8 ? 20 : cleanUrlRatio >= 0.5 ? 10 : 0,
    maxPoints: 20,
  });

  const hasSearch = ctx.allPages.some(p => {
    const $ = cheerio.load(p.html);
    return $('input[type="search"], [role="search"], .search, #search').length > 0;
  });
  findings.push({
    check: 'Search functionality',
    status: hasSearch ? 'pass' : 'fail',
    details: hasSearch ? 'Search functionality detected' : 'No search functionality found',
    points: hasSearch ? 20 : 0,
    maxPoints: 20,
  });

  return buildCategoryScore(findings, recommendations, w, 'documentationStructure');
}

function analyzeContentQuality(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  let pagesWithGoodContent = 0;
  let totalWordCount = 0;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const mainContent = $('main, article, [role="main"], .content').first();
    const text = (mainContent.length ? mainContent : $('body')).text().replace(/\s+/g, ' ').trim();
    const words = text.split(/\s+/).length;
    totalWordCount += words;
    if (words >= 300) pagesWithGoodContent++;
  }
  const avgWords = ctx.allPages.length > 0 ? Math.round(totalWordCount / ctx.allPages.length) : 0;

  findings.push({
    check: 'Content depth (word count)',
    status: avgWords >= 500 ? 'pass' : avgWords >= 200 ? 'partial' : 'fail',
    details: `Average ${avgWords} words per page`,
    points: avgWords >= 500 ? 20 : avgWords >= 200 ? 10 : 0,
    maxPoints: 20,
  });
  if (avgWords < 300) recommendations.push('Add more substantive content to pages. AI assistants prefer citing pages with comprehensive, detailed content.');

  findings.push({
    check: 'Pages with substantive content (300+ words)',
    status: pagesWithGoodContent >= 5 ? 'pass' : pagesWithGoodContent >= 2 ? 'partial' : 'fail',
    details: `${pagesWithGoodContent} page(s) with 300+ words of content`,
    points: pagesWithGoodContent >= 5 ? 20 : pagesWithGoodContent >= 2 ? 10 : 0,
    maxPoints: 20,
  });

  let hasStructuredContent = 0;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const hasLists = $('ul li, ol li').length >= 3;
    const hasHeadings = $('h2, h3').length >= 2;
    if (hasLists && hasHeadings) hasStructuredContent++;
  }
  findings.push({
    check: 'Structured content (headings + lists)',
    status: hasStructuredContent >= 3 ? 'pass' : hasStructuredContent >= 1 ? 'partial' : 'fail',
    details: `${hasStructuredContent} page(s) with well-structured content`,
    points: hasStructuredContent >= 3 ? 20 : hasStructuredContent >= 1 ? 10 : 0,
    maxPoints: 20,
  });

  let hasSchema = 0;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    if ($('script[type="application/ld+json"]').length > 0) hasSchema++;
  }
  findings.push({
    check: 'Structured data present',
    status: hasSchema >= 3 ? 'pass' : hasSchema >= 1 ? 'partial' : 'fail',
    details: `${hasSchema} page(s) with JSON-LD structured data`,
    points: hasSchema >= 3 ? 20 : hasSchema >= 1 ? 10 : 0,
    maxPoints: 20,
  });

  let metaDescriptions = 0;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    const desc = $('meta[name="description"]').attr('content') || '';
    if (desc.length >= 50) metaDescriptions++;
  }
  const metaRatio = ctx.allPages.length > 0 ? metaDescriptions / ctx.allPages.length : 0;
  findings.push({
    check: 'Meta descriptions quality',
    status: metaRatio >= 0.8 ? 'pass' : metaRatio >= 0.5 ? 'partial' : 'fail',
    details: `${Math.round(metaRatio * 100)}% of pages have quality meta descriptions`,
    points: metaRatio >= 0.8 ? 20 : metaRatio >= 0.5 ? 10 : 0,
    maxPoints: 20,
  });

  return buildCategoryScore(findings, recommendations, w, 'contentQuality');
}

function analyzeTrustSignalsGeneral(ctx: SiteContext, w: Record<string, number>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];
  const allText = getAllText(ctx);

  const hasAboutPage = ctx.allPages.some(p => /\/about/i.test(p.url));
  findings.push({
    check: 'About page exists',
    status: hasAboutPage ? 'pass' : 'fail',
    details: hasAboutPage ? 'About page found' : 'No about page detected',
    points: hasAboutPage ? 20 : 0,
    maxPoints: 20,
  });
  if (!hasAboutPage) recommendations.push('Create an about page with substantive information about your organization. AI assistants use this for E-E-A-T evaluation.');

  const hasPrivacy = ctx.allPages.some(p => /\/privacy/i.test(p.url)) || /privacy policy/i.test(allText);
  const hasTerms = ctx.allPages.some(p => /\/terms/i.test(p.url)) || /terms of service|terms of use|terms and conditions/i.test(allText);
  findings.push({
    check: 'Privacy policy and terms',
    status: hasPrivacy && hasTerms ? 'pass' : hasPrivacy || hasTerms ? 'partial' : 'fail',
    details: `Privacy: ${hasPrivacy ? 'found' : 'missing'}, Terms: ${hasTerms ? 'found' : 'missing'}`,
    points: hasPrivacy && hasTerms ? 20 : hasPrivacy || hasTerms ? 10 : 0,
    maxPoints: 20,
  });

  const hasContactInfo = /contact us|phone|email|address|\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/i.test(allText);
  findings.push({
    check: 'Contact information visible',
    status: hasContactInfo ? 'pass' : 'fail',
    details: hasContactInfo ? 'Contact information found' : 'No contact information detected',
    points: hasContactInfo ? 20 : 0,
    maxPoints: 20,
  });

  const hasSocialLinks = ctx.allPages.some(p => {
    const $ = cheerio.load(p.html);
    return $('a[href*="twitter.com"], a[href*="x.com"], a[href*="linkedin.com"], a[href*="facebook.com"], a[href*="github.com"], a[href*="instagram.com"]').length >= 2;
  });
  findings.push({
    check: 'Social media presence',
    status: hasSocialLinks ? 'pass' : 'fail',
    details: hasSocialLinks ? 'Social media links found' : 'No social media links detected',
    points: hasSocialLinks ? 20 : 0,
    maxPoints: 20,
  });

  const hasTrustIndicators = /certified|accredited|award|established|founded|since \d{4}|trusted by|used by/i.test(allText);
  findings.push({
    check: 'Trust indicators (certifications, history)',
    status: hasTrustIndicators ? 'pass' : 'fail',
    details: hasTrustIndicators ? 'Trust indicators found' : 'No trust indicators detected',
    points: hasTrustIndicators ? 20 : 0,
    maxPoints: 20,
  });

  return buildCategoryScore(findings, recommendations, w, 'trustSignals');
}
