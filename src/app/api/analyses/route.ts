import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { saveAnalysis, getAnalysesSummary } from '@/lib/storage';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { analysis } = await request.json();
    const id = await saveAnalysis(session.user.email, analysis);
    return NextResponse.json({ id });
  } catch (err) {
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
