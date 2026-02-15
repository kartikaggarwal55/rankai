import path from 'node:path';
import { promises as fs } from 'node:fs';
import { load as loadHtml } from 'cheerio';
import MarkdownIt from 'markdown-it';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from 'pdf-lib';
import { AEOAnalysis, CategoryScore, GEOAnalysis, SiteAnalysis } from '@/lib/types';

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN_X = 46;
const PAGE_MARGIN_TOP = 44;
const PAGE_MARGIN_BOTTOM = 46;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN_X * 2;
const PAGE_HEADER_HEIGHT = 26;

const COLOR_TEXT = rgb(0.11, 0.13, 0.18);
const COLOR_MUTED = rgb(0.39, 0.44, 0.52);
const COLOR_BORDER = rgb(0.87, 0.89, 0.93);
const COLOR_BRAND = rgb(0.15, 0.32, 0.68);
const COLOR_BRAND_SOFT = rgb(0.93, 0.95, 0.99);
const COLOR_CODE_BG = rgb(0.96, 0.97, 0.99);
const COLOR_GOOD = rgb(0.11, 0.57, 0.27);
const COLOR_WARN = rgb(0.69, 0.39, 0.06);
const COLOR_BAD = rgb(0.66, 0.16, 0.15);

const SITE_TYPE_LABELS: Record<SiteAnalysis['siteType'], string> = {
  'saas-api': 'SaaS / API',
  ecommerce: 'E-commerce',
  'local-business': 'Local Business',
  'content-publisher': 'Content Publisher',
  general: 'General',
};

const GEO_CATEGORY_ORDER: (keyof GEOAnalysis)[] = [
  'contentStructure',
  'schemaMarkup',
  'topicalAuthority',
  'citationWorthiness',
  'contentFreshness',
  'languagePatterns',
  'metaInformation',
  'technicalHealth',
  'contentUniqueness',
  'multiFormatContent',
  'eeatSignals',
];

const AEO_PRIMARY_ORDER = [
  'documentationStructure',
  'apiDocumentation',
  'codeExamples',
  'llmsTxt',
  'sdkQuality',
  'authSimplicity',
  'quickstartGuide',
  'errorMessages',
  'changelogVersioning',
  'mcpServer',
  'integrationGuides',
  'machineReadableSitemaps',
];

const PDF_CHAR_REPLACEMENTS: Record<string, string> = {
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '⇒': '=>',
  '⇐': '<=',
  '…': '...',
  '—': '-',
  '–': '-',
  '−': '-',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '✓': '[ok]',
  '✔': '[ok]',
  '✗': '[x]',
  '✘': '[x]',
  '≤': '<=',
  '≥': '>=',
  '≈': '~',
  '\u00A0': ' ',
};

type FontKey = 'body' | 'bold' | 'mono';

type PdfFonts = {
  body: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
};

type FontSupport = {
  body: Set<number>;
  bold: Set<number>;
  mono: Set<number>;
};

type ReportContext = {
  doc: PDFDocument;
  fonts: PdfFonts;
  support: FontSupport;
  page: PDFPage;
  y: number;
  domain: string;
};

type DrawTextOptions = {
  font?: FontKey;
  size?: number;
  color?: RGB;
  indent?: number;
  lineHeight?: number;
  after?: number;
  before?: number;
  maxWidth?: number;
};

type EmbeddedFontAssets = {
  regular: Uint8Array;
  bold: Uint8Array;
  mono: Uint8Array;
};

let cachedFontAssets: Promise<EmbeddedFontAssets> | null = null;

function formatCategoryKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
}

function normalizeSpace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function safeUrlHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return 'site';
  }
}

function toDateStamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'unknown-date';
  return parsed.toISOString().slice(0, 10);
}

function toUtcDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}

export function buildReportFilename(url: string, crawledAt: string): string {
  const host = safeUrlHost(url).replace(/[^a-z0-9.-]/g, '-').replace(/-+/g, '-');
  const date = toDateStamp(crawledAt);
  return `visirank-report-${host}-${date}.pdf`;
}

