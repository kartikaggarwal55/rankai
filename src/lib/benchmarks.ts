import { SiteType } from './types';

export const BENCHMARKS: Record<SiteType, { median: number; p25: number; p75: number; top10: number }> = {
  'saas-api':          { median: 58, p25: 42, p75: 74, top10: 85 },
  'ecommerce':         { median: 45, p25: 30, p75: 62, top10: 78 },
  'local-business':    { median: 35, p25: 20, p75: 52, top10: 68 },
  'content-publisher': { median: 52, p25: 38, p75: 67, top10: 80 },
  'general':           { median: 42, p25: 28, p75: 58, top10: 72 },
};

export function getPercentile(score: number, siteType: SiteType): number {
  const b = BENCHMARKS[siteType];

  if (score <= b.p25) {
    return Math.round((score / b.p25) * 25);
  }
  if (score <= b.median) {
    return Math.round(25 + ((score - b.p25) / (b.median - b.p25)) * 25);
  }
  if (score <= b.p75) {
    return Math.round(50 + ((score - b.median) / (b.p75 - b.median)) * 25);
  }
  if (score <= b.top10) {
    return Math.round(75 + ((score - b.p75) / (b.top10 - b.p75)) * 15);
  }
  return Math.min(99, Math.round(90 + ((score - b.top10) / (100 - b.top10)) * 10));
}

export function getPercentileLabel(score: number, siteType: SiteType): string {
  const percentile = getPercentile(score, siteType);
  const typeLabels: Record<SiteType, string> = {
    'saas-api': 'SaaS sites',
    'ecommerce': 'e-commerce sites',
    'local-business': 'local businesses',
    'content-publisher': 'content publishers',
    'general': 'websites',
  };
  if (percentile >= 50) {
    return `Top ${100 - percentile}% of ${typeLabels[siteType]}`;
  }
  return `Better than ${percentile}% of ${typeLabels[siteType]}`;
}
