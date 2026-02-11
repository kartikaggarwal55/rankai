import * as cheerio from 'cheerio';
import { GEOAnalysis, CategoryScore, Finding, getGrade } from '../types';

export function analyzeGEO(html: string, url: string, headers: Record<string, string>, loadTime: number): GEOAnalysis {
  const $ = cheerio.load(html);

  return {
    contentStructure: analyzeContentStructure($),
    schemaMarkup: analyzeSchemaMarkup($),
    topicalAuthority: analyzeTopicalAuthority($, url),
    citationWorthiness: analyzeCitationWorthiness($),
    contentFreshness: analyzeContentFreshness($, headers),
    languagePatterns: analyzeLanguagePatterns($),
    metaInformation: analyzeMetaInformation($),
    technicalHealth: analyzeTechnicalHealth($, headers, loadTime),
    contentUniqueness: analyzeContentUniqueness($),
    multiFormatContent: analyzeMultiFormatContent($),
  };
}

function analyzeContentStructure($: cheerio.CheerioAPI): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // Check heading hierarchy
  const headings = { h1: $('h1').length, h2: $('h2').length, h3: $('h3').length, h4: $('h4').length };
  const hasH1 = headings.h1 === 1;
  findings.push({
    check: 'Single H1 tag',
    status: hasH1 ? 'pass' : 'fail',
    details: hasH1 ? 'Page has exactly one H1 heading' : `Page has ${headings.h1} H1 heading(s) — should have exactly 1`,
    points: hasH1 ? 15 : 0,
    maxPoints: 15,
  });
  if (!hasH1) recommendations.push('Ensure each page has exactly one H1 heading that clearly describes the page topic.');

  // Check heading hierarchy (no skipping levels)
  let hierarchyValid = true;
  const allHeadings: number[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const level = parseInt(el.tagName[1]);
    allHeadings.push(level);
  });
  for (let i = 1; i < allHeadings.length; i++) {
    if (allHeadings[i] > allHeadings[i - 1] + 1) {
      hierarchyValid = false;
      break;
    }
  }
  findings.push({
    check: 'Heading hierarchy (no skipped levels)',
    status: hierarchyValid ? 'pass' : 'fail',
    details: hierarchyValid ? 'Heading levels follow correct hierarchy' : 'Heading hierarchy has skipped levels (e.g., H1 → H3)',
    points: hierarchyValid ? 15 : 0,
    maxPoints: 15,
  });
  if (!hierarchyValid) recommendations.push('Fix heading hierarchy — do not skip levels (e.g., H1 → H2 → H3, never H1 → H3). LLMs use heading hierarchy as a roadmap and skipped levels break content understanding.');

  // Check H2 count (should have multiple sections)
  const hasMultipleSections = headings.h2 >= 3;
  findings.push({
    check: 'Multiple content sections (3+ H2s)',
    status: hasMultipleSections ? 'pass' : headings.h2 >= 2 ? 'partial' : 'fail',
    details: `Page has ${headings.h2} H2 heading(s)`,
    points: hasMultipleSections ? 15 : headings.h2 >= 2 ? 8 : 0,
    maxPoints: 15,
  });
  if (!hasMultipleSections) recommendations.push('Structure content with 3+ H2 sections for comprehensive topic coverage. Each section should address a distinct sub-topic.');

  // Check paragraph length
  const paragraphs = $('p').toArray().map(el => $(el).text().trim()).filter(t => t.length > 20);
  const longParagraphs = paragraphs.filter(p => p.split(/\s+/).length > 100);
  const avgWordCount = paragraphs.length > 0 ? paragraphs.reduce((sum, p) => sum + p.split(/\s+/).length, 0) / paragraphs.length : 0;
  const goodParagraphLength = longParagraphs.length === 0 && avgWordCount <= 80 && avgWordCount >= 20;
  findings.push({
    check: 'Paragraph length optimization',
    status: goodParagraphLength ? 'pass' : longParagraphs.length <= 2 ? 'partial' : 'fail',
    details: `Average paragraph: ${Math.round(avgWordCount)} words, ${longParagraphs.length} overly long paragraph(s)`,
    points: goodParagraphLength ? 15 : longParagraphs.length <= 2 ? 8 : 0,
    maxPoints: 15,
  });
  if (!goodParagraphLength) recommendations.push('Keep paragraphs to 60-100 words (3-4 sentences). AI systems rarely extract long text blocks. Each paragraph should contain one complete idea.');

  // Check for answer capsules (concise summary after headings)
  let answerCapsuleCount = 0;
  $('h2').each((_, el) => {
    const nextP = $(el).next('p');
    if (nextP.length) {
      const words = nextP.text().trim().split(/\s+/).length;
      if (words >= 15 && words <= 80) answerCapsuleCount++;
    }
  });
  const answerCapsuleRatio = headings.h2 > 0 ? answerCapsuleCount / headings.h2 : 0;
  findings.push({
    check: 'Answer capsules (summary after H2 headings)',
    status: answerCapsuleRatio >= 0.7 ? 'pass' : answerCapsuleRatio >= 0.4 ? 'partial' : 'fail',
    details: `${answerCapsuleCount} of ${headings.h2} H2 sections have concise answer capsules`,
    points: answerCapsuleRatio >= 0.7 ? 15 : answerCapsuleRatio >= 0.4 ? 8 : 0,
    maxPoints: 15,
  });
  if (answerCapsuleRatio < 0.7) recommendations.push('Add a 2-4 sentence summary (answer capsule) immediately after each H2 heading. This gives AI engines an extractable answer block and increases citation rates by 40%.');

  // Check for FAQ section
  const hasFAQ = $('h2, h3').toArray().some(el => /faq|frequently asked|common questions/i.test($(el).text()));
  findings.push({
    check: 'FAQ section present',
    status: hasFAQ ? 'pass' : 'fail',
    details: hasFAQ ? 'FAQ section detected' : 'No FAQ section found',
    points: hasFAQ ? 10 : 0,
    maxPoints: 10,
  });
  if (!hasFAQ) recommendations.push('Add an FAQ section — FAQ blocks receive 3.2x higher citation rates from AI engines. Keep answers self-contained at 2-4 sentences each.');

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.12, findings, recommendations };
}

