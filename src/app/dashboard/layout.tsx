'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Plus } from 'lucide-react';
import { AuthButton } from '@/components/auth-button';
import { ThemeToggle } from '@/components/theme-toggle';

function Nav() {
  const pathname = usePathname();
  const isDetailPage =
    pathname.startsWith('/dashboard/analysis/') ||
    pathname.startsWith('/dashboard/comparison/');

  return (
    <nav
      className="sticky top-0 z-50 backdrop-blur-xl border-b border-border"
      style={{ backgroundColor: 'var(--nav-bg)' }}
    >
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-light flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="9" width="3" height="6" rx="0.75" fill="white" opacity="0.5" />
              <rect x="6.5" y="5" width="3" height="10" rx="0.75" fill="white" opacity="0.75" />
              <rect x="12" y="1" width="3" height="14" rx="0.75" fill="white" />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight">RankAI</span>
        </Link>
        <div className="flex items-center gap-3 text-sm text-text-secondary">
          {isDetailPage ? (
            <>
              <Link
                href="/dashboard"
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium text-[13px] bg-bg-card border border-border text-text-secondary hover:text-text hover:bg-bg-elevated transition-all"
              >
                <BarChart3 size={14} />
                Dashboard
              </Link>
              <Link
                href="/dashboard?new=1"
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium text-[13px] bg-accent text-white hover:bg-accent-light transition-colors"
              >
                <Plus size={14} />
                New Analysis
              </Link>
            </>
          ) : (
            <Link
              href="/dashboard"
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium text-[13px] bg-accent text-white hover:bg-accent-light transition-colors"
            >
              <BarChart3 size={14} />
              Dashboard
            </Link>
          )}
          <ThemeToggle />
          <AuthButton />
        </div>
      </div>
    </nav>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <div className="flex-1 flex flex-col">{children}</div>
      <footer className="mt-auto border-t border-border py-8 text-center">
        <p className="text-xs text-text-muted">
          &copy; {new Date().getFullYear()} RankAI &mdash; Methodology based on Princeton GEO research (KDD 2024) and analysis of 680M+ AI citations.
        </p>
      </footer>
    </div>
  );
}