async function loadEmbeddedFontAssets(): Promise<EmbeddedFontAssets> {
  if (!cachedFontAssets) {
    cachedFontAssets = (async () => {
      const base = path.join(process.cwd(), 'src', 'lib', 'report', 'fonts');
      const [regular, bold, mono] = await Promise.all([
        fs.readFile(path.join(base, 'NotoSans-Regular.ttf')),
        fs.readFile(path.join(base, 'NotoSans-Bold.ttf')),
        fs.readFile(path.join(base, 'NotoSansMono-Regular.ttf')),
      ]);

      return {
        regular: new Uint8Array(regular),
        bold: new Uint8Array(bold),
        mono: new Uint8Array(mono),
      };
    })();
  }

  return cachedFontAssets;
}

async function embedFonts(doc: PDFDocument): Promise<PdfFonts> {
  try {
    const assets = await loadEmbeddedFontAssets();
    doc.registerFontkit(fontkit);

    return {
      body: await doc.embedFont(assets.regular, { subset: true }),
      bold: await doc.embedFont(assets.bold, { subset: true }),
      mono: await doc.embedFont(assets.mono, { subset: true }),
    };
  } catch {
    return {
      body: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
      mono: await doc.embedFont(StandardFonts.Courier),
    };
  }
}

function createFontSupport(fonts: PdfFonts): FontSupport {
  return {
    body: new Set(fonts.body.getCharacterSet()),
    bold: new Set(fonts.bold.getCharacterSet()),
    mono: new Set(fonts.mono.getCharacterSet()),
  };
}

function sanitizeForFont(text: string, support: Set<number>): string {
  let normalized = text.normalize('NFKD');

  for (const [search, replacement] of Object.entries(PDF_CHAR_REPLACEMENTS)) {
    normalized = normalized.split(search).join(replacement);
  }

  normalized = normalized.replace(/[\u0300-\u036f]/g, '');

  let result = '';
  for (const ch of normalized) {
    if (ch === '\n' || ch === '\r' || ch === '\t') {
      result += ch;
      continue;
    }

    if (support.has(ch.codePointAt(0) || 0)) {
      result += ch;
      continue;
    }

    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) {
      result += ch;
    } else {
      result += '?';
    }
  }

  return result;
}

function getFont(ctx: ReportContext, key: FontKey): PDFFont {
  return ctx.fonts[key];
}

function getSupport(ctx: ReportContext, key: FontKey): Set<number> {
  return ctx.support[key];
}

function drawPageHeader(ctx: ReportContext) {
  const headerY = PAGE_HEIGHT - PAGE_MARGIN_TOP;

  ctx.page.drawLine({
    start: { x: PAGE_MARGIN_X, y: headerY - 15 },
    end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y: headerY - 15 },
    thickness: 0.7,
    color: COLOR_BORDER,
  });

  const left = sanitizeForFont('VisiRank AI GEO + AEO Report', ctx.support.bold);
  const right = sanitizeForFont(ctx.domain, ctx.support.body);

  ctx.page.drawText(left, {
    x: PAGE_MARGIN_X,
    y: headerY - 6,
    font: ctx.fonts.bold,
    size: 10,
    color: COLOR_BRAND,
  });

  const rightSize = 9;
  const rightWidth = ctx.fonts.body.widthOfTextAtSize(right, rightSize);
  ctx.page.drawText(right, {
    x: PAGE_WIDTH - PAGE_MARGIN_X - rightWidth,
    y: headerY - 6,
    font: ctx.fonts.body,
    size: rightSize,
    color: COLOR_MUTED,
  });
}

function createPage(ctx: ReportContext) {
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPageHeader(ctx);
  ctx.y = PAGE_HEIGHT - PAGE_MARGIN_TOP - PAGE_HEADER_HEIGHT;
}

function ensureSpace(ctx: ReportContext, neededHeight: number) {
  if (ctx.y - neededHeight >= PAGE_MARGIN_BOTTOM) return;
  createPage(ctx);
}

