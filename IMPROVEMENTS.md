# RankAI: Comprehensive Improvement Plan

## Project Context

RankAI is a Next.js 16 analysis tool that scores websites on **GEO** (Generative Engine Optimization — how well content surfaces in AI-generated answers) and **AEO** (Agentic Engine Optimization — how well a platform enables autonomous AI agents to integrate with it). It crawls pages, runs heuristic checks across 22 categories, computes weighted scores, and generates Claude-powered strategic insights.

### Current Architecture

```
src/
├── app/
│   ├── api/analyze/route.ts        # POST endpoint — orchestrates entire pipeline
│   ├── api/auth/[...nextauth]/     # NextAuth Google OAuth
│   ├── globals.css                 # Design system (CSS variables, animations)
│   ├── layout.tsx                  # Root layout (Geist fonts, theme, SessionProvider)
│   ├── page.tsx                    # Entire UI — single-page app
│   └── providers.tsx               # NextAuth SessionProvider wrapper
├── components/
│   ├── auth-button.tsx             # Google sign-in/out
│   ├── category-card.tsx           # Expandable category with findings
│   ├── recommendation-card.tsx     # Priority-colored recommendation display
│   ├── score-ring.tsx              # Animated SVG circular score gauge
│   └── theme-toggle.tsx            # Dark/light mode toggle
├── lib/
│   ├── analyzers/
│   │   ├── geo-analyzer.ts         # 10 GEO scoring functions (cheerio-based)
│   │   ├── aeo-analyzer.ts         # 12 AEO scoring functions (site-wide)
│   │   ├── scoring.ts              # Score aggregation, recommendations, buildSiteAnalysis
│   │   └── ai-insights.ts          # Claude API call + fallback template
│   ├── crawler/index.ts            # crawlPage, discoverPages, fetchRobotsTxt, fetchLlmsTxt, fetchOpenApiSpec
│   ├── types.ts                    # All interfaces, GEO_WEIGHTS, AEO_WEIGHTS, getGrade()
│   └── auth.ts                     # NextAuth config (Google provider)
```

### Tech Stack
- Next.js 16.1.6, React 19.2.3, TypeScript 5
- Tailwind CSS 4, Geist fonts, Lucide icons
- Cheerio 1.0 for HTML parsing, Zod 4 for validation
- Anthropic SDK for Claude AI insights
- NextAuth v5 beta for Google OAuth
- `motion` package is installed but unused

