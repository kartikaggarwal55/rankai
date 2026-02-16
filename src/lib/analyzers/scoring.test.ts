import { describe, expect, it } from 'vitest';
import { buildSiteAnalysis, aggregateGEOFromPages } from './scoring';
import { AEOAnalysis, CategoryScore, GEOAnalysis, PageAnalysis } from '../types';

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

describe('aggregateGEOFromPages', () => {
  it('preserves page URLs through deduplication', () => {
    const page1Geo = makeGeo(80);
    page1Geo.schemaMarkup.findings = [
      { check: 'FAQPage schema', status: 'fail', details: 'Missing', points: 0, maxPoints: 10 },
    ];
    const page2Geo = makeGeo(60);
    page2Geo.schemaMarkup.findings = [
      { check: 'FAQPage schema', status: 'fail', details: 'Missing', points: 0, maxPoints: 10 },
    ];

    const pages: PageAnalysis[] = [
      { url: 'https://example.com/', title: 'Home', geo: page1Geo },
      { url: 'https://example.com/about', title: 'About', geo: page2Geo },
    ];

    const result = aggregateGEOFromPages(pages);
    const finding = result.schemaMarkup.findings.find(f => f.check === 'FAQPage schema');
    expect(finding).toBeDefined();
    expect(finding!.pageUrls).toEqual(
      expect.arrayContaining(['https://example.com/', 'https://example.com/about'])
    );
    expect(finding!.pageUrls).toHaveLength(2);
  });

  it('returns findings without pageUrls for single page', () => {
    const pages: PageAnalysis[] = [
      { url: 'https://example.com/', title: 'Home', geo: makeGeo(80) },
    ];
    const result = aggregateGEOFromPages(pages);
    for (const key of Object.keys(result) as (keyof GEOAnalysis)[]) {
      for (const f of result[key].findings) {
        expect(f.pageUrls).toBeUndefined();
      }
    }
  });
});