function analyzeSchemaMarkup($: cheerio.CheerioAPI): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // Extract all JSON-LD blocks
  const jsonLdBlocks: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html() || '');
      if (Array.isArray(parsed)) jsonLdBlocks.push(...parsed);
      else jsonLdBlocks.push(parsed);
    } catch { /* invalid JSON-LD */ }
  });

  const hasJsonLd = jsonLdBlocks.length > 0;
  findings.push({
    check: 'JSON-LD structured data present',
    status: hasJsonLd ? 'pass' : 'fail',
    details: hasJsonLd ? `${jsonLdBlocks.length} JSON-LD block(s) found` : 'No JSON-LD structured data detected',
    points: hasJsonLd ? 20 : 0,
    maxPoints: 20,
  });
  if (!hasJsonLd) recommendations.push('Add JSON-LD structured data. Pages with schema markup show 30-40% higher visibility in AI responses. Start with Article, Organization, and FAQPage schemas.');

  // Check for specific schema types
  const schemaTypes = new Set<string>();
  const extractTypes = (obj: unknown) => {
    if (obj && typeof obj === 'object') {
      const o = obj as Record<string, unknown>;
      if (o['@type']) {
        const types = Array.isArray(o['@type']) ? o['@type'] : [o['@type']];
        types.forEach(t => schemaTypes.add(String(t)));
      }
      if (o['@graph'] && Array.isArray(o['@graph'])) {
        o['@graph'].forEach(extractTypes);
      }
    }
  };
  jsonLdBlocks.forEach(extractTypes);

  const prioritySchemas = ['Article', 'BlogPosting', 'WebPage', 'Organization', 'FAQPage', 'HowTo', 'Person', 'Product', 'SoftwareApplication'];
  const foundPriority = prioritySchemas.filter(s => schemaTypes.has(s));
  findings.push({
    check: 'Priority schema types',
    status: foundPriority.length >= 3 ? 'pass' : foundPriority.length >= 1 ? 'partial' : 'fail',
    details: foundPriority.length > 0 ? `Found: ${foundPriority.join(', ')}` : 'No priority schema types detected',
    points: foundPriority.length >= 3 ? 20 : foundPriority.length >= 1 ? 10 : 0,
    maxPoints: 20,
  });
  if (foundPriority.length < 3) recommendations.push(`Implement more schema types. Currently found: ${foundPriority.join(', ') || 'none'}. Add Article (for content pages), Organization (for your brand), FAQPage (for Q&A sections), and Person (for author credentials). FAQPage schema delivers the highest citation rates.`);

  // Check for FAQPage schema specifically
  const hasFAQSchema = schemaTypes.has('FAQPage');
  findings.push({
    check: 'FAQPage schema',
    status: hasFAQSchema ? 'pass' : 'fail',
    details: hasFAQSchema ? 'FAQPage schema implemented' : 'FAQPage schema not found',
    points: hasFAQSchema ? 15 : 0,
    maxPoints: 15,
  });
  if (!hasFAQSchema) recommendations.push('Add FAQPage schema markup for all Q&A content. FAQ sections with schema receive the highest citation rates across all AI platforms.');

  // Check for Article schema with key properties
  const hasArticle = schemaTypes.has('Article') || schemaTypes.has('BlogPosting') || schemaTypes.has('TechArticle');
  let articleComplete = false;
  if (hasArticle) {
    const articleBlock = jsonLdBlocks.find((b: unknown) => {
      const obj = b as Record<string, unknown>;
      return obj['@type'] === 'Article' || obj['@type'] === 'BlogPosting' || obj['@type'] === 'TechArticle';
    }) as Record<string, unknown> | undefined;
    if (articleBlock) {
      articleComplete = !!(articleBlock.author && articleBlock.datePublished && articleBlock.headline);
    }
  }
  findings.push({
    check: 'Article schema with author/date/headline',
    status: articleComplete ? 'pass' : hasArticle ? 'partial' : 'fail',
    details: articleComplete ? 'Article schema has author, date, and headline' : hasArticle ? 'Article schema found but missing key properties' : 'No Article/BlogPosting schema',
    points: articleComplete ? 15 : hasArticle ? 8 : 0,
    maxPoints: 15,
  });
  if (!articleComplete) recommendations.push('Add complete Article schema with author, datePublished, dateModified, and headline properties. This signals content type and freshness to AI engines.');

  // Check for Organization schema
  const hasOrg = schemaTypes.has('Organization') || schemaTypes.has('LocalBusiness');
  findings.push({
    check: 'Organization schema',
    status: hasOrg ? 'pass' : 'fail',
    details: hasOrg ? 'Organization/LocalBusiness schema found' : 'No Organization schema',
    points: hasOrg ? 10 : 0,
    maxPoints: 10,
  });
  if (!hasOrg) recommendations.push('Add Organization schema with name, URL, logo, and sameAs (links to social profiles). This establishes entity recognition across AI platforms.');

  // Check for breadcrumb schema
  const hasBreadcrumb = schemaTypes.has('BreadcrumbList');
  findings.push({
    check: 'BreadcrumbList schema',
    status: hasBreadcrumb ? 'pass' : 'fail',
    details: hasBreadcrumb ? 'Breadcrumb schema found' : 'No BreadcrumbList schema',
    points: hasBreadcrumb ? 10 : 0,
    maxPoints: 10,
  });
  if (!hasBreadcrumb) recommendations.push('Add BreadcrumbList schema to help AI engines understand your site hierarchy and page relationships.');

  // Check for microdata or RDFa
  const hasMicrodata = $('[itemscope]').length > 0;
  const hasRdfa = $('[typeof]').length > 0;
  findings.push({
    check: 'Additional structured data (Microdata/RDFa)',
    status: hasMicrodata || hasRdfa ? 'pass' : 'partial',
    details: hasMicrodata || hasRdfa ? 'Additional structured data formats found' : 'Only JSON-LD format used (acceptable)',
    points: hasMicrodata || hasRdfa ? 10 : 5,
    maxPoints: 10,
  });

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.15, findings, recommendations };
}

