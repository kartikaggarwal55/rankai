import * as cheerio from 'cheerio';
import { AEOAnalysis, CategoryScore, Finding, getGrade } from '../types';

interface SiteContext {
  allPages: { url: string; html: string; title: string }[];
  robotsTxt: string | null;
  llmsTxt: string | null;
  llmsFullTxt: string | null;
  openApiSpec: string | null;
  origin: string;
}

export function analyzeAEO(ctx: SiteContext): AEOAnalysis {
  return {
    documentationStructure: analyzeDocumentationStructure(ctx),
    apiDocumentation: analyzeApiDocumentation(ctx),
    codeExamples: analyzeCodeExamples(ctx),
    llmsTxt: analyzeLlmsTxt(ctx),
    sdkQuality: analyzeSdkQuality(ctx),
    authSimplicity: analyzeAuthSimplicity(ctx),
    quickstartGuide: analyzeQuickstartGuide(ctx),
    errorMessages: analyzeErrorMessages(ctx),
    changelogVersioning: analyzeChangelogVersioning(ctx),
    mcpServer: analyzeMcpServer(ctx),
    integrationGuides: analyzeIntegrationGuides(ctx),
    machineReadableSitemaps: analyzeMachineReadableSitemaps(ctx),
  };
}

function analyzeDocumentationStructure(ctx: SiteContext): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // Check if site has docs section
  const docPages = ctx.allPages.filter(p => /\/docs|\/documentation|\/guide|\/reference|\/api/i.test(p.url));
  const hasDocSection = docPages.length > 0;
  findings.push({
    check: 'Documentation section exists',
    status: hasDocSection ? 'pass' : 'fail',
    details: hasDocSection ? `${docPages.length} documentation page(s) found` : 'No dedicated documentation section found',
    points: hasDocSection ? 20 : 0,
    maxPoints: 20,
  });
  if (!hasDocSection) recommendations.push('Create a dedicated documentation section (/docs). AI agents rely on well-structured docs to understand and integrate with your platform.');

  // Check heading consistency across pages
  let consistentHeadings = 0;
  const pagesToCheck = (hasDocSection ? docPages : ctx.allPages).slice(0, 10);
  for (const page of pagesToCheck) {
    const $ = cheerio.load(page.html);
    const h1Count = $('h1').length;
    const h2Count = $('h2').length;
    if (h1Count === 1 && h2Count >= 2) consistentHeadings++;
  }
  const headingRatio = pagesToCheck.length > 0 ? consistentHeadings / pagesToCheck.length : 0;
  findings.push({
    check: 'Consistent heading hierarchy across pages',
    status: headingRatio >= 0.8 ? 'pass' : headingRatio >= 0.5 ? 'partial' : 'fail',
    details: `${Math.round(headingRatio * 100)}% of pages have consistent heading structure`,
    points: headingRatio >= 0.8 ? 15 : headingRatio >= 0.5 ? 8 : 0,
    maxPoints: 15,
  });
  if (headingRatio < 0.8) recommendations.push('Ensure consistent heading hierarchy (single H1, multiple H2s) across all documentation pages. LLMs build mental maps from headings — skipped levels break content understanding.');

  // Search functionality
  const hasSearch = ctx.allPages.some(p => {
    const $ = cheerio.load(p.html);
    return $('input[type="search"], [role="search"], .search, #search, [data-docsearch], .algolia').length > 0;
  });
  findings.push({
    check: 'Documentation search',
    status: hasSearch ? 'pass' : 'fail',
    details: hasSearch ? 'Search functionality detected' : 'No search functionality found',
    points: hasSearch ? 10 : 0,
    maxPoints: 10,
  });

  // Navigation/sidebar
  const hasNavigation = ctx.allPages.some(p => {
    const $ = cheerio.load(p.html);
    return $('nav, aside, .sidebar, .toc, [role="navigation"]').find('a').length > 5;
  });
  findings.push({
    check: 'Navigation sidebar/TOC',
    status: hasNavigation ? 'pass' : 'fail',
    details: hasNavigation ? 'Navigation structure detected' : 'No navigation sidebar/TOC found',
    points: hasNavigation ? 15 : 0,
    maxPoints: 15,
  });

  // Cross-references between pages
  let avgCrossRefs = 0;
  for (const page of pagesToCheck) {
    const $ = cheerio.load(page.html);
    const mainContent = $('main, article, [role="main"], .content').first();
    const links = (mainContent.length ? mainContent : $('body')).find('a[href]').toArray();
    const crossRefs = links.filter(el => {
      const href = $(el).attr('href') || '';
      return href.startsWith('/docs') || href.includes('/guide') || href.includes('/reference');
    });
    avgCrossRefs += crossRefs.length;
  }
  avgCrossRefs = pagesToCheck.length > 0 ? avgCrossRefs / pagesToCheck.length : 0;
  findings.push({
    check: 'Cross-references between docs pages',
    status: avgCrossRefs >= 3 ? 'pass' : avgCrossRefs >= 1 ? 'partial' : 'fail',
    details: `Average ${Math.round(avgCrossRefs)} cross-reference(s) per page`,
    points: avgCrossRefs >= 3 ? 15 : avgCrossRefs >= 1 ? 8 : 0,
    maxPoints: 15,
  });
  if (avgCrossRefs < 3) recommendations.push('Add more cross-references between documentation pages (3+ per page). AI agents process individual pages and need links to discover related content.');

  // Versioned documentation
  const hasVersioning = ctx.allPages.some(p => /\/v\d|\/version|version-selector|docs-version/i.test(p.url) || /\/v\d/i.test(p.html));
  findings.push({
    check: 'Versioned documentation',
    status: hasVersioning ? 'pass' : 'partial',
    details: hasVersioning ? 'Version indicators found' : 'No explicit versioning detected',
    points: hasVersioning ? 10 : 3,
    maxPoints: 10,
  });

  // Clean URL structure
  const cleanUrls = ctx.allPages.filter(p => {
    const path = new URL(p.url).pathname;
    return /^\/[\w\-\/]+$/.test(path) && !path.includes('?') && path.length < 100;
  });
  const cleanUrlRatio = ctx.allPages.length > 0 ? cleanUrls.length / ctx.allPages.length : 0;
  findings.push({
    check: 'Clean, hierarchical URL structure',
    status: cleanUrlRatio >= 0.8 ? 'pass' : cleanUrlRatio >= 0.5 ? 'partial' : 'fail',
    details: `${Math.round(cleanUrlRatio * 100)}% of pages have clean URL structure`,
    points: cleanUrlRatio >= 0.8 ? 15 : cleanUrlRatio >= 0.5 ? 8 : 0,
    maxPoints: 15,
  });
  if (cleanUrlRatio < 0.8) recommendations.push('Use clean, hierarchical URL paths (e.g., /docs/api/payments/create instead of /docs/article-42). This helps AI agents understand content hierarchy.');

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.10, findings, recommendations };
}

