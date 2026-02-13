import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { getAnalysis, getComparisonsSummary, saveComparison } from '@/lib/storage';

const CreateComparisonSchema = z.object({
  primaryAnalysisId: z.string().uuid(),
  competitorAnalysisIds: z.array(z.string().uuid()).min(1).max(5),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = CreateComparisonSchema.parse(body);
    const competitorAnalysisIds = [...new Set(parsed.competitorAnalysisIds)].filter(
      id => id !== parsed.primaryAnalysisId
    );
    if (competitorAnalysisIds.length === 0) {
      return NextResponse.json({ error: 'At least one competitor analysis is required' }, { status: 400 });
    }

    const primary = await getAnalysis(parsed.primaryAnalysisId);
    if (!primary || primary.userId !== userEmail) {
      return NextResponse.json({ error: 'Primary analysis not found' }, { status: 404 });
    }

    const competitors = await Promise.all(competitorAnalysisIds.map(id => getAnalysis(id)));
    const allOwned = competitors.every(entry => entry && entry.userId === userEmail);
    if (!allOwned) {
      return NextResponse.json({ error: 'One or more competitor analyses are invalid' }, { status: 400 });
    }

    const id = await saveComparison(
      userEmail,
      parsed.primaryAnalysisId,
      competitorAnalysisIds
    );

    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid comparison payload' }, { status: 400 });
    }
    console.error('POST /api/comparisons error:', err);
    return NextResponse.json({ error: 'Failed to save comparison' }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rows = await getComparisonsSummary(userEmail);
    return NextResponse.json(
      rows.map(row => {
        const competitorIds = Array.isArray(row.competitor_analysis_ids)
          ? row.competitor_analysis_ids.map((entry: unknown) => String(entry))
          : [];
        return {
          id: row.id,
          primaryAnalysisId: row.primary_analysis_id,
          competitorAnalysisIds: competitorIds,
          competitorCount: competitorIds.length,
          primaryUrl: row.primary_url,
          primaryOverallScore: row.primary_overall_score,
          primaryOverallGrade: row.primary_overall_grade,
          createdAt: row.created_at,
        };
      })
    );
  } catch (err) {
    console.error('GET /api/comparisons error:', err);
    return NextResponse.json({ error: 'Failed to fetch comparisons' }, { status: 500 });
  }
}