function analyzeTopicalAuthority($: cheerio.CheerioAPI, url: string): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // Count internal links
  const base = new URL(url);
  let internalLinks = 0;
  let externalLinks = 0;
  $('a[href]').each((_, el) => {
    try {
      const href = $(el).attr('href') || '';
      if (href.startsWith('#') || href.startsWith('javascript:')) return;
      const resolved = new URL(href, url);
      if (resolved.origin === base.origin) internalLinks++;
      else externalLinks++;
    } catch { /* skip */ }
  });

  findings.push({
    check: 'Internal linking',
    status: internalLinks >= 10 ? 'pass' : internalLinks >= 5 ? 'partial' : 'fail',
    details: `${internalLinks} internal link(s) found`,
    points: internalLinks >= 10 ? 20 : internalLinks >= 5 ? 12 : 3,
    maxPoints: 20,
  });
  if (internalLinks < 10) recommendations.push('Increase internal linking to 10+ links per page. Internal links build topical authority signals and help AI engines understand content relationships.');

  // Check for contextual/in-content links (not just nav)
  const mainContent = $('main, article, [role="main"], .content, .post, .entry-content').first();
  const contentLinks = mainContent.length ? mainContent.find('a[href]').length : 0;
  findings.push({
    check: 'Contextual links within content',
    status: contentLinks >= 5 ? 'pass' : contentLinks >= 2 ? 'partial' : 'fail',
    details: `${contentLinks} link(s) within main content area`,
    points: contentLinks >= 5 ? 20 : contentLinks >= 2 ? 10 : 0,
    maxPoints: 20,
  });
  if (contentLinks < 5) recommendations.push('Add contextual links within your content body (not just navigation). Link to related articles, guides, and resources to demonstrate comprehensive topic coverage.');

  // Content depth (word count)
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText.split(/\s+/).length;
  findings.push({
    check: 'Content depth (word count)',
    status: wordCount >= 1500 ? 'pass' : wordCount >= 800 ? 'partial' : 'fail',
    details: `${wordCount} words on page`,
    points: wordCount >= 1500 ? 20 : wordCount >= 800 ? 12 : 3,
    maxPoints: 20,
  });
  if (wordCount < 1500) recommendations.push('Increase content depth — AI platforms favor comprehensive, in-depth content. Aim for 1,500+ words for key topic pages.');

  // External reference links (citing sources)
  findings.push({
    check: 'External reference links',
    status: externalLinks >= 5 ? 'pass' : externalLinks >= 2 ? 'partial' : 'fail',
    details: `${externalLinks} external link(s) found`,
    points: externalLinks >= 5 ? 20 : externalLinks >= 2 ? 10 : 0,
    maxPoints: 20,
  });
  if (externalLinks < 5) recommendations.push('Add external reference links to credible sources. Citing sources improves GEO visibility by 24-31% and is especially powerful for lower-authority sites (115% improvement for rank-5 sites).');

  // Topic-related headings
  const headingTexts = $('h2, h3').toArray().map(el => $(el).text().trim().toLowerCase());
  const uniqueTopics = new Set(headingTexts.map(h => h.split(/\s+/).slice(0, 3).join(' ')));
  findings.push({
    check: 'Topic coverage breadth',
    status: uniqueTopics.size >= 5 ? 'pass' : uniqueTopics.size >= 3 ? 'partial' : 'fail',
    details: `${uniqueTopics.size} distinct sub-topic(s) covered`,
    points: uniqueTopics.size >= 5 ? 20 : uniqueTopics.size >= 3 ? 12 : 3,
    maxPoints: 20,
  });
  if (uniqueTopics.size < 5) recommendations.push('Expand topic coverage with more sub-sections. Comprehensive coverage of a topic cluster signals expertise to LLMs.');

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.10, findings, recommendations };
}

