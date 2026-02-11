import { neon } from '@neondatabase/serverless';
import { SiteAnalysis } from './types';

const sql = neon(process.env.DATABASE_URL!);

let tableReady: Promise<void> | null = null;

function ensureTable() {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS analyses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        url TEXT NOT NULL,
        overall_score INTEGER NOT NULL,
        overall_grade TEXT NOT NULL,
        geo_score INTEGER,
        aeo_score INTEGER,
        site_type TEXT,
        analysis JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.then(() =>
      sql`CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses (user_id, created_at DESC)`
    ).then(() => {}).catch((err) => {
      tableReady = null; // Reset so next call retries
      throw err;
    });
  }
  return tableReady;
}

export async function saveAnalysis(userId: string, analysis: SiteAnalysis): Promise<string> {
  await ensureTable();
  const rows = await sql`
    INSERT INTO analyses (user_id, url, overall_score, overall_grade, geo_score, aeo_score, site_type, analysis)
    VALUES (
      ${userId},
      ${analysis.url},
      ${analysis.overallScore},
      ${analysis.overallGrade},
      ${analysis.geoScore},
      ${analysis.aeoScore},
      ${analysis.siteType},
      ${JSON.stringify(analysis)}
    )
    RETURNING id
  `;
  return rows[0].id;
}

export async function getAnalysesSummary(userId: string) {
  await ensureTable();
  return sql`
    SELECT id, url, overall_score, overall_grade, geo_score, aeo_score, site_type, created_at
    FROM analyses
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
}

export async function getAnalysis(id: string) {
  await ensureTable();
  const rows = await sql`
    SELECT id, user_id, analysis, created_at
    FROM analyses
    WHERE id = ${id}::uuid
  `;
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    analysis: row.analysis as unknown as SiteAnalysis,
    createdAt: row.created_at,
  };
}

export async function deleteAnalysis(id: string, userId: string): Promise<boolean> {
  await ensureTable();
  const rows = await sql`
    DELETE FROM analyses
    WHERE id = ${id}::uuid AND user_id = ${userId}
    RETURNING id
  `;
  return rows.length > 0;
}