function analyzeApiDocumentation(ctx: SiteContext): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // OpenAPI spec
  const hasSpec = ctx.openApiSpec !== null;
  findings.push({
    check: 'OpenAPI/Swagger specification',
    status: hasSpec ? 'pass' : 'fail',
    details: hasSpec ? 'OpenAPI specification found' : 'No OpenAPI/Swagger spec found at standard paths',
    points: hasSpec ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasSpec) recommendations.push('Publish an OpenAPI 3.0+ specification at /openapi.json. This is the single most important technical asset for AEO — only 5% of API definitions are fully capable of generating good quality SDKs and documentation.');

  // Check for API reference pages
  const apiPages = ctx.allPages.filter(p => /\/api|\/reference|\/endpoint/i.test(p.url));
  findings.push({
    check: 'API reference documentation pages',
    status: apiPages.length >= 3 ? 'pass' : apiPages.length >= 1 ? 'partial' : 'fail',
    details: `${apiPages.length} API reference page(s) found`,
    points: apiPages.length >= 3 ? 20 : apiPages.length >= 1 ? 10 : 0,
    maxPoints: 20,
  });
  if (apiPages.length < 3) recommendations.push('Create comprehensive API reference pages with endpoint details, parameters, and response schemas. Include descriptions explaining WHAT each endpoint does and WHY you would use it.');

  // Check for request/response examples in API docs
  let hasExamples = false;
  for (const page of apiPages.slice(0, 5)) {
    const $ = cheerio.load(page.html);
    if ($('pre, code').length > 0) {
      const codeContent = $('pre, code').text();
      if (/\{[\s\S]*"/.test(codeContent) || /curl|fetch|axios|request/i.test(codeContent)) {
        hasExamples = true;
        break;
      }
    }
  }
  findings.push({
    check: 'Request/response examples',
    status: hasExamples ? 'pass' : 'fail',
    details: hasExamples ? 'API examples with code/JSON found' : 'No API examples detected in documentation',
    points: hasExamples ? 15 : 0,
    maxPoints: 15,
  });
  if (!hasExamples) recommendations.push('Add request/response examples for every API endpoint. Include complete JSON payloads and code examples — agents need these to generate correct integration code.');

  // Authentication documentation
  const hasAuthDocs = ctx.allPages.some(p => /auth|authentication|api[- ]key|token|oauth/i.test(p.url) || /authentication|api[- ]key|bearer token|authorization header/i.test(p.html).toString());
  findings.push({
    check: 'Authentication documentation',
    status: hasAuthDocs ? 'pass' : 'fail',
    details: hasAuthDocs ? 'Authentication documentation found' : 'No authentication documentation found',
    points: hasAuthDocs ? 15 : 0,
    maxPoints: 15,
  });
  if (!hasAuthDocs) recommendations.push('Create dedicated authentication documentation. Clearly document all supported auth methods, provide code examples for each, and explain token lifecycle.');

  // Rate limiting documentation
  const hasRateLimitDocs = ctx.allPages.some(p => {
    const $ = cheerio.load(p.html);
    return /rate limit|throttl|quota|requests per/i.test($('body').text());
  });
  findings.push({
    check: 'Rate limiting documentation',
    status: hasRateLimitDocs ? 'pass' : 'fail',
    details: hasRateLimitDocs ? 'Rate limit documentation found' : 'No rate limit documentation found',
    points: hasRateLimitDocs ? 10 : 0,
    maxPoints: 10,
  });

  // Error codes documentation
  const hasErrorDocs = ctx.allPages.some(p => {
    const $ = cheerio.load(p.html);
    return /error code|error response|status code|error handling/i.test($('body').text());
  });
  findings.push({
    check: 'Error codes documentation',
    status: hasErrorDocs ? 'pass' : 'fail',
    details: hasErrorDocs ? 'Error documentation found' : 'No error codes documentation found',
    points: hasErrorDocs ? 15 : 0,
    maxPoints: 15,
  });
  if (!hasErrorDocs) recommendations.push('Document all possible error codes with meanings, causes, and resolution steps. AI agents cannot "figure out" ambiguous errors the way humans can.');

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.12, findings, recommendations };
}