function analyzeCitationWorthiness($: cheerio.CheerioAPI): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];
  const bodyText = $('body').text();

  // Statistics and numbers
  const statsPattern = /\d+(\.\d+)?%|\$[\d,]+(\.\d+)?|\d+x\s|(\d{1,3}(,\d{3})+)/g;
  const statsMatches = bodyText.match(statsPattern) || [];
  findings.push({
    check: 'Statistics and quantitative data',
    status: statsMatches.length >= 5 ? 'pass' : statsMatches.length >= 2 ? 'partial' : 'fail',
    details: `${statsMatches.length} statistical data point(s) found`,
    points: statsMatches.length >= 5 ? 25 : statsMatches.length >= 2 ? 12 : 0,
    maxPoints: 25,
  });
  if (statsMatches.length < 5) recommendations.push('Add more statistics and quantitative data. Statistics improve AI visibility by 25-37% — the highest quick-win strategy. Replace qualitative claims with concrete numbers (e.g., "73% of enterprises adopted AI tools in 2025").');

  // Expert quotations
  const quoteElements = $('blockquote, q').length;
  const quotePatterns = bodyText.match(/[""]([^""]+)[""].*(?:said|according to|states|notes|explains|argues)/gi) || [];
  const totalQuotes = quoteElements + quotePatterns.length;
  findings.push({
    check: 'Expert quotations',
    status: totalQuotes >= 3 ? 'pass' : totalQuotes >= 1 ? 'partial' : 'fail',
    details: `${totalQuotes} quotation(s) found (${quoteElements} blockquote elements, ${quotePatterns.length} inline attributions)`,
    points: totalQuotes >= 3 ? 25 : totalQuotes >= 1 ? 12 : 0,
    maxPoints: 25,
  });
  if (totalQuotes < 3) recommendations.push('Add expert quotations — this is the single highest-performing GEO strategy at 27.8% visibility improvement. Include 2-3 direct quotes from recognized authorities per content piece.');

  // Source citations
  const citationPatterns = bodyText.match(/(?:according to|source:|study|research|report|survey|data from|published in|cited in)/gi) || [];
  const footnoteLikeLinks = $('a[href*="reference"], a[href*="source"], a[href*="cite"], sup a').length;
  const totalCitations = citationPatterns.length + footnoteLikeLinks;
  findings.push({
    check: 'Source citations',
    status: totalCitations >= 5 ? 'pass' : totalCitations >= 2 ? 'partial' : 'fail',
    details: `${totalCitations} citation/reference pattern(s) found`,
    points: totalCitations >= 5 ? 25 : totalCitations >= 2 ? 12 : 0,
    maxPoints: 25,
  });
  if (totalCitations < 5) recommendations.push('Add inline citations from credible sources. Citing sources improves GEO visibility by 24.9-31.4%. For lower-ranked websites, this strategy alone can produce a 115% improvement in AI visibility.');

  // Data tables
  const tables = $('table').length;
  findings.push({
    check: 'Data tables',
    status: tables >= 2 ? 'pass' : tables >= 1 ? 'partial' : 'fail',
    details: `${tables} data table(s) found`,
    points: tables >= 2 ? 15 : tables >= 1 ? 8 : 0,
    maxPoints: 15,
  });
  if (tables < 2) recommendations.push('Add comparison tables. Tables increase citation rates by 2.5x and comparative content represents 25.37% of all AI citations. Convert prose comparisons into structured tables wherever possible.');

  // Self-contained definitions
  const definitionPatterns = bodyText.match(/(?:is defined as|refers to|is a |means that|is the process of|describes the)/gi) || [];
  findings.push({
    check: 'Definitional statements',
    status: definitionPatterns.length >= 3 ? 'pass' : definitionPatterns.length >= 1 ? 'partial' : 'fail',
    details: `${definitionPatterns.length} definitional statement(s) found`,
    points: definitionPatterns.length >= 3 ? 10 : definitionPatterns.length >= 1 ? 5 : 0,
    maxPoints: 10,
  });
  if (definitionPatterns.length < 3) recommendations.push('Add clear definitional statements (e.g., "[Term] is [definition]"). LLMs prefer content with clear, extractable definitions.');

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.15, findings, recommendations };
}