function wrapLine(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const normalized = text.replace(/\t/g, '  ').replace(/\s+/g, ' ').trim();
  if (!normalized) return [''];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = words[0] || '';

  const fitWord = (word: string): string[] => {
    const parts: string[] = [];
    let segment = '';
    for (const ch of word) {
      const candidate = `${segment}${ch}`;
      if (segment && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        parts.push(segment);
        segment = ch;
      } else {
        segment = candidate;
      }
    }
    if (segment) parts.push(segment);
    return parts;
  };

  for (let i = 1; i < words.length; i++) {
    const nextWord = words[i];
    const candidate = `${current} ${nextWord}`;

    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (font.widthOfTextAtSize(nextWord, size) > maxWidth) {
      lines.push(current);
      const chunks = fitWord(nextWord);
      for (let c = 0; c < chunks.length - 1; c++) lines.push(chunks[c]);
      current = chunks[chunks.length - 1] || '';
      continue;
    }

    lines.push(current);
    current = nextWord;
  }

  lines.push(current);
  return lines;
}

function drawTextBlock(ctx: ReportContext, text: string, options: DrawTextOptions = {}) {
  const {
    font = 'body',
    size = 10.5,
    color = COLOR_TEXT,
    indent = 0,
    lineHeight = size + 3.5,
    after = 0,
    before = 0,
    maxWidth = CONTENT_WIDTH - indent,
  } = options;

  if (before > 0) {
    ensureSpace(ctx, before + 2);
    ctx.y -= before;
  }

  const pdfFont = getFont(ctx, font);
  const safe = sanitizeForFont(text, getSupport(ctx, font));
  const paragraphs = safe.replace(/\r/g, '').split('\n');

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      ensureSpace(ctx, lineHeight * 0.6);
      ctx.y -= lineHeight * 0.6;
      continue;
    }

    const lines = wrapLine(paragraph, pdfFont, size, maxWidth);
    for (const line of lines) {
      ensureSpace(ctx, lineHeight + 2);
      ctx.page.drawText(line, {
        x: PAGE_MARGIN_X + indent,
        y: ctx.y,
        size,
        font: pdfFont,
        color,
      });
      ctx.y -= lineHeight;
    }
  }

  if (after > 0) {
    ensureSpace(ctx, after + 2);
    ctx.y -= after;
  }
}

function drawRule(ctx: ReportContext, after = 8) {
  ensureSpace(ctx, 8 + after);
  const y = ctx.y - 2;

  ctx.page.drawLine({
    start: { x: PAGE_MARGIN_X, y },
    end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y },
    thickness: 0.7,
    color: COLOR_BORDER,
  });

  ctx.y = y - after;
}

function drawSectionHeading(ctx: ReportContext, title: string, subtitle?: string) {
  drawTextBlock(ctx, title, {
    font: 'bold',
    size: 16,
    color: COLOR_BRAND,
    lineHeight: 20,
    before: 8,
    after: 2,
  });

  if (subtitle) {
    drawTextBlock(ctx, subtitle, {
      size: 10,
      color: COLOR_MUTED,
      lineHeight: 14,
      after: 3,
    });
  }

  drawRule(ctx, 8);
}

function drawMetricCard(
  ctx: ReportContext,
  x: number,
  y: number,
  title: string,
  score: number,
  grade: string,
  accent: RGB,
) {
  const width = 155;
  const height = 70;

  ctx.page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    color: COLOR_BRAND_SOFT,
    borderColor: COLOR_BORDER,
    borderWidth: 0.8,
  });

  ctx.page.drawText(sanitizeForFont(title, ctx.support.bold), {
    x: x + 10,
    y: y - 18,
    font: ctx.fonts.bold,
    size: 10,
    color: COLOR_MUTED,
  });

  ctx.page.drawText(sanitizeForFont(`${score}/100`, ctx.support.bold), {
    x: x + 10,
    y: y - 40,
    font: ctx.fonts.bold,
    size: 17,
    color: accent,
  });

  ctx.page.drawText(sanitizeForFont(`Grade ${grade}`, ctx.support.body), {
    x: x + 10,
    y: y - 57,
    font: ctx.fonts.body,
    size: 10,
    color: COLOR_TEXT,
  });
}

