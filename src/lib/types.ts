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
}

export interface AEOAnalysis {
  documentationStructure: CategoryScore;
  apiDocumentation: CategoryScore;
  codeExamples: CategoryScore;
  llmsTxt: CategoryScore;
  sdkQuality: CategoryScore;
  authSimplicity: CategoryScore;
  quickstartGuide: CategoryScore;
  errorMessages: CategoryScore;
  changelogVersioning: CategoryScore;
  mcpServer: CategoryScore;
  integrationGuides: CategoryScore;
  machineReadableSitemaps: CategoryScore;
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
  schemaMarkup: 0.15,
  topicalAuthority: 0.10,
  citationWorthiness: 0.15,
  contentFreshness: 0.10,
  languagePatterns: 0.08,
  metaInformation: 0.05,
  technicalHealth: 0.05,
  contentUniqueness: 0.10,
  multiFormatContent: 0.10,
};

export const AEO_WEIGHTS = {
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