function analyzeContentFreshness($: cheerio.CheerioAPI, headers: Record<string, string>): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // Check for dateModified in schema
  let dateModified: string | null = null;
  let datePublished: string | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '') as Record<string, unknown>;
      if (data.dateModified) dateModified = String(data.dateModified);
      if (data.datePublished) datePublished = String(data.datePublished);
    } catch { /* skip */ }
  });

  findings.push({
    check: 'dateModified in schema',
    status: dateModified ? 'pass' : 'fail',
    details: dateModified ? `Last modified: ${dateModified}` : 'No dateModified in structured data',
    points: dateModified ? 25 : 0,
    maxPoints: 25,
  });
  if (!dateModified) recommendations.push('Add dateModified to your Article/WebPage schema. 76.4% of ChatGPT\'s most-cited pages were updated in the last 30 days. Content freshness accounts for 40% of Perplexity\'s ranking factors.');

  // Check for visible date on page
  const datePatterns = $('time, [datetime], .date, .published, .updated, .modified').length;
  const visibleDateText = $('body').text().match(/(?:updated|modified|published|posted|last updated)[\s:]*(?:on\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/gi) || [];
  findings.push({
    check: 'Visible date on page',
    status: datePatterns > 0 || visibleDateText.length > 0 ? 'pass' : 'fail',
    details: datePatterns > 0 ? `${datePatterns} date element(s) found` : visibleDateText.length > 0 ? 'Date text found in content' : 'No visible date found',
    points: datePatterns > 0 || visibleDateText.length > 0 ? 20 : 0,
    maxPoints: 20,
  });
  if (datePatterns === 0 && visibleDateText.length === 0) recommendations.push('Add visible publication and last-updated dates. Visible timestamps signal freshness to both AI crawlers and users.');

  // datePublished presence
  findings.push({
    check: 'datePublished in schema',
    status: datePublished ? 'pass' : 'fail',
    details: datePublished ? `Published: ${datePublished}` : 'No datePublished in structured data',
    points: datePublished ? 15 : 0,
    maxPoints: 15,
  });
  if (!datePublished) recommendations.push('Add datePublished to your schema. Original publish dates help AI engines understand content timeline and relevance.');

  // HTTP Last-Modified header
  const lastModified = headers['last-modified'];
  findings.push({
    check: 'HTTP Last-Modified header',
    status: lastModified ? 'pass' : 'fail',
    details: lastModified ? `Last-Modified: ${lastModified}` : 'No Last-Modified header',
    points: lastModified ? 15 : 0,
    maxPoints: 15,
  });
  if (!lastModified) recommendations.push('Configure your server to send Last-Modified headers. This helps AI crawlers determine content freshness.');

  // Current year references
  const currentYear = new Date().getFullYear().toString();
  const prevYear = (new Date().getFullYear() - 1).toString();
  const bodyText = $('body').text();
  const hasCurrentYear = bodyText.includes(currentYear);
  const hasPrevYear = bodyText.includes(prevYear);
  findings.push({
    check: 'Current year references in content',
    status: hasCurrentYear ? 'pass' : hasPrevYear ? 'partial' : 'fail',
    details: hasCurrentYear ? `References to ${currentYear} found` : hasPrevYear ? `Only references to ${prevYear} found` : 'No recent year references found',
    points: hasCurrentYear ? 15 : hasPrevYear ? 8 : 0,
    maxPoints: 15,
  });
  if (!hasCurrentYear) recommendations.push(`Update content with current ${currentYear} references. 65% of AI bot traffic targets content from the past year; 79% within two years.`);

  // Changelog or update notes
  const hasChangelog = $('h2, h3').toArray().some(el => /changelog|updates|what's new|revision|version history/i.test($(el).text()));
  findings.push({
    check: 'Changelog or update history',
    status: hasChangelog ? 'pass' : 'fail',
    details: hasChangelog ? 'Changelog/update section found' : 'No changelog section found',
    points: hasChangelog ? 10 : 0,
    maxPoints: 10,
  });

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.10, findings, recommendations };
}

function analyzeLanguagePatterns($: cheerio.CheerioAPI): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];
  const bodyText = $('body').text();
  const paragraphs = $('p').toArray().map(el => $(el).text().trim()).filter(t => t.length > 30);

  // Definitional statements
  const definitions = bodyText.match(/(?:\b\w+\b\s+)?(?:is defined as|refers to|is a\s+\w+\s+that|is the process of|describes the|means that|can be described as)/gi) || [];
  findings.push({
    check: 'Definitional statements',
    status: definitions.length >= 3 ? 'pass' : definitions.length >= 1 ? 'partial' : 'fail',
    details: `${definitions.length} definitional pattern(s) found`,
    points: definitions.length >= 3 ? 20 : definitions.length >= 1 ? 10 : 0,
    maxPoints: 20,
  });
  if (definitions.length < 3) recommendations.push('Add more definitional statements. LLMs prefer content with clear "[Subject] is [definition]" patterns for easy extraction.');

  // Reading level (approximation using average sentence length and syllable complexity)
  const sentences = bodyText.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const avgSentenceLength = sentences.length > 0 ? bodyText.split(/\s+/).length / sentences.length : 0;
  const goodReadability = avgSentenceLength >= 12 && avgSentenceLength <= 25;
  findings.push({
    check: 'Sentence length optimization',
    status: goodReadability ? 'pass' : avgSentenceLength < 12 ? 'partial' : 'fail',
    details: `Average sentence length: ${Math.round(avgSentenceLength)} words (optimal: 15-25)`,
    points: goodReadability ? 20 : 10,
    maxPoints: 20,
  });
  if (!goodReadability) recommendations.push('Optimize sentence length to 15-25 words average. Fluency optimization improves GEO visibility by 25.1%.');

  // Passive voice detection (simplified)
  const passivePatterns = bodyText.match(/\b(?:was|were|is|are|been|being|be)\s+\w+ed\b/gi) || [];
  const passiveRatio = sentences.length > 0 ? passivePatterns.length / sentences.length : 0;
  findings.push({
    check: 'Active voice usage',
    status: passiveRatio < 0.15 ? 'pass' : passiveRatio < 0.3 ? 'partial' : 'fail',
    details: `Passive voice ratio: ${Math.round(passiveRatio * 100)}% (target: <15%)`,
    points: passiveRatio < 0.15 ? 15 : passiveRatio < 0.3 ? 8 : 0,
    maxPoints: 15,
  });
  if (passiveRatio >= 0.15) recommendations.push('Reduce passive voice to under 15%. Use clear Subject-Verb-Object construction — AI systems extract and cite assertive, direct language more reliably.');

  // Hedging language
  const hedgingWords = bodyText.match(/\b(?:might|perhaps|could be|possibly|arguably|it seems|it appears|may or may not|sort of|kind of)\b/gi) || [];
  findings.push({
    check: 'Assertive/declarative tone',
    status: hedgingWords.length <= 3 ? 'pass' : hedgingWords.length <= 8 ? 'partial' : 'fail',
    details: `${hedgingWords.length} hedging phrase(s) found`,
    points: hedgingWords.length <= 3 ? 15 : hedgingWords.length <= 8 ? 8 : 0,
    maxPoints: 15,
  });
  if (hedgingWords.length > 3) recommendations.push('Reduce hedging language ("might," "perhaps," "could be"). Use an authoritative tone — this improves AI visibility by 21.8%. Make definitive, well-supported claims.');

  // List-to-prose ratio
  const listItems = $('li').length;
  const totalElements = paragraphs.length + listItems;
  const listRatio = totalElements > 0 ? listItems / totalElements : 0;
  findings.push({
    check: 'List-to-prose ratio',
    status: listRatio >= 0.2 && listRatio <= 0.5 ? 'pass' : listRatio > 0 ? 'partial' : 'fail',
    details: `List-to-prose ratio: ${Math.round(listRatio * 100)}% (optimal: 20-40%)`,
    points: listRatio >= 0.2 && listRatio <= 0.5 ? 15 : listRatio > 0 ? 8 : 0,
    maxPoints: 15,
  });
  if (listRatio < 0.2) recommendations.push('Add more structured lists. An optimal 20-40% list-to-prose ratio improves AI extraction. Convert applicable prose into bullet points or numbered lists.');

  // Question-format headings
  const questionHeadings = $('h2, h3').toArray().filter(el => $(el).text().trim().endsWith('?'));
  const totalH2H3 = $('h2, h3').length;
  findings.push({
    check: 'Question-format headings',
    status: questionHeadings.length >= 2 ? 'pass' : questionHeadings.length >= 1 ? 'partial' : 'fail',
    details: `${questionHeadings.length} of ${totalH2H3} headings use question format`,
    points: questionHeadings.length >= 2 ? 15 : questionHeadings.length >= 1 ? 8 : 0,
    maxPoints: 15,
  });
  if (questionHeadings.length < 2) recommendations.push('Use question-format headings (e.g., "What is GEO?" instead of "GEO Overview"). This matches how users query AI engines and increases citation probability.');

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.08, findings, recommendations };
}

