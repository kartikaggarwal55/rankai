import { describe, expect, it } from 'vitest';
import { buildSiteAnalysis } from './scoring';
import { AEOAnalysis, CategoryScore, GEOAnalysis } from '../types';

function makeCategory(score: number, weight: number): CategoryScore {
  return {
    score,
    grade: score >= 70 ? 'B' : 'C',
    weight,
    findings: [],
    recommendations: [],
  };
}

function makeGeo(score: number): GEOAnalysis {
  return {
    contentStructure: makeCategory(score, 0.12),
    schemaMarkup: makeCategory(score, 0.13),
    topicalAuthority: makeCategory(score, 0.1),
    citationWorthiness: makeCategory(score, 0.13),
    contentFreshness: makeCategory(score, 0.08),
    languagePatterns: makeCategory(score, 0.08),
    metaInformation: makeCategory(score, 0.03),
    technicalHealth: makeCategory(score, 0.05),
    contentUniqueness: makeCategory(score, 0.1),
    multiFormatContent: makeCategory(score, 0.08),
    eeatSignals: makeCategory(score, 0.1),
  };
}

describe('buildSiteAnalysis', () => {
  it('uses site-type GEO/AEO split for overall score', () => {
    const geo = makeGeo(80);
    const aeo: AEOAnalysis = {
      documentationStructure: makeCategory(40, 1),
    };

    const result = buildSiteAnalysis(
      'https://example.com',
      [{ url: 'https://example.com', title: 'Home', geo }],
      geo,
      aeo,
      'Insights',
      'local-business'
    );

    expect(result.geoScore).toBe(80);
    expect(result.aeoScore).toBe(40);
    expect(result.overallScore).toBe(66); // round(80 * 0.65 + 40 * 0.35)
    expect(result.siteType).toBe('local-business');
  });
});