function drawCover(ctx: ReportContext, analysis: SiteAnalysis) {
  drawTextBlock(ctx, 'VisiRank AI Analysis Report', {
    font: 'bold',
    size: 24,
    color: COLOR_BRAND,
    lineHeight: 30,
    after: 6,
  });

  drawTextBlock(ctx, ctx.domain, {
    font: 'bold',
    size: 15,
    color: COLOR_TEXT,
    lineHeight: 20,
  });

  drawTextBlock(
    ctx,
    `Generated ${toDateStamp(analysis.crawledAt)} | ${analysis.pagesAnalyzed} pages analyzed | ${SITE_TYPE_LABELS[analysis.siteType]}`,
    {
      size: 10.5,
      color: COLOR_MUTED,
      lineHeight: 14,
      after: 8,
    }
  );

  ensureSpace(ctx, 90);
  const rowY = ctx.y;
  drawMetricCard(ctx, PAGE_MARGIN_X, rowY, 'Overall Score', analysis.overallScore, analysis.overallGrade, COLOR_BRAND);
  drawMetricCard(ctx, PAGE_MARGIN_X + 172, rowY, 'GEO Score', analysis.geoScore, analysis.geoGrade, rgb(0.09, 0.47, 0.19));
  drawMetricCard(ctx, PAGE_MARGIN_X + 344, rowY, 'AEO Score', analysis.aeoScore, analysis.aeoGrade, rgb(0.13, 0.36, 0.72));
  ctx.y -= 84;

  drawRule(ctx, 10);
}

function drawExecutiveSummary(ctx: ReportContext, analysis: SiteAnalysis) {
  drawSectionHeading(ctx, 'Executive Summary');

  const rows: Array<[string, string]> = [
    ['URL', analysis.url],
    ['Generated', toUtcDateTime(analysis.crawledAt)],
    ['Site Type', SITE_TYPE_LABELS[analysis.siteType]],
    ['Pages Analyzed', String(analysis.pagesAnalyzed)],
    ['Overall', `${analysis.overallScore}/100 (${analysis.overallGrade})`],
    ['GEO', `${analysis.geoScore}/100 (${analysis.geoGrade})`],
    ['AEO', `${analysis.aeoScore}/100 (${analysis.aeoGrade})`],
  ];

  for (const [label, value] of rows) {
    drawTextBlock(ctx, `${label}:`, {
      font: 'bold',
      size: 10.5,
      color: COLOR_TEXT,
      lineHeight: 14,
      maxWidth: 92,
    });

    const labelHeight = 14;
    ctx.y += labelHeight;

    drawTextBlock(ctx, value, {
      size: 10.5,
      color: COLOR_TEXT,
      indent: 94,
      lineHeight: 14,
      maxWidth: CONTENT_WIDTH - 94,
      after: 1,
    });
  }
}

function priorityColor(priority: SiteAnalysis['topRecommendations'][number]['priority']): RGB {
  if (priority === 'critical') return COLOR_BAD;
  if (priority === 'high') return COLOR_WARN;
  if (priority === 'medium') return rgb(0.74, 0.52, 0.1);
  return COLOR_GOOD;
}