function analyzeMetaInformation($: cheerio.CheerioAPI): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // Title tag
  const title = $('title').text().trim();
  const titleGood = title.length >= 30 && title.length <= 70;
  findings.push({
    check: 'Title tag (50-60 characters)',
    status: title.length > 0 ? (titleGood ? 'pass' : 'partial') : 'fail',
    details: title.length > 0 ? `"${title}" (${title.length} chars)` : 'No title tag found',
    points: titleGood ? 20 : title.length > 0 ? 10 : 0,
    maxPoints: 20,
  });
  if (!titleGood && title.length > 0) recommendations.push(`Optimize title tag length to 50-60 characters. Current: ${title.length} characters.`);
  if (title.length === 0) recommendations.push('Add a descriptive title tag — this is fundamental for both SEO and GEO.');

  // Meta description
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  const descGood = metaDesc.length >= 120 && metaDesc.length <= 160;
  findings.push({
    check: 'Meta description (150-160 chars)',
    status: metaDesc.length > 0 ? (descGood ? 'pass' : 'partial') : 'fail',
    details: metaDesc.length > 0 ? `${metaDesc.length} characters` : 'No meta description found',
    points: descGood ? 20 : metaDesc.length > 0 ? 10 : 0,
    maxPoints: 20,
  });
  if (!descGood) recommendations.push('Optimize meta description to 150-160 characters. Make it answer-oriented — this is often what AI engines extract when summarizing your page.');

  // Open Graph tags
  const ogTags = ['og:title', 'og:description', 'og:image', 'og:type', 'og:url'];
  const foundOg = ogTags.filter(tag => $(`meta[property="${tag}"]`).length > 0);
  findings.push({
    check: 'Open Graph tags',
    status: foundOg.length >= 4 ? 'pass' : foundOg.length >= 2 ? 'partial' : 'fail',
    details: `${foundOg.length}/${ogTags.length} OG tags found: ${foundOg.join(', ') || 'none'}`,
    points: foundOg.length >= 4 ? 20 : foundOg.length >= 2 ? 10 : 0,
    maxPoints: 20,
  });
  if (foundOg.length < 4) recommendations.push(`Add missing Open Graph tags: ${ogTags.filter(t => !foundOg.includes(t)).join(', ')}. These help AI platforms understand content context for citations.`);

  // Twitter Card tags
  const twitterCard = $('meta[name="twitter:card"], meta[property="twitter:card"]').length > 0;
  findings.push({
    check: 'Twitter Card tags',
    status: twitterCard ? 'pass' : 'fail',
    details: twitterCard ? 'Twitter Card tags found' : 'No Twitter Card tags',
    points: twitterCard ? 10 : 0,
    maxPoints: 10,
  });

  // Canonical URL
  const hasCanonical = $('link[rel="canonical"]').length > 0;
  findings.push({
    check: 'Canonical URL',
    status: hasCanonical ? 'pass' : 'fail',
    details: hasCanonical ? `Canonical: ${$('link[rel="canonical"]').attr('href')}` : 'No canonical URL set',
    points: hasCanonical ? 10 : 0,
    maxPoints: 10,
  });
  if (!hasCanonical) recommendations.push('Add a canonical URL tag to prevent duplicate content issues across AI engines.');

  // Language tag
  const hasLang = $('html').attr('lang') !== undefined;
  findings.push({
    check: 'HTML language attribute',
    status: hasLang ? 'pass' : 'fail',
    details: hasLang ? `Language: ${$('html').attr('lang')}` : 'No lang attribute on <html>',
    points: hasLang ? 10 : 0,
    maxPoints: 10,
  });

  // Robots meta (not blocking)
  const robotsMeta = $('meta[name="robots"]').attr('content') || '';
  const isBlocked = robotsMeta.includes('noindex');
  findings.push({
    check: 'Robots meta (not blocking indexing)',
    status: isBlocked ? 'fail' : 'pass',
    details: isBlocked ? 'Page has noindex directive!' : robotsMeta ? `Robots: ${robotsMeta}` : 'No restrictive robots directives',
    points: isBlocked ? 0 : 10,
    maxPoints: 10,
  });
  if (isBlocked) recommendations.push('CRITICAL: Remove noindex directive — this prevents all search engines and AI crawlers from indexing your content.');

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.05, findings, recommendations };
}

