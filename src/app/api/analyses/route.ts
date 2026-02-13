import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { saveAnalysis, getAnalysesSummary } from '@/lib/storage';
import { SiteAnalysis } from '@/lib/types';

const SaveAnalysisSchema = z.object({
  analysis: z.object({
    url: z.string().url(),
    crawledAt: z.string(),
    pagesAnalyzed: z.number().int().nonnegative(),
    siteType: z.enum(['saas-api', 'ecommerce', 'local-business', 'content-publisher', 'general']),
    geoScore: z.number().int(),
    aeoScore: z.number().int(),
    overallScore: z.number().int(),
    geoGrade: z.string(),
    aeoGrade: z.string(),
    overallGrade: z.string(),
  }).passthrough(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = SaveAnalysisSchema.parse(body);
    const analysis = parsed.analysis as unknown as SiteAnalysis;
    const id = await saveAnalysis(session.user.email, analysis);
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid analysis payload' }, { status: 400 });
    }
    console.error('POST /api/analyses error:', err);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rows = await getAnalysesSummary(session.user.email);
    return NextResponse.json(
      rows.map(r => ({
        id: r.id,
        url: r.url,
        overallScore: r.overall_score,
        overallGrade: r.overall_grade,
        geoScore: r.geo_score,
        aeoScore: r.aeo_score,
        siteType: r.site_type,
        createdAt: r.created_at,
      }))
    );
  } catch (err) {
    console.error('GET /api/analyses error:', err);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