function analyzeCodeExamples(ctx: SiteContext): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // Detect code blocks across all pages
  let totalCodeBlocks = 0;
  let completeExamples = 0;
  const languages = new Set<string>();

  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    $('pre code, pre').each((_, el) => {
      totalCodeBlocks++;
      const code = $(el).text();
      const className = $(el).attr('class') || '';

      // Detect language
      const langMatch = className.match(/language-(\w+)|lang-(\w+)|highlight-(\w+)/);
      if (langMatch) languages.add(langMatch[1] || langMatch[2] || langMatch[3]);

      // Check completeness (has imports/requires)
      if (/import\s|require\(|from\s|pip install|npm install|using\s/.test(code)) {
        completeExamples++;
      }
    });
  }

  findings.push({
    check: 'Code examples present',
    status: totalCodeBlocks >= 10 ? 'pass' : totalCodeBlocks >= 3 ? 'partial' : 'fail',
    details: `${totalCodeBlocks} code block(s) found across ${ctx.allPages.length} page(s)`,
    points: totalCodeBlocks >= 10 ? 20 : totalCodeBlocks >= 3 ? 10 : 0,
    maxPoints: 20,
  });
  if (totalCodeBlocks < 10) recommendations.push('Add more code examples throughout documentation. AI-generated code accounts for 41%+ of all code written — your examples directly shape what agents produce.');

  // Copy-paste readiness
  const completenessRatio = totalCodeBlocks > 0 ? completeExamples / totalCodeBlocks : 0;
  findings.push({
    check: 'Copy-paste readiness (complete with imports)',
    status: completenessRatio >= 0.5 ? 'pass' : completenessRatio >= 0.25 ? 'partial' : 'fail',
    details: `${Math.round(completenessRatio * 100)}% of examples include imports/initialization`,
    points: completenessRatio >= 0.5 ? 25 : completenessRatio >= 0.25 ? 12 : 0,
    maxPoints: 25,
  });
  if (completenessRatio < 0.5) recommendations.push('Make code examples copy-paste ready with all imports, initialization, and error handling. An agent generating code from your example should not need to hunt for missing pieces.');

  // Language coverage
  findings.push({
    check: 'Multi-language coverage',
    status: languages.size >= 3 ? 'pass' : languages.size >= 2 ? 'partial' : 'fail',
    details: `${languages.size} language(s) detected: ${Array.from(languages).join(', ') || 'unknown'}`,
    points: languages.size >= 3 ? 20 : languages.size >= 2 ? 12 : languages.size >= 1 ? 5 : 0,
    maxPoints: 20,
  });
  if (languages.size < 3) recommendations.push('Provide code examples in 3+ languages (Python, TypeScript/JavaScript, cURL minimum). AI agents work across all languages and need examples in the user\'s language context.');

  // Syntax highlighting
  let highlightedBlocks = 0;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    highlightedBlocks += $('pre code[class*="language-"], pre[class*="highlight"], .shiki, .prism').length;
  }
  findings.push({
    check: 'Syntax highlighting',
    status: highlightedBlocks > 0 ? 'pass' : 'fail',
    details: `${highlightedBlocks} highlighted code block(s)`,
    points: highlightedBlocks > 0 ? 10 : 0,
    maxPoints: 10,
  });

  // Expected output shown
  let examplesWithOutput = 0;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    $('pre, code').each((_, el) => {
      const code = $(el).text();
      if (/output|response|result|returns|=>|#\s*\{/i.test(code)) examplesWithOutput++;
    });
  }
  findings.push({
    check: 'Expected output shown',
    status: examplesWithOutput >= 3 ? 'pass' : examplesWithOutput >= 1 ? 'partial' : 'fail',
    details: `${examplesWithOutput} example(s) include expected output`,
    points: examplesWithOutput >= 3 ? 15 : examplesWithOutput >= 1 ? 8 : 0,
    maxPoints: 15,
  });
  if (examplesWithOutput < 3) recommendations.push('Show expected output/response after code examples. This lets agents verify their generated code will work correctly.');

  // Error handling examples
  let errorExamples = 0;
  for (const page of ctx.allPages) {
    const $ = cheerio.load(page.html);
    $('pre code, pre').each((_, el) => {
      const code = $(el).text();
      if (/try\s*\{|try:|except|catch\s*\(|\.catch\(|error handling/i.test(code)) errorExamples++;
    });
  }
  findings.push({
    check: 'Error handling in examples',
    status: errorExamples >= 2 ? 'pass' : errorExamples >= 1 ? 'partial' : 'fail',
    details: `${errorExamples} example(s) include error handling`,
    points: errorExamples >= 2 ? 10 : errorExamples >= 1 ? 5 : 0,
    maxPoints: 10,
  });
  if (errorExamples < 2) recommendations.push('Include error handling patterns (try/catch, error callbacks) in code examples. Agents need to generate resilient code.');

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.10, findings, recommendations };
}

function analyzeLlmsTxt(ctx: SiteContext): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // File exists
  const hasLlmsTxt = ctx.llmsTxt !== null;
  findings.push({
    check: '/llms.txt file exists',
    status: hasLlmsTxt ? 'pass' : 'fail',
    details: hasLlmsTxt ? 'llms.txt found' : 'No llms.txt file at site root',
    points: hasLlmsTxt ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasLlmsTxt) recommendations.push('Create an /llms.txt file at your domain root. Over 844,000 websites have implemented this standard. It provides structured, token-efficient content that LLMs can quickly parse.');

  if (hasLlmsTxt && ctx.llmsTxt) {
    // Check for required H1
    const hasH1 = /^#\s+\S/.test(ctx.llmsTxt);
    findings.push({
      check: 'H1 heading with project name',
      status: hasH1 ? 'pass' : 'fail',
      details: hasH1 ? 'H1 heading found' : 'Missing required H1 heading',
      points: hasH1 ? 15 : 0,
      maxPoints: 15,
    });

    // Summary blockquote
    const hasBlockquote = ctx.llmsTxt.includes('>');
    findings.push({
      check: 'Summary blockquote',
      status: hasBlockquote ? 'pass' : 'fail',
      details: hasBlockquote ? 'Summary blockquote found' : 'Missing summary blockquote after H1',
      points: hasBlockquote ? 15 : 0,
      maxPoints: 15,
    });

    // H2 sections with URL lists
    const h2Sections = (ctx.llmsTxt.match(/^##\s+/gm) || []).length;
    findings.push({
      check: 'H2 sections with categorized links',
      status: h2Sections >= 2 ? 'pass' : h2Sections >= 1 ? 'partial' : 'fail',
      details: `${h2Sections} H2 section(s) found`,
      points: h2Sections >= 2 ? 15 : h2Sections >= 1 ? 8 : 0,
      maxPoints: 15,
    });

    // URL links
    const urlCount = (ctx.llmsTxt.match(/https?:\/\/\S+/g) || []).length;
    findings.push({
      check: 'URL links present',
      status: urlCount >= 5 ? 'pass' : urlCount >= 2 ? 'partial' : 'fail',
      details: `${urlCount} URL(s) in llms.txt`,
      points: urlCount >= 5 ? 10 : urlCount >= 2 ? 5 : 0,
      maxPoints: 10,
    });

    // Optional section
    const hasOptional = /##\s*Optional/i.test(ctx.llmsTxt);
    findings.push({
      check: 'Optional section for secondary resources',
      status: hasOptional ? 'pass' : 'partial',
      details: hasOptional ? '"Optional" section present' : 'No Optional section',
      points: hasOptional ? 5 : 2,
      maxPoints: 5,
    });
  } else {
    // No llms.txt, add placeholder findings
    ['H1 heading', 'Summary blockquote', 'H2 sections', 'URL links', 'Optional section'].forEach(check => {
      findings.push({ check, status: 'fail', details: 'N/A — no llms.txt file', points: 0, maxPoints: 12 });
    });
  }

  // llms-full.txt
  const hasFullTxt = ctx.llmsFullTxt !== null;
  findings.push({
    check: '/llms-full.txt companion file',
    status: hasFullTxt ? 'pass' : 'fail',
    details: hasFullTxt ? 'llms-full.txt found' : 'No llms-full.txt file',
    points: hasFullTxt ? 15 : 0,
    maxPoints: 15,
  });
  if (!hasFullTxt) recommendations.push('Create an /llms-full.txt with complete documentation in a single Markdown file. This is a single-ingestion point for AI agents to understand your entire platform.');

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.08, findings, recommendations };
}

function analyzeSdkQuality(ctx: SiteContext): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // Check for SDK/package references
  const allText = ctx.allPages.map(p => cheerio.load(p.html)('body').text()).join(' ');
  const hasNpm = /npm install|yarn add|pnpm add/i.test(allText);
  const hasPip = /pip install/i.test(allText);
  const hasGo = /go get /i.test(allText);
  const packageManagers = [hasNpm && 'npm', hasPip && 'pip', hasGo && 'go'].filter(Boolean);

  findings.push({
    check: 'SDK/package availability',
    status: packageManagers.length >= 2 ? 'pass' : packageManagers.length >= 1 ? 'partial' : 'fail',
    details: packageManagers.length > 0 ? `Packages for: ${packageManagers.join(', ')}` : 'No package manager install commands found',
    points: packageManagers.length >= 2 ? 25 : packageManagers.length >= 1 ? 15 : 0,
    maxPoints: 25,
  });
  if (packageManagers.length < 2) recommendations.push('Publish SDKs on standard registries (npm, PyPI, Maven). Make installation a one-line command. Multi-language SDK availability is critical for agent adoption.');

  // TypeScript types mentioned
  const hasTypeScript = /typescript|\.d\.ts|type\s+\w+\s*=|interface\s+\w+/i.test(allText);
  findings.push({
    check: 'TypeScript type definitions',
    status: hasTypeScript ? 'pass' : 'fail',
    details: hasTypeScript ? 'TypeScript type support detected' : 'No TypeScript types references found',
    points: hasTypeScript ? 20 : 0,
    maxPoints: 20,
  });
  if (!hasTypeScript) recommendations.push('Provide TypeScript type definitions. Strong typing is critical for agent consumption — types guide code generation and prevent errors.');

  // README/install documentation
  const hasInstallGuide = ctx.allPages.some(p => {
    const $ = cheerio.load(p.html);
    return /installation|getting started|quick start|setup/i.test($('h1, h2, h3').text());
  });
  findings.push({
    check: 'Installation guide',
    status: hasInstallGuide ? 'pass' : 'fail',
    details: hasInstallGuide ? 'Installation guide found' : 'No installation guide detected',
    points: hasInstallGuide ? 15 : 0,
    maxPoints: 15,
  });

  // Semantic versioning signals
  const hasSemver = /v?\d+\.\d+\.\d+/i.test(allText);
  findings.push({
    check: 'Semantic versioning',
    status: hasSemver ? 'pass' : 'partial',
    details: hasSemver ? 'Version numbers detected (SemVer pattern)' : 'No version numbers detected',
    points: hasSemver ? 15 : 5,
    maxPoints: 15,
  });

  // Error handling in SDKs
  const hasErrorTypes = /Error|Exception|error code|error handling|try.*catch|except/i.test(allText);
  findings.push({
    check: 'Error handling documentation',
    status: hasErrorTypes ? 'pass' : 'fail',
    details: hasErrorTypes ? 'Error handling patterns documented' : 'No error handling documentation found',
    points: hasErrorTypes ? 15 : 0,
    maxPoints: 15,
  });

  // Naming conventions consistency
  const hasConsistentNaming = /camelCase|snake_case|PascalCase|naming convention/i.test(allText);
  findings.push({
    check: 'Naming convention documentation',
    status: hasConsistentNaming ? 'pass' : 'partial',
    details: hasConsistentNaming ? 'Naming conventions documented' : 'No explicit naming conventions',
    points: hasConsistentNaming ? 10 : 3,
    maxPoints: 10,
  });

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.08, findings, recommendations };
}