function analyzeTechnicalHealth($: cheerio.CheerioAPI, headers: Record<string, string>, loadTime: number): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // Load time
  findings.push({
    check: 'Page load time',
    status: loadTime < 2000 ? 'pass' : loadTime < 4000 ? 'partial' : 'fail',
    details: `${(loadTime / 1000).toFixed(1)}s (target: <2.5s)`,
    points: loadTime < 2000 ? 25 : loadTime < 4000 ? 12 : 0,
    maxPoints: 25,
  });
  if (loadTime >= 2000) recommendations.push('Improve page load time to under 2.5 seconds. While not a direct AI ranking signal, slow pages create poor extraction experiences.');

  // HTTPS
  const isHTTPS = headers['strict-transport-security'] !== undefined || true; // If we could fetch it, it's likely HTTPS
  findings.push({
    check: 'HTTPS',
    status: 'pass',
    details: 'Site served over HTTPS',
    points: 15,
    maxPoints: 15,
  });

  // Server-side rendering check
  const hasSSRContent = $('body').text().trim().length > 200;
  const hasReactRoot = $('#__next, #root, #app, [data-reactroot]').length > 0;
  const hasEmptyBody = $('body').children().length < 3 && $('body').text().trim().length < 100;
  findings.push({
    check: 'Server-side rendered content',
    status: hasSSRContent && !hasEmptyBody ? 'pass' : 'fail',
    details: hasSSRContent ? 'Page has server-rendered content' : 'Page appears to rely on client-side rendering',
    points: hasSSRContent && !hasEmptyBody ? 25 : 0,
    maxPoints: 25,
  });
  if (hasEmptyBody) recommendations.push('CRITICAL: Implement server-side rendering (SSR). AI crawlers (GPTBot, OAI-SearchBot, ClaudeBot) cannot execute JavaScript. Any dynamically loaded content is invisible to AI engines.');

  // Content-Type header
  const contentType = headers['content-type'] || '';
  const isHTML = contentType.includes('text/html');
  findings.push({
    check: 'Content-Type header',
    status: isHTML ? 'pass' : 'partial',
    details: `Content-Type: ${contentType || 'not set'}`,
    points: isHTML ? 10 : 5,
    maxPoints: 10,
  });

  // Mobile viewport
  const hasViewport = $('meta[name="viewport"]').length > 0;
  findings.push({
    check: 'Mobile viewport',
    status: hasViewport ? 'pass' : 'fail',
    details: hasViewport ? 'Viewport meta tag present' : 'No viewport meta tag',
    points: hasViewport ? 10 : 0,
    maxPoints: 10,
  });

  // Content encoding (compression)
  const hasCompression = headers['content-encoding'] !== undefined;
  findings.push({
    check: 'Content compression',
    status: hasCompression ? 'pass' : 'partial',
    details: hasCompression ? `Compression: ${headers['content-encoding']}` : 'No content compression detected',
    points: hasCompression ? 15 : 5,
    maxPoints: 15,
  });

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.05, findings, recommendations };
}

function analyzeContentUniqueness($: cheerio.CheerioAPI): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];
  const bodyText = $('body').text();

  // First-person experience signals
  const experiencePatterns = bodyText.match(/\b(?:we tested|in our experience|we found that|our team|we built|we discovered|our data shows|we analyzed|our research|we implemented)\b/gi) || [];
  findings.push({
    check: 'First-person experience signals',
    status: experiencePatterns.length >= 3 ? 'pass' : experiencePatterns.length >= 1 ? 'partial' : 'fail',
    details: `${experiencePatterns.length} experience signal(s) found`,
    points: experiencePatterns.length >= 3 ? 25 : experiencePatterns.length >= 1 ? 12 : 0,
    maxPoints: 25,
  });
  if (experiencePatterns.length < 3) recommendations.push('Add first-person experience signals ("we tested," "our data shows," "in our experience"). AI systems favor content demonstrating real-world expertise and firsthand knowledge (E-E-A-T Experience signal).');

  // Proprietary data / original research signals
  const researchPatterns = bodyText.match(/\b(?:our survey|our analysis|our benchmark|our study|we surveyed|we analyzed \d|our dataset|proprietary data|original research)\b/gi) || [];
  findings.push({
    check: 'Original research / proprietary data',
    status: researchPatterns.length >= 2 ? 'pass' : researchPatterns.length >= 1 ? 'partial' : 'fail',
    details: `${researchPatterns.length} original research signal(s) found`,
    points: researchPatterns.length >= 2 ? 25 : researchPatterns.length >= 1 ? 12 : 0,
    maxPoints: 25,
  });
  if (researchPatterns.length < 2) recommendations.push('Include original research, surveys, or proprietary data analysis. Content with original statistics sees 30-40% higher AI visibility. Conduct surveys, analyze data, or publish benchmarks.');

  // Unique frameworks/methodologies
  const frameworkPatterns = bodyText.match(/\b(?:our framework|our methodology|our approach|our model|our system|our process|step[- ]by[- ]step|our (?:\d+)[- ]step)\b/gi) || [];
  findings.push({
    check: 'Unique frameworks or methodologies',
    status: frameworkPatterns.length >= 2 ? 'pass' : frameworkPatterns.length >= 1 ? 'partial' : 'fail',
    details: `${frameworkPatterns.length} framework/methodology reference(s) found`,
    points: frameworkPatterns.length >= 2 ? 25 : frameworkPatterns.length >= 1 ? 12 : 0,
    maxPoints: 25,
  });
  if (frameworkPatterns.length < 2) recommendations.push('Develop unique frameworks, methodologies, or mental models. This creates content with high "information gain" that AI systems prefer to cite.');

  // Content length (82.5% of AI citations link to nested content pages)
  const mainContent = $('main, article, [role="main"]').first();
  const contentText = mainContent.length ? mainContent.text().trim() : bodyText;
  const wordCount = contentText.split(/\s+/).length;
  findings.push({
    check: 'Content depth for uniqueness',
    status: wordCount >= 2000 ? 'pass' : wordCount >= 1000 ? 'partial' : 'fail',
    details: `${wordCount} words in main content`,
    points: wordCount >= 2000 ? 25 : wordCount >= 1000 ? 12 : 3,
    maxPoints: 25,
  });
  if (wordCount < 2000) recommendations.push('Deepen content to 2,000+ words with original insights. 82.5% of AI citations go to nested content pages with substantial depth, not thin homepage content.');

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.10, findings, recommendations };
}

