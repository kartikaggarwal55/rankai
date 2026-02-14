import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SiteAnalysis } from '@/lib/types';
import { buildReportFilename, generateAnalysisReportPdf } from '@/lib/report/pdf-report';

export const runtime = 'nodejs';

const CategoryScoreSchema = z.object({
  score: z.number(),
  grade: z.string(),
  weight: z.number(),
  findings: z.array(z.object({
    check: z.string(),
    status: z.enum(['pass', 'partial', 'fail']),
    details: z.string(),
    points: z.number(),
    maxPoints: z.number(),
  })),
  recommendations: z.array(z.string()),
});

const RecommendationSchema = z.object({
  category: z.string(),
  type: z.enum(['geo', 'aeo']),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  effort: z.enum(['low', 'medium', 'high']),
  title: z.string(),
  description: z.string(),
  currentScore: z.number(),
  potentialScore: z.number(),
  impact: z.string(),
  codeSnippet: z.object({
    language: z.string(),
    code: z.string(),
    label: z.string(),
  }).optional(),
});

const SiteAnalysisSchema = z.object({
  url: z.string().url(),
  crawledAt: z.string(),
  pagesAnalyzed: z.number().int().nonnegative(),
  siteType: z.enum(['saas-api', 'ecommerce', 'local-business', 'content-publisher', 'general']),
  pageAnalyses: z.array(z.object({
    url: z.string().url(),
    title: z.string(),
    geo: z.record(z.string(), CategoryScoreSchema),
  })),
  geoScore: z.number().int(),
  geoGrade: z.string(),
  aeoScore: z.number().int(),
  aeoGrade: z.string(),
  overallScore: z.number().int(),
  overallGrade: z.string(),
  geo: z.record(z.string(), CategoryScoreSchema),
  aeo: z.record(z.string(), CategoryScoreSchema),
  topRecommendations: z.array(RecommendationSchema),
  aiInsights: z.string(),
});

const ReportRequestSchema = z.object({
  analysis: SiteAnalysisSchema,
  competitors: z.array(SiteAnalysisSchema).max(5).default([]),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let parsed: z.infer<typeof ReportRequestSchema>;
  try {
    parsed = ReportRequestSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const message = err.issues.map(issue => issue.message).join(', ') || 'Invalid report payload';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid report payload' }, { status: 400 });
  }

  try {
    const analysis = parsed.analysis as unknown as SiteAnalysis;
    const competitors = parsed.competitors as unknown as SiteAnalysis[];
    const pdfBytes = await generateAnalysisReportPdf(analysis, competitors);
    const filename = buildReportFilename(analysis.url, analysis.crawledAt);

    const normalizedBytes = Uint8Array.from(pdfBytes);
    const body = new Blob([normalizedBytes], { type: 'application/pdf' });

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBytes.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('POST /api/report error:', err);
    return NextResponse.json({ error: 'Failed to generate PDF report' }, { status: 500 });
  }
}