function drawRecommendations(ctx: ReportContext, analysis: SiteAnalysis) {
  drawSectionHeading(
    ctx,
    'Top Recommendations',
    `Total: ${analysis.topRecommendations.length} actions ranked by potential impact`,
  );

  if (analysis.topRecommendations.length === 0) {
    drawTextBlock(ctx, 'No recommendations were generated for this analysis.', {
      size: 10.5,
      color: COLOR_MUTED,
      after: 4,
    });
    return;
  }

  for (const recommendation of analysis.topRecommendations) {
    const accent = priorityColor(recommendation.priority);

    drawTextBlock(
      ctx,
      `${recommendation.title} [${recommendation.priority.toUpperCase()} | ${recommendation.type.toUpperCase()} | effort: ${recommendation.effort}]`,
      {
        font: 'bold',
        size: 11.5,
        color: accent,
        lineHeight: 15,
        before: 4,
      }
    );

    drawTextBlock(ctx, `Category: ${recommendation.category}`, {
      size: 10,
      color: COLOR_TEXT,
      lineHeight: 13.5,
    });

    drawTextBlock(ctx, `Score Lift: ${recommendation.currentScore} -> ${recommendation.potentialScore}`, {
      size: 10,
      color: COLOR_TEXT,
      lineHeight: 13.5,
    });

    drawTextBlock(ctx, `Impact: ${normalizeSpace(recommendation.impact)}`, {
      size: 10,
      color: COLOR_TEXT,
      lineHeight: 13.5,
    });

    drawTextBlock(ctx, `Details: ${normalizeSpace(recommendation.description)}`, {
      size: 10,
      color: COLOR_TEXT,
      lineHeight: 13.5,
      after: 2,
    });

    if (recommendation.codeSnippet) {
      drawCodeBlock(
        ctx,
        `${recommendation.codeSnippet.label} (${recommendation.codeSnippet.language})\n${recommendation.codeSnippet.code}`,
      );
    }

    drawRule(ctx, 5);
  }
}

function findingStatusColor(status: CategoryScore['findings'][number]['status']): RGB {
  if (status === 'pass') return COLOR_GOOD;
  if (status === 'partial') return COLOR_WARN;
  return COLOR_BAD;
}

function drawCategoryScore(
  ctx: ReportContext,
  categoryName: string,
  category: CategoryScore,
  type: 'GEO' | 'AEO',
) {
  drawTextBlock(ctx, `${categoryName} (${type})`, {
    font: 'bold',
    size: 11.5,
    color: COLOR_BRAND,
    lineHeight: 15,
    before: 4,
  });

  drawTextBlock(
    ctx,
    `Score ${category.score}/100 | Grade ${category.grade} | Weight ${Math.round(category.weight * 100)}%`,
    {
      size: 9.8,
      color: COLOR_MUTED,
      lineHeight: 13,
      after: 2,
    }
  );

  if (category.findings.length > 0) {
    drawTextBlock(ctx, 'Findings', {
      font: 'bold',
      size: 9.8,
      color: COLOR_TEXT,
      lineHeight: 13,
      after: 0.5,
    });

    for (const finding of category.findings) {
      drawTextBlock(
        ctx,
        `[${finding.status.toUpperCase()}] ${finding.check} (${finding.points}/${finding.maxPoints})`,
        {
          font: 'bold',
          size: 9.4,
          color: findingStatusColor(finding.status),
          indent: 10,
          lineHeight: 12.5,
        }
      );

      drawTextBlock(ctx, normalizeSpace(finding.details), {
        size: 9.4,
        color: COLOR_TEXT,
        indent: 22,
        lineHeight: 12.5,
      });
    }
  }

  if (category.recommendations.length > 0) {
    drawTextBlock(ctx, 'Recommendations', {
      font: 'bold',
      size: 9.8,
      color: COLOR_TEXT,
      lineHeight: 13,
      after: 0.5,
      before: 1,
    });

    for (const rec of category.recommendations) {
      drawTextBlock(ctx, `- ${normalizeSpace(rec)}`, {
        size: 9.4,
        color: COLOR_TEXT,
        indent: 10,
        lineHeight: 12.5,
      });
    }
  }

  drawRule(ctx, 5);
}

function drawGeoSection(ctx: ReportContext, geo: GEOAnalysis) {
  drawSectionHeading(
    ctx,
    'GEO Category Breakdown',
    'How effectively your content is structured for AI citation and answer generation.',
  );

  for (const key of GEO_CATEGORY_ORDER) {
    drawCategoryScore(ctx, formatCategoryKey(key), geo[key], 'GEO');
  }
}

function getOrderedAeoKeys(aeo: AEOAnalysis): string[] {
  const known = AEO_PRIMARY_ORDER.filter(key => Boolean(aeo[key]));
  const unknown = Object.keys(aeo).filter(key => !AEO_PRIMARY_ORDER.includes(key)).sort();
  return [...known, ...unknown];
}