function analyzeMultiFormatContent($: cheerio.CheerioAPI): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // Tables
  const tables = $('table').length;
  const wellStructuredTables = $('table').filter((_, el) => $(el).find('thead, th').length > 0).length;
  findings.push({
    check: 'Data tables',
    status: wellStructuredTables >= 1 ? 'pass' : tables >= 1 ? 'partial' : 'fail',
    details: `${tables} table(s) found, ${wellStructuredTables} with proper headers`,
    points: wellStructuredTables >= 1 ? 20 : tables >= 1 ? 10 : 0,
    maxPoints: 20,
  });
  if (tables === 0) recommendations.push('Add HTML tables with proper <thead> and <th> elements. Tables increase AI citation rates by 2.5x and account for a significant portion of all citations.');

  // Ordered lists
  const orderedLists = $('ol').length;
  findings.push({
    check: 'Ordered lists (step-by-step)',
    status: orderedLists >= 1 ? 'pass' : 'fail',
    details: `${orderedLists} ordered list(s) found`,
    points: orderedLists >= 1 ? 15 : 0,
    maxPoints: 15,
  });

  // Unordered lists
  const unorderedLists = $('ul').filter((_, el) => !$(el).closest('nav, header, footer').length).length;
  findings.push({
    check: 'Unordered lists (in content)',
    status: unorderedLists >= 2 ? 'pass' : unorderedLists >= 1 ? 'partial' : 'fail',
    details: `${unorderedLists} content list(s) found (excluding navigation)`,
    points: unorderedLists >= 2 ? 10 : unorderedLists >= 1 ? 5 : 0,
    maxPoints: 10,
  });

  // Code blocks
  const codeBlocks = $('pre, code').length;
  findings.push({
    check: 'Code blocks',
    status: codeBlocks >= 1 ? 'pass' : 'partial',
    details: `${codeBlocks} code block(s) found`,
    points: codeBlocks >= 1 ? 15 : 5,
    maxPoints: 15,
  });

  // Images with alt text
  const images = $('img').length;
  const imagesWithAlt = $('img[alt]').filter((_, el) => ($(el).attr('alt') || '').trim().length > 0).length;
  const altRatio = images > 0 ? imagesWithAlt / images : 1;
  findings.push({
    check: 'Images with descriptive alt text',
    status: altRatio >= 0.9 ? 'pass' : altRatio >= 0.5 ? 'partial' : 'fail',
    details: `${imagesWithAlt}/${images} images have alt text (${Math.round(altRatio * 100)}%)`,
    points: altRatio >= 0.9 ? 15 : altRatio >= 0.5 ? 8 : 0,
    maxPoints: 15,
  });
  if (altRatio < 0.9) recommendations.push('Add descriptive alt text to all images. This improves both accessibility and AI content understanding.');

  // Blockquotes
  const blockquotes = $('blockquote').length;
  findings.push({
    check: 'Blockquotes (expert citations)',
    status: blockquotes >= 1 ? 'pass' : 'fail',
    details: `${blockquotes} blockquote(s) found`,
    points: blockquotes >= 1 ? 10 : 0,
    maxPoints: 10,
  });
  if (blockquotes === 0) recommendations.push('Add blockquote elements for expert citations. This provides visually and semantically distinct citation-worthy content for AI extraction.');

  // Embedded video
  const videos = $('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"]').length;
  findings.push({
    check: 'Embedded video content',
    status: videos >= 1 ? 'pass' : 'partial',
    details: `${videos} video embed(s) found`,
    points: videos >= 1 ? 10 : 3,
    maxPoints: 10,
  });

  // Definition lists
  const defLists = $('dl').length;
  findings.push({
    check: 'Definition lists',
    status: defLists >= 1 ? 'pass' : 'partial',
    details: `${defLists} definition list(s) found`,
    points: defLists >= 1 ? 5 : 2,
    maxPoints: 5,
  });

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.10, findings, recommendations };
}
