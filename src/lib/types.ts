export type SiteType = 'saas-api' | 'ecommerce' | 'local-business' | 'content-publisher' | 'general';

export interface CrawlResult {
  url: string;
  html: string;
  title: string;
  statusCode: number;
  headers: Record<string, string>;
  loadTime: number;
}

export interface PageAnalysis {
  url: string;
  title: string;
  geo: GEOAnalysis;
}

export interface GEOAnalysis {
  contentStructure: CategoryScore;
  schemaMarkup: CategoryScore;
  topicalAuthority: CategoryScore;
  citationWorthiness: CategoryScore;
  contentFreshness: CategoryScore;
  languagePatterns: CategoryScore;
  metaInformation: CategoryScore;
  technicalHealth: CategoryScore;
  contentUniqueness: CategoryScore;
  multiFormatContent: CategoryScore;
  eeatSignals: CategoryScore;
}

export interface AEOAnalysis {
  [key: string]: CategoryScore;
}

export interface CategoryScore {
  score: number;
  grade: string;
  weight: number;
  findings: Finding[];
  recommendations: string[];
}

export interface Finding {
  check: string;
  status: 'pass' | 'partial' | 'fail';
  details: string;
  points: number;
  maxPoints: number;
}

export interface SiteAnalysis {
  url: string;
  crawledAt: string;
  pagesAnalyzed: number;
  siteType: SiteType;
  pageAnalyses: PageAnalysis[];
  geoScore: number;
  geoGrade: string;
  aeoScore: number;
  aeoGrade: string;
  overallScore: number;
  overallGrade: string;
  geo: GEOAnalysis;
  aeo: AEOAnalysis;
  topRecommendations: Recommendation[];
  aiInsights: string;
}

export interface Recommendation {
  category: string;
  type: 'geo' | 'aeo';
  priority: 'critical' | 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  currentScore: number;
  potentialScore: number;
  impact: string;
  codeSnippet?: {
    language: string;
    code: string;
    label: string;
  };
}

export interface ShareableResult {
  u: string;
  t: string;
  p: number;
  st: string;
  g: number;
  a: number;
  o: number;
  gc: Record<string, number>;
  ac: Record<string, number>;
}

export function getGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

export const GEO_WEIGHTS = {
  contentStructure: 0.12,
  schemaMarkup: 0.13,
  topicalAuthority: 0.10,
  citationWorthiness: 0.13,
  contentFreshness: 0.08,
  languagePatterns: 0.08,
  metaInformation: 0.03,
  technicalHealth: 0.05,
  contentUniqueness: 0.10,
  multiFormatContent: 0.08,
  eeatSignals: 0.10,
};

export const AEO_WEIGHTS: Record<string, number> = {
  documentationStructure: 0.10,
  apiDocumentation: 0.12,
  codeExamples: 0.10,
  llmsTxt: 0.08,
  sdkQuality: 0.08,
  authSimplicity: 0.08,
  quickstartGuide: 0.10,
  errorMessages: 0.06,
  changelogVersioning: 0.05,
  mcpServer: 0.08,
  integrationGuides: 0.08,
  machineReadableSitemaps: 0.07,
};

export const ADAPTIVE_AEO_WEIGHTS: Record<SiteType, Record<string, number>> = {
  'saas-api': AEO_WEIGHTS,
  'ecommerce': {
    productSchema: 0.15,
    reviewMarkup: 0.12,
    inventorySignals: 0.08,
    merchantFeed: 0.10,
    comparisonContent: 0.12,
    customerEvidence: 0.10,
    purchaseSimplicity: 0.08,
    llmsTxt: 0.05,
    machineReadableSitemaps: 0.07,
    faqContent: 0.08,
    categoryTaxonomy: 0.05,
  },
  'local-business': {
    localSchema: 0.15,
    napConsistency: 0.12,
    reviewPresence: 0.12,
    servicePages: 0.10,
    locationSignals: 0.10,
    contactAccessibility: 0.08,
    trustSignals: 0.08,
    llmsTxt: 0.05,
    machineReadableSitemaps: 0.07,
    localContent: 0.08,
    photoEvidence: 0.05,
  },
  'content-publisher': {
    authorCredentials: 0.15,
    contentTaxonomy: 0.12,
    publishingCadence: 0.10,
    syndicationReadiness: 0.10,
    originalReporting: 0.12,
    sourceCitation: 0.10,
    llmsTxt: 0.05,
    machineReadableSitemaps: 0.07,
    archiveDiscoverability: 0.07,
    multimediaIntegration: 0.07,
    newsletterPresence: 0.05,
  },
  'general': {
    documentationStructure: 0.25,
    llmsTxt: 0.15,
    machineReadableSitemaps: 0.15,
    contentQuality: 0.25,
    trustSignals: 0.20,
  },
};

export const GEO_AEO_SPLIT: Record<SiteType, { geo: number; aeo: number }> = {
  'saas-api': { geo: 0.50, aeo: 0.50 },
  'ecommerce': { geo: 0.55, aeo: 0.45 },
  'local-business': { geo: 0.65, aeo: 0.35 },
  'content-publisher': { geo: 0.70, aeo: 0.30 },
  'general': { geo: 0.60, aeo: 0.40 },
};
