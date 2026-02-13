import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { deleteComparison, getAnalysis, getComparison } from '@/lib/storage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const comparison = await getComparison(id);
    if (!comparison) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (comparison.userId !== userEmail) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const primary = await getAnalysis(comparison.primaryAnalysisId);
    if (!primary || primary.userId !== userEmail) {
      return NextResponse.json({ error: 'Primary analysis missing' }, { status: 404 });
    }

    const competitorsRaw = await Promise.all(
      comparison.competitorAnalysisIds.map(analysisId => getAnalysis(analysisId))
    );
    const competitors = competitorsRaw
      .filter((entry): entry is NonNullable<typeof entry> => !!entry && entry.userId === userEmail)
      .map(entry => entry.analysis);

    return NextResponse.json({
      id: comparison.id,
      createdAt: comparison.createdAt,
      primaryAnalysisId: comparison.primaryAnalysisId,
      competitorAnalysisIds: comparison.competitorAnalysisIds,
      primary: primary.analysis,
      competitors,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch comparison' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const deleted = await deleteComparison(id, userEmail);
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete comparison' }, { status: 500 });
  }
}