function drawAeoSection(ctx: ReportContext, aeo: AEOAnalysis) {
  drawSectionHeading(
    ctx,
    'AEO Category Breakdown',
    'How ready your site is for agentic discovery and machine-actionable workflows.',
  );

  for (const key of getOrderedAeoKeys(aeo)) {
    const category = aeo[key];
    if (!category) continue;
    drawCategoryScore(ctx, formatCategoryKey(key), category, 'AEO');
  }
}

function calculatePageGeoScore(page: SiteAnalysis['pageAnalyses'][number]): number {
  return Math.round(Object.values(page.geo).reduce((sum, cat) => sum + cat.score * cat.weight, 0));
}

function drawPageBreakdown(ctx: ReportContext, analysis: SiteAnalysis) {
  drawSectionHeading(ctx, 'Page-Level Breakdown', `Detailed scores for all ${analysis.pageAnalyses.length} crawled pages.`);

  for (const [index, page] of analysis.pageAnalyses.entries()) {
    drawTextBlock(ctx, `${index + 1}. ${page.title || '(Untitled page)'}`, {
      font: 'bold',
      size: 10.6,
      color: COLOR_TEXT,
      lineHeight: 14,
      before: 2,
    });

    drawTextBlock(ctx, `URL: ${page.url}`, {
      size: 9.7,
      color: COLOR_MUTED,
      lineHeight: 12.8,
    });

    drawTextBlock(ctx, `Weighted GEO score: ${calculatePageGeoScore(page)}/100`, {
      size: 9.7,
      color: COLOR_TEXT,
      lineHeight: 12.8,
      after: 2,
    });

    drawRule(ctx, 4);
  }
}

function extractNodeTextWithLinks($: ReturnType<typeof loadHtml>, node: any): string {
  const chunks: string[] = [];

  ($(node).contents().toArray() as Array<{ type?: string; data?: string; tagName?: string; name?: string }>).forEach((child) => {
    if (child.type === 'text') {
      if (child.data) chunks.push(child.data);
      return;
    }

    if (child.type !== 'tag') return;

    const childNode = child as any;
    const tag = (child.tagName || child.name || '').toLowerCase();

    if (tag === 'a') {
      const text = normalizeSpace($(childNode).text());
      const href = $(childNode).attr('href');
      if (text && href) chunks.push(`${text} (${href})`);
      else if (text) chunks.push(text);
      return;
    }

    if (tag === 'code') {
      chunks.push('`' + $(childNode).text() + '`');
      return;
    }

    chunks.push(extractNodeTextWithLinks($, childNode));
  });

  return normalizeSpace(chunks.join(' '));
}

function drawCodeBlock(ctx: ReportContext, code: string) {
  const clean = code.replace(/\r/g, '').trim();
  if (!clean) return;

  const size = 8.7;
  const lineHeight = 11.3;
  const indent = 10;
  const padding = 8;
  const maxWidth = CONTENT_WIDTH - indent * 2;
  const font = ctx.fonts.mono;
  const support = ctx.support.mono;

  const lines: string[] = [];
  for (const rawLine of sanitizeForFont(clean, support).split('\n')) {
    const wrapped = wrapLine(rawLine, font, size, maxWidth);
    lines.push(...wrapped);
  }

  const blockHeight = lines.length * lineHeight + padding * 2;
  ensureSpace(ctx, blockHeight + 4);

  const blockTop = ctx.y;
  ctx.page.drawRectangle({
    x: PAGE_MARGIN_X + indent,
    y: blockTop - blockHeight,
    width: CONTENT_WIDTH - indent * 2,
    height: blockHeight,
    color: COLOR_CODE_BG,
    borderColor: COLOR_BORDER,
    borderWidth: 0.6,
  });

  let lineY = blockTop - padding - 1;
  for (const line of lines) {
    ctx.page.drawText(line, {
      x: PAGE_MARGIN_X + indent + 6,
      y: lineY,
      size,
      font,
      color: rgb(0.2, 0.24, 0.32),
    });
    lineY -= lineHeight;
  }

  ctx.y -= blockHeight + 4;
}