function analyzeAuthSimplicity(ctx: SiteContext): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];
  const allText = ctx.allPages.map(p => cheerio.load(p.html)('body').text()).join(' ');

  // API key availability
  const hasApiKey = /api[- ]key|api_key|apikey|bearer token|authorization: bearer/i.test(allText);
  findings.push({
    check: 'API key authentication',
    status: hasApiKey ? 'pass' : 'fail',
    details: hasApiKey ? 'API key authentication referenced' : 'No API key authentication found',
    points: hasApiKey ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasApiKey) recommendations.push('Offer simple API key authentication for basic use. Agents need non-interactive auth — OAuth-only flows create dead ends for autonomous AI agents.');

  // Auth documentation
  const hasAuthDocs = ctx.allPages.some(p => /auth|authentication|api[- ]key|security/i.test(p.url));
  findings.push({
    check: 'Dedicated authentication docs',
    status: hasAuthDocs ? 'pass' : 'fail',
    details: hasAuthDocs ? 'Auth documentation page found' : 'No dedicated auth docs page',
    points: hasAuthDocs ? 20 : 0,
    maxPoints: 20,
  });

  // Auth code example
  const hasAuthExample = ctx.allPages.some(p => {
    const $ = cheerio.load(p.html);
    return $('pre, code').toArray().some(el => /authorization|api[_-]key|bearer|token/i.test($(el).text()));
  });
  findings.push({
    check: 'Authentication code example',
    status: hasAuthExample ? 'pass' : 'fail',
    details: hasAuthExample ? 'Auth code example found' : 'No authentication code example',
    points: hasAuthExample ? 20 : 0,
    maxPoints: 20,
  });
  if (!hasAuthExample) recommendations.push('Include working code snippets for authentication. Show the complete flow from getting a key to making an authenticated request.');

  // Free tier / sandbox
  const hasFreeTier = /free tier|free plan|sandbox|test mode|trial|no credit card/i.test(allText);
  findings.push({
    check: 'Free tier or sandbox environment',
    status: hasFreeTier ? 'pass' : 'fail',
    details: hasFreeTier ? 'Free/sandbox tier mentioned' : 'No free tier or sandbox mentioned',
    points: hasFreeTier ? 20 : 0,
    maxPoints: 20,
  });
  if (!hasFreeTier) recommendations.push('Offer a free tier or sandbox environment without requiring a credit card. This enables instant agent access and zero-friction onboarding.');

  // Token management docs
  const hasTokenDocs = /token refresh|token expiration|token rotation|revoke.*token|refresh.*token/i.test(allText);
  findings.push({
    check: 'Token management documentation',
    status: hasTokenDocs ? 'pass' : 'partial',
    details: hasTokenDocs ? 'Token management documented' : 'No token lifecycle documentation',
    points: hasTokenDocs ? 15 : 5,
    maxPoints: 15,
  });

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.08, findings, recommendations };
}