### Design System
- Dark mode default with light mode toggle
- CSS variables for all colors (--color-bg, --color-accent, --color-text, etc.)
- Accent: indigo (#6366f1), GEO: purple (#a78bfa), AEO: blue (#60a5fa)
- Score colors: pass green (#34d399), warn yellow (#fbbf24), fail red (#f87171)
- Animations: scoreRingFill, fadeInUp, fadeIn, countUp, slideInRight, stepperPulse (all respect prefers-reduced-motion)

### Current Scoring Model
- GEO: 10 categories, weights sum to 1.0, each category scored 0–100
- AEO: 12 categories, weights sum to 1.0, each category scored 0–100
- Overall = `round(GEO * 0.5 + AEO * 0.5)`
- Grades: 90+ A+, 80+ A, 70+ B, 60+ C, 50+ D, <50 F
- Crawls max 10 pages, 5 concurrent, 15s timeout per page

---

## Changes to Implement

Everything below should be implemented following existing code patterns, design system, and conventions. Do not add unnecessary abstractions, comments, or documentation files. Do not refactor code that isn't being changed. Preserve the existing visual design language — same color palette, spacing patterns, and component architecture.

---

### 1. Site-Type Detection & Adaptive Scoring

**Problem:** AEO scoring assumes every site is a developer API platform. Categories like "API Documentation" (12%), "SDK Quality" (8%), "MCP Server" (8%), "Code Examples" (10%), and "Auth Simplicity" (8%) are meaningless for restaurants, dental practices, e-commerce stores, and content publishers. This causes ~90% of sites to score near 0 on AEO, which drags overall score to ~35 regardless of excellent content. The tool feels broken for non-tech sites.

**What to build:**

#### a) Site type classifier (`src/lib/analyzers/site-classifier.ts`)

Create a new file that exports a function `classifySite(pages, robotsTxt, openApiSpec, origin)` that returns one of these site types:

```typescript
type SiteType = 'saas-api' | 'ecommerce' | 'local-business' | 'content-publisher' | 'general';
```

Detection heuristics (check in order, first match wins):
- **`saas-api`**: Has OpenAPI spec OR 3+ pages matching `/docs|/api|/reference|/sdk` OR text mentions "API key" + "endpoint" + ("SDK" or "documentation")
- **`ecommerce`**: Has Product/Offer schema OR pages matching `/products|/shop|/cart|/checkout` OR text mentions "add to cart" + ("price" or "$")
- **`local-business`**: Has LocalBusiness/Restaurant/MedicalBusiness schema OR pages matching `/locations|/contact|/about-us` with address patterns OR NAP (Name/Address/Phone) detected on multiple pages
- **`content-publisher`**: Has 5+ pages with Article/BlogPosting/NewsArticle schema OR pages matching `/blog|/articles|/news|/posts` with ratio > 40% of total pages
- **`general`**: Fallback

#### b) Adaptive AEO categories per site type

Instead of the current 12 developer-focused AEO categories for all sites, swap categories based on site type. Create a new file `src/lib/analyzers/aeo-adaptive.ts` that wraps the existing AEO analyzer:

**For `saas-api`** — Keep existing 12 AEO categories unchanged.

**For `ecommerce`** — Replace AEO categories with:
| Category | Weight | What to check |
|----------|--------|---------------|
| productSchema | 0.15 | Product/Offer JSON-LD with price, availability, reviews, images, SKU |
| reviewMarkup | 0.12 | AggregateRating schema, individual Review schema, star ratings visible |
| inventorySignals | 0.08 | Availability in schema (InStock/OutOfStock), price currency, shipping info |
| merchantFeed | 0.10 | Google Merchant Center signals: `<link rel="canonical">`, product structured data completeness |
| comparisonContent | 0.12 | Comparison tables, "vs" pages, feature matrices — the content type most cited by AI for purchase decisions |
| customerEvidence | 0.10 | Testimonials, review count, UGC signals, trust badges (BBB, TrustPilot, etc.) |
| purchaseSimplicity | 0.08 | Clear CTAs, pricing visible, no login-wall before pricing, shipping/return policy findable |
| llmsTxt | 0.05 | Same check as current |
| machineReadableSitemaps | 0.07 | Same check as current |
| faqContent | 0.08 | FAQ schema + FAQ sections on product pages, return/shipping Q&A |
| categoryTaxonomy | 0.05 | BreadcrumbList schema, clean category URL hierarchy (/category/subcategory/product) |

**For `local-business`** — Replace AEO categories with:
| Category | Weight | What to check |
|----------|--------|---------------|
| localSchema | 0.15 | LocalBusiness (or subtype) JSON-LD with name, address, phone, hours, geo coordinates |
| napConsistency | 0.12 | Name/Address/Phone appears consistently across pages, matches schema |
| reviewPresence | 0.12 | AggregateRating schema, review count, Google review link/widget |
| servicePages | 0.10 | Dedicated pages per service offered (e.g., /services/teeth-whitening), each with unique content |
| locationSignals | 0.10 | Address in footer, Google Maps embed or link, service area mentions, geo-targeted content |
| contactAccessibility | 0.08 | Phone number clickable (tel: link), contact form, multiple contact methods, hours displayed |
| trustSignals | 0.08 | Certifications, licenses, awards, BBB badge, industry association membership, team/about page |
| llmsTxt | 0.05 | Same check as current |
| machineReadableSitemaps | 0.07 | Same check as current |
| localContent | 0.08 | Location-specific content, neighborhood mentions, local event references, community involvement |
| photoEvidence | 0.05 | Images with descriptive alt text showing the business, team photos, portfolio/gallery |

**For `content-publisher`** — Replace AEO categories with:
| Category | Weight | What to check |
|----------|--------|---------------|
| authorCredentials | 0.15 | Person schema for authors, author bio pages, bylines on articles, social profile links |
| contentTaxonomy | 0.12 | Clear category/tag structure, BreadcrumbList, topic cluster organization |
| publishingCadence | 0.10 | datePublished spread across recent months, multiple articles from current year, consistent output |
| syndicationReadiness | 0.10 | RSS/Atom feeds present, clean excerpt generation, OG tags complete on every article |
| originalReporting | 0.12 | First-person experience signals, proprietary data, original quotes, "our research/analysis" patterns |
| sourceCitation | 0.10 | External reference links in articles, "according to" patterns, footnotes/endnotes |
| llmsTxt | 0.05 | Same check as current |
| machineReadableSitemaps | 0.07 | Same check as current |
| archiveDiscoverability | 0.07 | Archive/category pages, search functionality, related posts links, previous/next navigation |
| multimediaIntegration | 0.07 | Images with alt text, embedded video, infographics, data visualizations per article |
| newsletterPresence | 0.05 | Email signup form, newsletter archive, subscriber social proof |

**For `general`** — Use a simplified AEO with the 5 most universally applicable categories from current AEO (documentationStructure, llmsTxt, machineReadableSitemaps, plus adapted versions of content quality and trust signals).

#### c) Adaptive GEO/AEO weight split

Instead of hardcoded 50/50, adjust per site type:
- `saas-api`: GEO 50%, AEO 50% (current behavior)
- `ecommerce`: GEO 55%, AEO 45%
- `local-business`: GEO 65%, AEO 35%
- `content-publisher`: GEO 70%, AEO 30%
- `general`: GEO 60%, AEO 40%

#### d) Integration points

- Call `classifySite()` in `src/app/api/analyze/route.ts` after crawling, before analysis
- Pass site type to AEO analysis to select correct category set
- Pass site type to `buildSiteAnalysis()` to apply correct GEO/AEO weight split
- Add `siteType: SiteType` to the `SiteAnalysis` interface in `types.ts`
- Display detected site type in the UI results (small badge near the URL bar, e.g., "Detected: E-commerce")

---

### 2. Add E-E-A-T Scoring Category to GEO

**Problem:** Google's Experience, Expertise, Authoritativeness, Trustworthiness framework is a primary signal for both traditional search and AI Overviews, but isn't measured at all.

**What to build:**

Add an 11th GEO category `eeatSignals` to `geo-analyzer.ts` with weight **0.10**. Redistribute existing weights to accommodate (reduce schemaMarkup from 0.15 to 0.13, citationWorthiness from 0.15 to 0.13, contentFreshness from 0.10 to 0.08, metaInformation from 0.05 to 0.03). All GEO weights must still sum to 1.0.

Checks for `eeatSignals`:
| Check | Points | How to detect |
|-------|--------|---------------|
| Author identification | 15 | Person schema with name, OR visible byline pattern ("By [Name]", "Author: [Name]"), OR `[rel="author"]` link |
| Author bio/credentials | 15 | Author page linked from article, OR bio section with credential keywords ("PhD", "certified", "years of experience", "founder", "CEO") |
| About page | 15 | Page matching `/about` exists in crawled pages with substantive content (300+ words) |
| Trust indicators | 15 | SSL (always pass since we fetch via HTTPS), privacy policy page, terms page detected in footer links |
| Organization identity | 15 | Organization schema with logo + sameAs social links, OR visible company info (address, registration, founding year) |
| External validation | 15 | Links from/to known authority domains, press mentions patterns ("featured in", "as seen on"), award/certification mentions |
| Contact transparency | 10 | Contact page or form exists, email address visible, phone number visible, physical address present |

Update `GEO_WEIGHTS` in `types.ts`, `GEOAnalysis` interface, all references in `scoring.ts` (calculateGEOScore, aggregateGEOFromPages, generateRecommendations), and the UI category lists in `page.tsx`.

---

### 3. Streaming Analysis Progress (Replace Fake Phase Stepper)

**Problem:** The current loading UX fakes progress with a `setInterval` that advances phases every 3 seconds regardless of actual analysis state. This means phases can show "AI Insights" while still crawling, or "Crawling" after everything is done.

**What to build:**

Convert `POST /api/analyze` to a streaming response using the Web Streams API (no external dependencies needed). The endpoint should emit newline-delimited JSON events as the analysis progresses through real phases.

#### a) Server side (`src/app/api/analyze/route.ts`)

Replace the current `NextResponse.json(analysis)` return with a `ReadableStream` that emits events:

```typescript
// Event format (one JSON object per line):
{ "type": "phase", "phase": "crawling", "detail": "Fetching https://example.com" }
{ "type": "phase", "phase": "crawling", "detail": "Discovered 8 pages" }
{ "type": "phase", "phase": "crawling", "detail": "Crawling page 3/8" }
{ "type": "phase", "phase": "analyzing-geo", "detail": "Scoring content structure" }
{ "type": "phase", "phase": "analyzing-aeo", "detail": "Evaluating 11 categories" }
{ "type": "phase", "phase": "generating-insights", "detail": "Claude is analyzing your results" }
{ "type": "result", "data": <full SiteAnalysis JSON> }
{ "type": "error", "message": "Failed to fetch: HTTP 403" }
```

Set response headers:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

Emit events at each real checkpoint in the pipeline: after main page crawl, after page discovery (with count), after each batch of sub-pages, after GEO analysis, after AEO analysis, after AI insights generation, and finally the full result.

#### b) Client side (`src/app/page.tsx`)

Replace the `fetch` + `setInterval` in `handleAnalyze` with a streaming reader:

```typescript
const response = await fetch('/api/analyze', { method: 'POST', ... });
const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const lines = decoder.decode(value).split('\n').filter(Boolean);
  for (const line of lines) {
    const event = JSON.parse(line);
    if (event.type === 'phase') {
      setPhase(event.phase);
      setPhaseDetail(event.detail); // new state
    } else if (event.type === 'result') {
      setAnalysis(event.data);
      setPhase('done');
    } else if (event.type === 'error') {
      setError(event.message);
      setPhase('error');
    }
  }
}
```

Add a new `phaseDetail` state and display it as the subtitle text under the active step in the stepper (replacing the current hardcoded `p.desc`).

Remove the `setInterval` / `clearInterval` logic entirely.

---

### 4. Shareable Analysis Results

**Problem:** Analysis results exist only in React state and are lost on page refresh. Users can't share results with stakeholders, bookmark them, or compare across sessions.

**What to build:**

#### a) Result persistence via URL hash encoding

After analysis completes, encode a compressed summary into the URL hash so the page is shareable and bookmarkable. Use `btoa` / `atob` with a compact JSON payload containing scores (not full findings — those are too large).

Create a shareable summary type:
```typescript
interface ShareableResult {
  u: string;    // url
  t: string;    // crawledAt timestamp
  p: number;    // pagesAnalyzed
  st: string;   // siteType
  g: number;    // geoScore
  a: number;    // aeoScore
  o: number;    // overallScore
  gc: Record<string, number>;  // geo category scores (abbreviated keys)
  ac: Record<string, number>;  // aeo category scores (abbreviated keys)
}
```

On analysis completion: `window.history.replaceState(null, '', '#r=' + btoa(JSON.stringify(shareableResult)))`.

On page load: if `window.location.hash` starts with `#r=`, decode it and display a "shared result" view showing the scores and category breakdowns (without the full findings/recommendations, since those are too large to encode). Show a banner: "This is a shared snapshot. Analyze again for full details."

#### b) Copy-to-clipboard share button

Add a share button (lucide `Share2` icon) in the URL bar area (next to the external link). On click, copy the current URL (with hash) to clipboard and show a brief "Copied!" toast.

#### c) PDF/image export

Add an "Export Report" button (lucide `Download` icon) next to the share button. When clicked, use the browser's `window.print()` with a `@media print` stylesheet in `globals.css` that:
- Hides the nav, footer, input area, and tab navigation
- Renders all tab content sequentially (overview, GEO details, AEO details, recommendations) on one page
- Forces light theme colors for print
- Adds a header with "RankAI Analysis Report — [url] — [date]"

---

### 5. Improved Recommendation Engine

**Problem:** Recommendations are plain text descriptions. They lack the specificity and interactivity needed to actually act on them.

**What to build:**

#### a) Code snippets for schema-related recommendations

In `geo-analyzer.ts`, when generating recommendations for `schemaMarkup`, `contentFreshness` (dateModified), and `contentStructure` (FAQ section), include a `codeSnippet` field in the recommendation. Add this optional field to the `Recommendation` interface in `types.ts`:

```typescript
interface Recommendation {
  // ... existing fields
  codeSnippet?: {
    language: string;      // "json-ld" | "html" | "txt"
    code: string;          // The actual snippet
    label: string;         // "Add this to your <head>"
  };
}
```

Generate contextual snippets. Examples:
- Missing FAQPage schema → generate a FAQPage JSON-LD template
- Missing Article schema → generate an Article JSON-LD template with placeholder fields
- Missing llms.txt → generate a starter llms.txt template with the site's actual URL and title
- Missing robots.txt AI bot rules → generate the User-agent/Allow block for GPTBot, ClaudeBot, etc.

#### b) Display code snippets in RecommendationCard

Update `recommendation-card.tsx` to render the `codeSnippet` when present. Show it as a collapsible code block below the recommendation description with a "Copy" button (using `navigator.clipboard.writeText`). Style the code block using `font-mono`, `bg-bg-elevated`, `rounded-lg`, with the language label as a small badge in the top-right corner.

#### c) Impact vs Effort matrix view

Add an alternative view mode to the Recommendations tab: a visual 2x2 scatter plot (impact on Y axis, effort on X axis) with recommendations as dots. Each dot colored by type (GEO purple, AEO blue) and sized by priority. On hover, show the recommendation title in a tooltip.

Build this as a simple SVG in a new component `src/components/impact-matrix.tsx`. Place a toggle button in the Recommendations tab header to switch between "List" and "Matrix" views (default to List). The matrix axes: X = effort (low→high, left→right), Y = impact (low→high, bottom→top). Place dots based on the recommendation's `effort` and computed impact value.

---

### 6. Improve GEO Heuristic Accuracy

**Problem:** Several GEO checks have false positives/negatives that reduce scoring credibility.

#### a) Fix statistics detection (`analyzeCitationWorthiness` in `geo-analyzer.ts`)

Current regex: `/\d+(\.\d+)?%|\$[\d,]+(\.\d+)?|\d+x\s|(\d{1,3}(,\d{3})+)/g`

This matches phone numbers, years, addresses, and other non-statistical numbers. Replace with a more contextual approach:

```typescript
// Only count statistics that appear in meaningful contexts
const statPatterns = [
  /\d+(\.\d+)?%/g,                          // Percentages (always statistical)
  /\$[\d,]+(\.\d+)?(?:\s*(million|billion|M|B|K))?/g,  // Dollar amounts
  /\d+(\.\d+)?x\s+(?:more|less|faster|slower|higher|lower|increase|decrease|improvement|growth)/gi, // Multipliers with context
  /(?:increased|decreased|grew|dropped|rose|fell|improved|reduced)\s+(?:by\s+)?\d+/gi, // Change language + number
  /(?:survey|study|report|research|analysis)\s+(?:of|with|across)\s+[\d,]+/gi, // Research sample sizes
];
```

Count unique matches across all patterns. Deduplicate by position to avoid double-counting.

#### b) Fix passive voice detection (`analyzeLanguagePatterns` in `geo-analyzer.ts`)

Current regex: `/\b(?:was|were|is|are|been|being|be)\s+\w+ed\b/gi`

This has massive false positive rate. "is pleased," "are designed," "is considered" are flagged. Replace with:

```typescript
// More accurate passive detection — require a true past participle after a be-verb,
// and exclude common false positives
const passiveMatches = sentences.filter(s => {
  // Match "be-verb + past-participle" but exclude:
  // - "is/are [adjective]ed" where the word is commonly used as adjective
  const passiveRegex = /\b(?:was|were|is|are|been|being|be|been)\s+(\w+ed)\b/gi;
  const matches = s.match(passiveRegex) || [];
  const adjectiveExclusions = /(?:pleased|interested|excited|concerned|designed|based|related|required|needed|used|expected|supposed|allowed|called|named|located|certified|licensed|experienced|qualified|dedicated)/i;
  return matches.some(m => !adjectiveExclusions.test(m));
});
const passiveRatio = sentences.length > 0 ? passiveMatches.length / sentences.length : 0;
```

#### c) Improve content depth scoring

In `analyzeTopicalAuthority`, the word count check currently uses `$('body').text()` which includes nav, footer, sidebar, cookie banners, and other boilerplate. Change to extract only main content:

```typescript
const mainSelectors = 'main, article, [role="main"], .content, .post-content, .entry-content, .article-body';
const mainContent = $(mainSelectors).first();
const contentText = (mainContent.length ? mainContent : $('body')).text().replace(/\s+/g, ' ').trim();
const wordCount = contentText.split(/\s+/).length;
```

Apply the same fix in `analyzeContentUniqueness` and `analyzeLanguagePatterns` where they currently read from `$('body').text()`.

---

### 7. Increase Crawl Depth & Add Smart Page Selection

**Problem:** Max 10 pages is insufficient. Also, the current crawler just takes whatever links it finds first, which often means it crawls 10 nav/footer pages while missing the actual content pages.

**What to build:**

#### a) Increase default max pages

In `src/app/api/analyze/route.ts`, change the Zod schema default from 10 to 25:
```typescript
maxPages: z.number().min(1).max(50).default(25)
```

In `src/lib/crawler/index.ts`, update `discoverPages` default parameter from 15 to 30.

#### b) Smart page prioritization

After collecting all candidate URLs in `discoverPages`, sort them by priority before taking the top N:

```typescript
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
```

Call this in `discoverPages` before the final `slice(0, maxPages)`.

#### c) Display pages analyzed count during crawling

When emitting streaming events (from change #3), include the page count: `"Crawling page 12/25"`.

---

### 8. Fix dangerouslySetInnerHTML in Insights Tab

**Problem:** The `InsightsTab` component in `page.tsx` uses naive regex-based markdown-to-HTML conversion piped into `dangerouslySetInnerHTML`. This is both an XSS risk and produces malformed HTML (list items aren't wrapped in `<ul>`/`<ol>` tags).

**What to build:**

Install `react-markdown`:
```
npm install react-markdown
```

Replace the entire `InsightsTab` component body. Remove the regex chain and `dangerouslySetInnerHTML`. Use:

```tsx
import ReactMarkdown from 'react-markdown';

function InsightsTab({ insights }: { insights: string }) {
  return (
    <div className="p-9 rounded-xl bg-bg-card border border-border">
      {/* Keep existing header */}
      <div className="flex items-center gap-3 mb-8">
        {/* ... existing sparkles icon + title ... */}
      </div>
      <ReactMarkdown
        className="max-w-none text-[15px] leading-relaxed
          [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-text [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:tracking-tight
          [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-text [&_h3]:mt-5 [&_h3]:mb-2
          [&_p]:text-text-secondary [&_p]:mb-3 [&_p]:leading-relaxed
          [&_strong]:text-text [&_strong]:font-semibold
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:text-text-secondary
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:text-text-secondary
          [&_li]:mb-1.5 [&_li]:leading-relaxed"
      >
        {insights}
      </ReactMarkdown>
    </div>
  );
}
```

---

### 9. Competitor Comparison Mode

**Problem:** A score of "62" means nothing without context. Users need to see how they compare against competitors in the same space.

**What to build:**

#### a) Multi-URL input

Add a "Compare" mode toggle next to the analyze button. When toggled on, show 2 additional URL input fields (for a total of 3 URLs). Label them "Your site" and "Competitor 1/2".

#### b) Parallel analysis

When in compare mode, fire 3 parallel requests to `/api/analyze`. Show a combined progress stepper that tracks all three (3 progress bars stacked, each labeled with the domain).

#### c) Comparison results view

When all analyses complete, show a new "Comparison" tab (in addition to existing tabs) with:
- **Side-by-side score rings**: 3 columns, each with GEO/AEO/Overall score rings
- **Category comparison table**: Rows = categories, Columns = the 3 sites. Each cell shows the score with color coding. Highlight cells where the user's site wins (green) or loses (red) vs competitors
- **Advantage/disadvantage summary**: Auto-generated bullets like "You lead in Content Structure (+18 pts vs competitor avg) but trail in Schema Markup (-32 pts)"

Store comparison state alongside the single-analysis state. Add a `compareMode: boolean` state and `competitors: (SiteAnalysis | null)[]` state to the Home component.

#### d) UI placement

Place the "Compare" toggle as a small pill button below the URL input: `[Single Analysis] [Compare ↔]`. When switched:
- Animate the additional inputs appearing with `fadeInUp`
- The Analyze button label changes to "Compare All"
- Keep the same phase stepper but show one per URL being analyzed

---

### 10. Persist Analysis History with Auth

**Problem:** Google sign-in exists but gates nothing. Users who sign in expect persistence, saved history, and returning to past results.

**What to build:**

#### a) Server-side storage

Create `src/lib/storage.ts` with functions to save/load analysis results using the filesystem (for now — no database needed). Store results as JSON files in a `.rankai-data/` directory (gitignored):

```typescript
interface StoredAnalysis {
  id: string;              // nanoid
  userId: string;          // from NextAuth session
  analysis: SiteAnalysis;
  createdAt: string;
}

export async function saveAnalysis(userId: string, analysis: SiteAnalysis): Promise<string>
export async function getAnalyses(userId: string): Promise<StoredAnalysis[]>
export async function getAnalysis(id: string): Promise<StoredAnalysis | null>
```

Generate IDs with `crypto.randomUUID()` (built-in, no dependency needed).

#### b) API routes

- `POST /api/analyses` — Save an analysis (requires auth). Called automatically after analysis completes if user is signed in.
- `GET /api/analyses` — List user's past analyses (requires auth). Return `{id, url, overallScore, overallGrade, siteType, createdAt}[]`.
- `GET /api/analyses/[id]` — Get a specific past analysis (requires auth + ownership check).

#### c) History panel

When a signed-in user is on the idle/home view, show a "Recent Analyses" section below the URL input. Display up to 5 most recent analyses as compact cards:

```
[Score Ring 62] example.com — Analyzed Jan 15     [View →]
[Score Ring 78] docs.stripe.com — Analyzed Jan 12  [View →]
```

Clicking "View" loads the full analysis into the results view.

#### d) Auto-save behavior

After analysis completes, if the user is signed in, automatically save the result (fire-and-forget POST to `/api/analyses`). Show a subtle "Saved to history" indicator near the URL bar for 3 seconds.

---

### 11. Contextual Benchmarks

**Problem:** Scores lack industry context. "62" could be great or terrible depending on the site category.

**What to build:**

#### a) Benchmark data file

Create `src/lib/benchmarks.ts` with hardcoded benchmark data (we'll update these as we collect real data):

```typescript
export const BENCHMARKS: Record<SiteType, { median: number; p25: number; p75: number; top10: number }> = {
  'saas-api':          { median: 58, p25: 42, p75: 74, top10: 85 },
  'ecommerce':         { median: 45, p25: 30, p75: 62, top10: 78 },
  'local-business':    { median: 35, p25: 20, p75: 52, top10: 68 },
  'content-publisher': { median: 52, p25: 38, p75: 67, top10: 80 },
  'general':           { median: 42, p25: 28, p75: 58, top10: 72 },
};
```

#### b) Percentile calculation

Add a function `getPercentile(score: number, siteType: SiteType): number` that linearly interpolates between the benchmark points to estimate a percentile (0–100).

#### c) UI display

In the score hero section (the big three-column score display), add a line below each score ring:
- "Top 12% of SaaS sites" or "Better than 67% of e-commerce sites"
- Use the computed percentile to generate this text
- Style as small text with the score color

Also add the benchmark context to the AI insights prompt so Claude can reference it in the strategic analysis.

---

### 12. Keep Landing Content Accessible During Results

**Problem:** When results load, the "How it Works" and "Under the Hood" sections disappear entirely because they're conditionally rendered only when `phase === 'idle' && !analysis`. Users can't reference the methodology while viewing results.

**What to build:**

Move the "How it Works" and "Under the Hood" sections to render always (not conditionally). Place them below the results section when results are present. The nav anchor links (`#how-it-works`, `#under-the-hood`) should always work.

Change the conditional in `page.tsx` from:
```tsx
{!analysis && phase === 'idle' && (
  <>
    {/* How it Works */}
    {/* Under the Hood */}
  </>
)}
```

To:
```tsx
{/* Results (if available) */}
{analysis && ( ... )}

{/* Always show methodology sections */}
{phase !== 'error' && (
  <>
    {/* How it Works */}
    {/* Under the Hood */}
  </>
)}
```

Only hide them during active loading (`isLoading`) to reduce visual noise during the analysis wait.

---

### 13. Error UX Improvements

**Problem:** Failed analyses show a bare red error message with no guidance, no retry mechanism, and no partial results.

**What to build:**

#### a) Categorized error messages

In the error display (currently just `{error}` in a red box), parse common error types and show helpful guidance:

```typescript
function getErrorGuidance(error: string): { title: string; suggestion: string } {
  if (error.includes('HTTP 403') || error.includes('HTTP 401'))
    return { title: 'Access Denied', suggestion: 'This site blocks automated crawlers. Try a different page or check if the site requires authentication.' };
  if (error.includes('HTTP 404'))
    return { title: 'Page Not Found', suggestion: 'Double-check the URL. Make sure it points to an existing page.' };
  if (error.includes('timeout') || error.includes('abort'))
    return { title: 'Request Timed Out', suggestion: 'The site took too long to respond. It might be temporarily down — try again in a few minutes.' };
  if (error.includes('ENOTFOUND') || error.includes('getaddrinfo'))
    return { title: 'Domain Not Found', suggestion: 'This domain doesn\'t exist. Check for typos in the URL.' };
  if (error.includes('Invalid URL') || error.includes('valid URL'))
    return { title: 'Invalid URL', suggestion: 'Enter a complete URL like "example.com" or "https://example.com/page".' };
  return { title: 'Analysis Failed', suggestion: 'Something went wrong. Try again or try a different URL.' };
}
```

#### b) Retry button

Add a "Try Again" button inside the error display that re-triggers `handleAnalyze()` with the same URL.

#### c) Error display redesign

Replace the current single-line error div with:
```
┌─────────────────────────────────────────┐
│ ⚠ Access Denied                        │
│                                         │
│ This site blocks automated crawlers.    │
│ Try a different page or check if the    │
│ site requires authentication.           │
│                                         │
│           [Try Again]  [Clear]          │
└─────────────────────────────────────────┘
```

Use the existing card styling (`bg-bg-card border border-border rounded-xl`) with a left accent border in the error color (`border-l-4 border-l-danger`).

---

### 14. Mobile Responsiveness Fixes

**Problem:** Several layout issues on small screens.

**What to build:**

#### a) Score hero section

The three-column grid `grid-cols-[1fr_1.4fr_1fr]` correctly falls back to `grid-cols-1` on mobile, but the center score ring at `size={170}` is too large on small phones. Add a responsive size: use `size={140}` on mobile (detect via container width or a `sm:` breakpoint approach — pass a smaller size prop on mobile using a custom hook or CSS-driven approach).

#### b) Tab bar scroll indicator

The tab bar has `overflow-x-auto` but no visual indicator that more tabs exist off-screen. Add gradient fade masks on the left/right edges when scrollable:

```css
.tab-scroll-container {
  mask-image: linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent);
}
```

Only apply the mask when the container is scrollable (check `scrollWidth > clientWidth`).

#### c) Issue summary bar

The 4-item issue summary bar wraps awkwardly on mobile. Change to a `flex-wrap` layout that stacks into a 2x2 grid on small screens:

```css
@media (max-width: 480px) {
  .issue-summary { flex-wrap: wrap; gap: 8px; }
  .issue-summary > div { flex: 1 1 40%; }
}
```

#### d) Recommendation cards

On mobile, the badge row (priority + type + effort) in `RecommendationCard` can overflow. Ensure badges wrap to a second line gracefully with `flex-wrap`.

---

### 15. Improve AI Insights Prompt

**Problem:** The AI insights prompt always references "Neon, Supabase, and Stripe" as benchmarks regardless of site type. The prompt should be contextualized to the detected site type.

**What to build:**

In `ai-insights.ts`, update the `generateAIInsights` function signature to accept `siteType: SiteType`. Modify the prompt:

- For `saas-api`: Keep current benchmarks (Stripe, Twilio, Neon)
- For `ecommerce`: Use "Amazon, Shopify product pages, and Wirecutter reviews" as benchmarks
- For `local-business`: Use "top-ranking local competitors and Google Business Profile best practices" as benchmarks
- For `content-publisher`: Use "HubSpot, Healthline, and NerdWallet" as benchmarks
- For `general`: Use "leading sites in your industry" as benchmarks

Also add the site type and benchmark percentile to the prompt context so Claude can say things like "Your score of 62 puts you in the top 33% of e-commerce sites, but well below the top 10% threshold of 78."

Update the fallback insights template similarly.

---

## Implementation Order

Follow this order to minimize conflicts and build on foundations:

1. **Site-type detection** (#1a, #1b) — Foundation for everything else
2. **E-E-A-T category** (#2) — Extends GEO before other changes touch scoring
3. **Types & interface updates** (#1c, #1d, #2) — Update types.ts with all new fields
4. **Adaptive AEO analyzers** (#1b) — New analyzer files for each site type
5. **Crawl depth + smart selection** (#7) — Better data quality for everything
6. **GEO heuristic fixes** (#6) — Improve accuracy of existing checks
7. **Streaming progress** (#3) — Better UX during analysis
8. **Recommendation engine** (#5) — Code snippets, impact matrix
9. **React-markdown** (#8) — Quick fix, no dependencies on other changes
10. **Error UX** (#13) — Quick fix
11. **Mobile fixes** (#14) — Quick fix
12. **Landing content always visible** (#12) — Quick fix
13. **AI insights prompt** (#15) — Depends on site-type detection
14. **Benchmarks** (#11) — Depends on site-type detection
15. **Shareable results** (#4) — Independent feature
16. **Competitor comparison** (#9) — Depends on streaming + shareable
17. **Auth + history** (#10) — Depends on analysis persistence

---

## Testing Each Change

After implementing each numbered change, verify:

1. `npm run build` succeeds with no TypeScript errors
2. Run analysis on at least 3 different site types to verify adaptive scoring:
   - SaaS/API: `docs.stripe.com`
   - E-commerce: `amazon.com` or any Shopify store
   - Content publisher: `techcrunch.com` or `healthline.com`
   - Local business: Any dental/restaurant/plumber website
3. Verify scores feel "fair" for each site type (non-tech sites should no longer get near-0 AEO scores)
4. Check mobile layout at 375px and 768px widths
5. Verify dark and light mode for any new UI elements

---

## What NOT to Do

- Do not add a database. File-based storage is fine for now.
- Do not create separate pages/routes for results. Keep the single-page architecture.
- Do not add third-party analytics, tracking, or telemetry.
- Do not restructure the project directory beyond what's specified.
- Do not add tests (we'll add those separately later).
- Do not add loading skeletons, toasts libraries, or UI component libraries.
- Do not change the visual design language — same colors, same spacing, same font.
- Do not add any content/copy that positions this as an agency or consulting service. This is a standalone analysis tool.
- Do not remove or change the Google OAuth setup. Just build features on top of it.