function drawQuoteBlock(ctx: ReportContext, text: string) {
  const lineHeight = 13.2;
  const indent = 16;
  const maxWidth = CONTENT_WIDTH - indent;
  const lines = wrapLine(sanitizeForFont(text, ctx.support.body), ctx.fonts.body, 10, maxWidth);
  const height = lines.length * lineHeight + 8;

  ensureSpace(ctx, height + 4);
  const top = ctx.y;

  ctx.page.drawLine({
    start: { x: PAGE_MARGIN_X + 6, y: top - 2 },
    end: { x: PAGE_MARGIN_X + 6, y: top - height + 2 },
    thickness: 2,
    color: COLOR_BORDER,
  });

  let y = top;
  for (const line of lines) {
    ctx.page.drawText(line, {
      x: PAGE_MARGIN_X + indent,
      y,
      size: 10,
      font: ctx.fonts.body,
      color: COLOR_MUTED,
    });
    y -= lineHeight;
  }

  ctx.y -= height + 4;
}

function drawMarkdownTable(ctx: ReportContext, rows: string[][]) {
  if (rows.length === 0) return;
  drawTextBlock(ctx, 'Table', {
    font: 'bold',
    size: 10,
    color: COLOR_TEXT,
    lineHeight: 13,
    after: 1,
  });

  rows.forEach((cells, rowIndex) => {
    const prefix = rowIndex === 0 ? '[header]' : `[row ${rowIndex}]`;
    drawTextBlock(ctx, `${prefix} ${cells.map(cell => normalizeSpace(cell)).join(' | ')}`, {
      font: rowIndex === 0 ? 'bold' : 'body',
      size: 9.4,
      color: rowIndex === 0 ? COLOR_TEXT : COLOR_MUTED,
      lineHeight: 12.4,
      indent: 8,
    });
  });

  ctx.y -= 1;
}

function drawInsights(ctx: ReportContext, markdown: string) {
  drawSectionHeading(
    ctx,
    'AI Strategic Insights',
    'Rendered from Markdown with headings, lists, code blocks, quotes, and tables.',
  );

  if (!markdown.trim()) {
    drawTextBlock(ctx, 'No AI insights available.', {
      size: 10.5,
      color: COLOR_MUTED,
      lineHeight: 14,
    });
    return;
  }

  const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
  const html = md.render(markdown);
  const $ = loadHtml(`<article>${html}</article>`);

  const blocks = $('article').children().toArray() as Array<{ tagName?: string; name?: string }>;

  for (const block of blocks) {
    const tag = (block.tagName || block.name || '').toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const sizeByLevel = [0, 18, 15.5, 13.8, 12.6, 11.8, 11.2];
      drawTextBlock(ctx, extractNodeTextWithLinks($, block), {
        font: 'bold',
        size: sizeByLevel[level] || 12,
        color: COLOR_BRAND,
        lineHeight: (sizeByLevel[level] || 12) + 4,
        before: level <= 2 ? 6 : 3,
        after: 1,
      });
      continue;
    }

    if (tag === 'p') {
      drawTextBlock(ctx, extractNodeTextWithLinks($, block), {
        size: 10.5,
        color: COLOR_TEXT,
        lineHeight: 14.2,
        after: 1,
      });
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      const ordered = tag === 'ol';
      let listIndex = 1;
      ($(block as any).children('li').toArray() as any[]).forEach((li) => {
        const prefix = ordered ? `${listIndex}.` : '•';
        listIndex += 1;
        drawTextBlock(ctx, `${prefix} ${extractNodeTextWithLinks($, li)}`, {
          size: 10.3,
          color: COLOR_TEXT,
          indent: 10,
          lineHeight: 13.8,
        });
      });
      ctx.y -= 1;
      continue;
    }

    if (tag === 'pre') {
      const code = $(block as any).find('code').first().text() || $(block as any).text();
      drawCodeBlock(ctx, code);
      continue;
    }

    if (tag === 'blockquote') {
      drawQuoteBlock(ctx, extractNodeTextWithLinks($, block));
      continue;
    }

    if (tag === 'hr') {
      drawRule(ctx, 6);
      continue;
    }

    if (tag === 'table') {
      const rows: string[][] = [];
      ($(block as any).find('tr').toArray() as any[]).forEach((tr) => {
        const cells = ($(tr as any).find('th,td').toArray() as any[])
          .map(cell => extractNodeTextWithLinks($, cell));
        if (cells.length > 0) rows.push(cells);
      });
      drawMarkdownTable(ctx, rows);
      continue;
    }

    const fallback = normalizeSpace($(block as any).text());
    if (fallback) {
      drawTextBlock(ctx, fallback, {
        size: 10.5,
        color: COLOR_TEXT,
        lineHeight: 14,
      });
    }
  }
}