function analyzeQuickstartGuide(ctx: SiteContext): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // Quickstart exists
  const quickstartPages = ctx.allPages.filter(p =>
    /quickstart|quick-start|getting-started|get-started|hello-world/i.test(p.url)
  );
  const hasQuickstart = quickstartPages.length > 0;
  findings.push({
    check: 'Quickstart/Getting Started page exists',
    status: hasQuickstart ? 'pass' : 'fail',
    details: hasQuickstart ? `${quickstartPages.length} quickstart page(s) found` : 'No quickstart page detected',
    points: hasQuickstart ? 20 : 0,
    maxPoints: 20,
  });
  if (!hasQuickstart) recommendations.push('Create a dedicated quickstart/getting-started page. This is the single most important page for AEO — it answers the question every agent asks: "How do I get this working in under 5 minutes?"');

  // Check quickstart quality
  if (hasQuickstart) {
    const $ = cheerio.load(quickstartPages[0].html);
    const text = $('body').text();

    // Prerequisites
    const hasPrereqs = /prerequisite|requirement|before you begin|you'll need|you will need/i.test(text);
    findings.push({
      check: 'Prerequisites listed',
      status: hasPrereqs ? 'pass' : 'fail',
      details: hasPrereqs ? 'Prerequisites section found' : 'No prerequisites listed',
      points: hasPrereqs ? 15 : 0,
      maxPoints: 15,
    });

    // Numbered steps
    const hasNumberedSteps = $('ol').length > 0 || /step\s*\d|step\s*1/i.test(text);
    findings.push({
      check: 'Numbered step-by-step format',
      status: hasNumberedSteps ? 'pass' : 'fail',
      details: hasNumberedSteps ? 'Step-by-step format found' : 'No numbered steps detected',
      points: hasNumberedSteps ? 15 : 0,
      maxPoints: 15,
    });

    // Copy-paste commands
    const codeBlocks = $('pre, code').length;
    findings.push({
      check: 'Copy-paste ready commands',
      status: codeBlocks >= 3 ? 'pass' : codeBlocks >= 1 ? 'partial' : 'fail',
      details: `${codeBlocks} code block(s) in quickstart`,
      points: codeBlocks >= 3 ? 20 : codeBlocks >= 1 ? 10 : 0,
      maxPoints: 20,
    });

    // Expected output
    const hasOutput = /output|response|result|you should see|expected|returns/i.test(text);
    findings.push({
      check: 'Expected output shown',
      status: hasOutput ? 'pass' : 'fail',
      details: hasOutput ? 'Expected output shown' : 'No expected output found',
      points: hasOutput ? 15 : 0,
      maxPoints: 15,
    });

    // Multiple platform paths
    const multiPlatform = ctx.allPages.filter(p => /quickstart|getting-started/i.test(p.url));
    findings.push({
      check: 'Multiple language/platform quickstarts',
      status: multiPlatform.length >= 3 ? 'pass' : multiPlatform.length >= 2 ? 'partial' : 'fail',
      details: `${multiPlatform.length} quickstart variation(s)`,
      points: multiPlatform.length >= 3 ? 15 : multiPlatform.length >= 2 ? 8 : 3,
      maxPoints: 15,
    });
  } else {
    // No quickstart — give zero scores for sub-checks
    ['Prerequisites', 'Numbered steps', 'Code blocks', 'Expected output', 'Multi-platform'].forEach(check => {
      findings.push({ check, status: 'fail', details: 'N/A — no quickstart page', points: 0, maxPoints: 16 });
    });
  }

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.10, findings, recommendations };
}

