'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { Loader2, AlertTriangle } from 'lucide-react';
import { SiteAnalysis } from '@/lib/types';
import { AnalysisResultsView } from '@/components/analysis-results';

export default function AnalysisPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [fetchLoading, setFetchLoading] = useState(true);

  // Redirect if unauthenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/');
    }
  }, [status, router]);

  // Fetch analysis data
  useEffect(() => {
    if (!session?.user || !id) return;

    setFetchLoading(true);
    fetch(`/api/analyses/${id}`)
      .then(res => {
        if (res.status === 404) throw new Error('Analysis not found');
        if (!res.ok) throw new Error('Failed to load analysis');
        return res.json();
      })
      .then((data: SiteAnalysis) => {
        setAnalysis(data);
        setFetchLoading(false);
      })
      .catch(err => {
        setFetchError(err.message);
        setFetchLoading(false);
      });
  }, [session, id]);

  if (status === 'loading' || (status === 'authenticated' && fetchLoading)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (!session?.user) return null;

  if (fetchError) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-16 w-full text-center">
        <AlertTriangle size={32} className="text-danger mx-auto mb-4" />
        <h2 className="text-lg font-semibold mb-2">{fetchError}</h2>
        <p className="text-sm text-text-secondary mb-6">This analysis may have been deleted or doesn&apos;t exist.</p>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-medium transition-all cursor-pointer"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 w-full flex-1">
      {analysis && (
        <div className="pb-16">
          <AnalysisResultsView analysis={analysis} />
        </div>
      )}
    </div>
  );
}