function drawComparison(ctx: ReportContext, primary: SiteAnalysis, competitors: SiteAnalysis[]) {
  if (competitors.length === 0) return;

  drawSectionHeading(ctx, 'Comparison Snapshot');

  const allSites = [primary, ...competitors];
  allSites.forEach((site, index) => {
    const label = safeUrlHost(site.url);
    drawTextBlock(ctx, `${index + 1}. ${label}`, {
      font: 'bold',
      size: 11,
      color: COLOR_TEXT,
      lineHeight: 14,
      before: index === 0 ? 0 : 2,
    });

    drawTextBlock(ctx, `Overall ${site.overallScore} | GEO ${site.geoScore} | AEO ${site.aeoScore}`, {
      size: 10,
      color: COLOR_MUTED,
      lineHeight: 13,
      indent: 12,
      after: 1,
    });
  });
}

function drawFooter(page: PDFPage, fonts: PdfFonts, support: FontSupport, pageNumber: number, totalPages: number) {
  const footerY = PAGE_MARGIN_BOTTOM - 20;

  page.drawLine({
    start: { x: PAGE_MARGIN_X, y: footerY + 12 },
    end: { x: PAGE_WIDTH - PAGE_MARGIN_X, y: footerY + 12 },
    thickness: 0.6,
    color: COLOR_BORDER,
  });

  const left = sanitizeForFont('Generated by VisiRank AI', support.body);
  page.drawText(left, {
    x: PAGE_MARGIN_X,
    y: footerY,
    font: fonts.body,
    size: 8.5,
    color: COLOR_MUTED,
  });

  const right = sanitizeForFont(`Page ${pageNumber} of ${totalPages}`, support.body);
  const rightWidth = fonts.body.widthOfTextAtSize(right, 8.5);
  page.drawText(right, {
    x: PAGE_WIDTH - PAGE_MARGIN_X - rightWidth,
    y: footerY,
    font: fonts.body,
    size: 8.5,
    color: COLOR_MUTED,
  });
}

export async function generateAnalysisReportPdf(
  analysis: SiteAnalysis,
  competitors: SiteAnalysis[] = [],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);
  const support = createFontSupport(fonts);

  doc.setTitle(`VisiRank AI Report - ${safeUrlHost(analysis.url)}`);
  doc.setAuthor('VisiRank AI');
  doc.setCreator('VisiRank AI');
  doc.setSubject('GEO and AEO analysis report');
  doc.setKeywords(['visirank', 'geo', 'aeo', 'report']);
  doc.setCreationDate(new Date());
  doc.setModificationDate(new Date());

  const ctx: ReportContext = {
    doc,
    fonts,
    support,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: 0,
    domain: safeUrlHost(analysis.url),
  };

  drawPageHeader(ctx);
  ctx.y = PAGE_HEIGHT - PAGE_MARGIN_TOP - PAGE_HEADER_HEIGHT;

  drawCover(ctx, analysis);
  drawExecutiveSummary(ctx, analysis);
  drawComparison(ctx, analysis, competitors);
  drawRecommendations(ctx, analysis);
  drawGeoSection(ctx, analysis.geo);
  drawAeoSection(ctx, analysis.aeo);
  drawPageBreakdown(ctx, analysis);
  drawInsights(ctx, analysis.aiInsights);

  const pages = doc.getPages();
  pages.forEach((page, index) => {
    drawFooter(page, fonts, support, index + 1, pages.length);
  });

  return doc.save();
}