function analyzeErrorMessages(ctx: SiteContext): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];
  const allText = ctx.allPages.map(p => cheerio.load(p.html)('body').text()).join(' ');

  // Error documentation
  const hasErrorDocs = /error code|error response|error handling|troubleshooting/i.test(allText);
  findings.push({
    check: 'Error documentation exists',
    status: hasErrorDocs ? 'pass' : 'fail',
    details: hasErrorDocs ? 'Error documentation found' : 'No error documentation',
    points: hasErrorDocs ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasErrorDocs) recommendations.push('Create comprehensive error documentation with all error codes, their meanings, and resolution steps. AI agents cannot "figure out" ambiguous errors.');

  // HTTP status codes
  const hasStatusCodes = /400|401|403|404|429|500|status code/i.test(allText);
  findings.push({
    check: 'HTTP status codes documented',
    status: hasStatusCodes ? 'pass' : 'fail',
    details: hasStatusCodes ? 'HTTP status codes referenced' : 'No HTTP status codes found',
    points: hasStatusCodes ? 20 : 0,
    maxPoints: 20,
  });

  // Actionable error messages
  const hasActionableErrors = /how to fix|resolution|solution|to resolve|try.*instead/i.test(allText);
  findings.push({
    check: 'Actionable resolution guidance',
    status: hasActionableErrors ? 'pass' : 'fail',
    details: hasActionableErrors ? 'Resolution guidance found in error docs' : 'No resolution guidance in error documentation',
    points: hasActionableErrors ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasActionableErrors) recommendations.push('Add resolution guidance to all error documentation. Each error should explain what went wrong AND how to fix it. Agents act on recovery hints automatically.');

  // Retry guidance
  const hasRetryGuidance = /retry|retry-after|backoff|rate limit.*retry|exponential backoff/i.test(allText);
  findings.push({
    check: 'Retry guidance for rate limits',
    status: hasRetryGuidance ? 'pass' : 'fail',
    details: hasRetryGuidance ? 'Retry guidance found' : 'No retry guidance',
    points: hasRetryGuidance ? 15 : 0,
    maxPoints: 15,
  });

  // Structured error format
  const hasStructuredErrors = /error_code|error_type|"message"|"error"|"detail"|"status"/i.test(allText);
  findings.push({
    check: 'Structured error format (JSON)',
    status: hasStructuredErrors ? 'pass' : 'partial',
    details: hasStructuredErrors ? 'Structured error format patterns found' : 'No structured error format detected',
    points: hasStructuredErrors ? 15 : 5,
    maxPoints: 15,
  });

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.06, findings, recommendations };
}

function analyzeChangelogVersioning(ctx: SiteContext): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // Changelog page
  const changelogPages = ctx.allPages.filter(p =>
    /changelog|release|what's-new|whats-new|updates/i.test(p.url)
  );
  findings.push({
    check: 'Changelog page exists',
    status: changelogPages.length > 0 ? 'pass' : 'fail',
    details: changelogPages.length > 0 ? 'Changelog page found' : 'No changelog page detected',
    points: changelogPages.length > 0 ? 30 : 0,
    maxPoints: 30,
  });
  if (changelogPages.length === 0) recommendations.push('Create a dedicated changelog page. AI agents need to understand version history, breaking changes, and migration paths.');

  // Version numbers
  const allText = ctx.allPages.map(p => cheerio.load(p.html)('body').text()).join(' ');
  const versionNumbers = allText.match(/v?\d+\.\d+\.\d+/g) || [];
  findings.push({
    check: 'Semantic version numbers',
    status: versionNumbers.length >= 3 ? 'pass' : versionNumbers.length >= 1 ? 'partial' : 'fail',
    details: `${versionNumbers.length} version number(s) found`,
    points: versionNumbers.length >= 3 ? 20 : versionNumbers.length >= 1 ? 10 : 0,
    maxPoints: 20,
  });

  // Breaking change warnings
  const hasBreakingChanges = /breaking change|deprecat|migration guide|upgrade guide|sunset/i.test(allText);
  findings.push({
    check: 'Breaking change / deprecation notices',
    status: hasBreakingChanges ? 'pass' : 'partial',
    details: hasBreakingChanges ? 'Breaking change/deprecation patterns found' : 'No breaking change documentation',
    points: hasBreakingChanges ? 25 : 10,
    maxPoints: 25,
  });

  // Migration guides
  const hasMigration = ctx.allPages.some(p => /migrat|upgrade/i.test(p.url));
  findings.push({
    check: 'Migration/upgrade guides',
    status: hasMigration ? 'pass' : 'fail',
    details: hasMigration ? 'Migration guide found' : 'No migration guide detected',
    points: hasMigration ? 25 : 0,
    maxPoints: 25,
  });

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.05, findings, recommendations };
}

function analyzeMcpServer(ctx: SiteContext): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];
  const allText = ctx.allPages.map(p => cheerio.load(p.html)('body').text()).join(' ');

  // MCP server presence
  const hasMcp = /mcp|model context protocol|mcp server|mcp-server/i.test(allText);
  findings.push({
    check: 'MCP server referenced',
    status: hasMcp ? 'pass' : 'fail',
    details: hasMcp ? 'MCP server references found' : 'No MCP server references',
    points: hasMcp ? 35 : 0,
    maxPoints: 35,
  });
  if (!hasMcp) recommendations.push('Build and publish an MCP (Model Context Protocol) server for your platform. If your platform has an MCP server, AI agents can discover it dynamically. Without one, agents rely solely on pre-trained knowledge. This is becoming the equivalent of having a website in the early internet era.');

  // MCP documentation
  const hasMcpDocs = ctx.allPages.some(p => /mcp/i.test(p.url));
  findings.push({
    check: 'MCP documentation page',
    status: hasMcpDocs ? 'pass' : hasMcp ? 'partial' : 'fail',
    details: hasMcpDocs ? 'MCP documentation page found' : 'No dedicated MCP documentation',
    points: hasMcpDocs ? 20 : hasMcp ? 10 : 0,
    maxPoints: 20,
  });

  // AI agent integration documentation
  const hasAgentDocs = /ai agent|coding assistant|copilot|cursor|claude code|windsurf|agentic/i.test(allText);
  findings.push({
    check: 'AI agent integration docs',
    status: hasAgentDocs ? 'pass' : 'fail',
    details: hasAgentDocs ? 'AI agent integration references found' : 'No AI agent integration docs',
    points: hasAgentDocs ? 20 : 0,
    maxPoints: 20,
  });
  if (!hasAgentDocs) recommendations.push('Create documentation specifically for AI coding agents (Cursor, Claude Code, GitHub Copilot). Include MCP setup instructions, AI rules files, and agent-specific guides.');

  // AI rules files (.cursor, CLAUDE.md, etc.)
  const hasAiRules = /\.cursor|claude\.md|agents\.md|\.mdc|ai[- ]rules|cursor[- ]rules/i.test(allText);
  findings.push({
    check: 'AI rules/context files',
    status: hasAiRules ? 'pass' : 'fail',
    details: hasAiRules ? 'AI rules/context file references found' : 'No AI rules files referenced',
    points: hasAiRules ? 25 : 0,
    maxPoints: 25,
  });
  if (!hasAiRules) recommendations.push('Create AI rules files (.cursor/rules, CLAUDE.md) with platform-specific best practices. These files automatically inject your best practices into AI coding assistants when they detect your platform in a project.');

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.08, findings, recommendations };
}

function analyzeIntegrationGuides(ctx: SiteContext): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];
  const allText = ctx.allPages.map(p => cheerio.load(p.html)('body').text()).join(' ');

  // Integration pages
  const integrationPages = ctx.allPages.filter(p => /integrat|connect|plugin|extension|third-party/i.test(p.url));
  findings.push({
    check: 'Integration guide pages',
    status: integrationPages.length >= 3 ? 'pass' : integrationPages.length >= 1 ? 'partial' : 'fail',
    details: `${integrationPages.length} integration page(s) found`,
    points: integrationPages.length >= 3 ? 25 : integrationPages.length >= 1 ? 12 : 0,
    maxPoints: 25,
  });
  if (integrationPages.length < 3) recommendations.push('Create integration guides for popular frameworks and services. Document step-by-step setup with code examples for each integration.');

  // Framework mentions
  const frameworks = ['Next.js', 'React', 'Vue', 'Angular', 'Django', 'Rails', 'Laravel', 'Express', 'FastAPI', 'Flask', 'Spring', 'Node.js'];
  const mentionedFrameworks = frameworks.filter(f => new RegExp(f.replace('.', '\\.'), 'i').test(allText));
  findings.push({
    check: 'Framework integration coverage',
    status: mentionedFrameworks.length >= 5 ? 'pass' : mentionedFrameworks.length >= 3 ? 'partial' : 'fail',
    details: `${mentionedFrameworks.length} framework(s) mentioned: ${mentionedFrameworks.join(', ') || 'none'}`,
    points: mentionedFrameworks.length >= 5 ? 20 : mentionedFrameworks.length >= 3 ? 12 : mentionedFrameworks.length >= 1 ? 5 : 0,
    maxPoints: 20,
  });
  if (mentionedFrameworks.length < 5) recommendations.push('Add integration guides for more frameworks. AI agents recommend platforms with broad framework support more frequently.');

  // Webhook documentation
  const hasWebhooks = /webhook|callback url|event notification/i.test(allText);
  findings.push({
    check: 'Webhook documentation',
    status: hasWebhooks ? 'pass' : 'partial',
    details: hasWebhooks ? 'Webhook documentation found' : 'No webhook documentation',
    points: hasWebhooks ? 15 : 5,
    maxPoints: 15,
  });

  // SDK ecosystem
  const sdkLanguages = ['JavaScript', 'TypeScript', 'Python', 'Go', 'Java', 'Ruby', 'PHP', 'C#', '.NET', 'Rust', 'Swift', 'Kotlin'];
  const mentionedSdks = sdkLanguages.filter(l => new RegExp(l.replace('.', '\\.'), 'i').test(allText));
  findings.push({
    check: 'SDK language ecosystem',
    status: mentionedSdks.length >= 4 ? 'pass' : mentionedSdks.length >= 2 ? 'partial' : 'fail',
    details: `${mentionedSdks.length} SDK language(s): ${mentionedSdks.join(', ') || 'none'}`,
    points: mentionedSdks.length >= 4 ? 20 : mentionedSdks.length >= 2 ? 10 : mentionedSdks.length >= 1 ? 5 : 0,
    maxPoints: 20,
  });

  // Community/open-source signals
  const hasCommunity = /github|open source|community|contributing|discord|slack channel/i.test(allText);
  findings.push({
    check: 'Community/open-source presence',
    status: hasCommunity ? 'pass' : 'fail',
    details: hasCommunity ? 'Community/open-source references found' : 'No community/open-source signals',
    points: hasCommunity ? 20 : 0,
    maxPoints: 20,
  });

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.08, findings, recommendations };
}

function analyzeMachineReadableSitemaps(ctx: SiteContext): CategoryScore {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  // robots.txt
  const hasRobotsTxt = ctx.robotsTxt !== null;
  findings.push({
    check: 'robots.txt exists',
    status: hasRobotsTxt ? 'pass' : 'fail',
    details: hasRobotsTxt ? 'robots.txt found' : 'No robots.txt',
    points: hasRobotsTxt ? 15 : 0,
    maxPoints: 15,
  });

  // AI bot access
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
    if (!allAllowed) recommendations.push(`CRITICAL: Unblock AI crawlers in robots.txt. Currently blocked: ${blockedBots.join(', ')}. These bots index content for ChatGPT, Claude, Perplexity, and Google AI Overviews.`);

    // Sitemap reference in robots.txt
    const hasSitemapRef = /sitemap:/i.test(ctx.robotsTxt);
    findings.push({
      check: 'Sitemap referenced in robots.txt',
      status: hasSitemapRef ? 'pass' : 'fail',
      details: hasSitemapRef ? 'Sitemap directive found' : 'No Sitemap directive in robots.txt',
      points: hasSitemapRef ? 10 : 0,
      maxPoints: 10,
    });
  } else {
    findings.push({
      check: 'AI bot access',
      status: 'partial',
      details: 'Cannot check — no robots.txt',
      points: 10,
      maxPoints: 20,
    });
    findings.push({
      check: 'Sitemap in robots.txt',
      status: 'fail',
      details: 'No robots.txt',
      points: 0,
      maxPoints: 10,
    });
  }

  // Check for llms.txt (cross-reference)
  findings.push({
    check: 'llms.txt present',
    status: ctx.llmsTxt ? 'pass' : 'fail',
    details: ctx.llmsTxt ? 'llms.txt available' : 'No llms.txt',
    points: ctx.llmsTxt ? 15 : 0,
    maxPoints: 15,
  });

  // Breadcrumb schema
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

  // Semantic HTML navigation
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

  // Clean URL structure
  const cleanUrls = ctx.allPages.filter(p => {
    const path = new URL(p.url).pathname;
    return /^\/[\w\-\/]*$/.test(path) && path.length < 80;
  });
  const cleanRatio = ctx.allPages.length > 0 ? cleanUrls.length / ctx.allPages.length : 0;
  findings.push({
    check: 'Clean URL structure',
    status: cleanRatio >= 0.8 ? 'pass' : cleanRatio >= 0.5 ? 'partial' : 'fail',
    details: `${Math.round(cleanRatio * 100)}% of URLs are clean and hierarchical`,
    points: cleanRatio >= 0.8 ? 15 : cleanRatio >= 0.5 ? 8 : 0,
    maxPoints: 15,
  });

  const totalPoints = findings.reduce((s, f) => s + f.points, 0);
  const maxPoints = findings.reduce((s, f) => s + f.maxPoints, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  return { score, grade: getGrade(score), weight: 0.07, findings, recommendations };
}
