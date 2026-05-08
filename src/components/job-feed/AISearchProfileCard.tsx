'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { CareerProfile } from '@/lib/job-feed/career-profile';

interface CareerProfileResponse {
  profile: CareerProfile | null;
  cvNewerThanProfile: boolean;
  status: 'ok' | 'no_cv' | 'no_profile';
  generatedAt: string | null;
}

/**
 * Read-only preview of the AI-inferred career profile that drives the job feed.
 * Visible inside the wizard so paid users can see what Karko inferred from
 * their CV — and refresh it on demand. Editing happens via the existing
 * settings fields below; this card is observability, not a form.
 */
export function AISearchProfileCard() {
  const [data, setData] = useState<CareerProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/job-feed/career-profile');
      if (!response.ok) {
        setData(null);
        return;
      }
      const json = (await response.json()) as CareerProfileResponse;
      setData(json);
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/job-feed/career-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      if (response.ok) {
        const json = (await response.json()) as CareerProfileResponse;
        setData(json);
      }
    } catch {
      // ignore — silent failure is fine for a refresh action
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-cream-200 bg-cream-50 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-warm-gray">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your search profile.
        </div>
      </div>
    );
  }

  if (!data || data.status === 'no_cv') {
    return (
      <div className="rounded-2xl border border-cream-200 bg-cream-50 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-gold-100 p-2">
            <Sparkles className="h-4 w-4 text-gold-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-charcoal">Your AI search profile</h3>
            <p className="mt-1 text-sm text-warm-gray">
              Upload a CV first and Karko will infer your titles, seniority, and skill clusters to power smarter daily searches.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (data.status === 'no_profile' || !data.profile) {
    return (
      <div className="rounded-2xl border border-cream-200 bg-cream-50 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-gold-100 p-2">
            <Sparkles className="h-4 w-4 text-gold-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-charcoal">Your AI search profile</h3>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 rounded-full bg-gold-400 px-3 py-1.5 text-xs font-semibold text-navy-900 transition-colors hover:bg-gold-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {isRefreshing ? 'Generating' : 'Generate now'}
              </button>
            </div>
            <p className="mt-1 text-sm text-warm-gray">
              Karko hasn&apos;t synthesized your profile yet. Generate it now to see what we inferred from your CV.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { profile, cvNewerThanProfile, generatedAt } = data;
  const titles = profile.inferredTitles.slice(0, 4);
  const primaryClusters = profile.primarySkillClusters.slice(0, 3);

  return (
    <div className="rounded-2xl border border-cream-200 bg-cream-50 p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-gold-100 p-2">
          <Sparkles className="h-4 w-4 text-gold-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-charcoal">Your AI search profile</h3>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-full border border-cream-200 bg-white px-3 py-1.5 text-xs font-semibold text-charcoal transition-colors hover:border-cream-300 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {isRefreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>

          <p className="mt-1 text-sm text-warm-gray">
            What Karko inferred from your CV. Powers your daily feed.
          </p>

          {cvNewerThanProfile && (
            <p className="mt-2 rounded-lg bg-gold-50 px-3 py-2 text-xs text-charcoal">
              Your CV was updated more recently. Refresh to keep the feed in sync.
            </p>
          )}

          <div className="mt-5 space-y-4">
            <ProfileRow label="Discipline">
              <span className="text-sm font-medium text-charcoal capitalize">{profile.function}</span>
              <span className="mx-2 text-cream-400">·</span>
              <span className="text-sm text-charcoal capitalize">{profile.seniority.level}</span>
              <span className="mx-2 text-cream-400">·</span>
              <span className="text-sm text-warm-gray">
                {profile.yearsTotal}+ years
              </span>
            </ProfileRow>

            {titles.length > 0 && (
              <ProfileRow label="Best-fit titles">
                <div className="flex flex-wrap gap-1.5">
                  {titles.map((title, idx) => (
                    <span
                      key={`${title.canonical}-${idx}`}
                      className="inline-flex items-center rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-700"
                      title={title.rationale}
                    >
                      {title.canonical}
                    </span>
                  ))}
                </div>
              </ProfileRow>
            )}

            {primaryClusters.length > 0 && (
              <ProfileRow label="Strongest skill areas">
                <div className="flex flex-col gap-2">
                  {primaryClusters.map((cluster, idx) => (
                    <div key={`${cluster.name}-${idx}`} className="text-sm text-charcoal">
                      <span className="font-medium capitalize">{cluster.name}</span>
                      {cluster.skills.length > 0 && (
                        <span className="text-warm-gray">
                          : {cluster.skills.slice(0, 6).join(', ')}
                          {cluster.skills.length > 6 ? '…' : ''}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </ProfileRow>
            )}

            {profile.industryDomains.length > 0 && (
              <ProfileRow label="Industries">
                <div className="flex flex-wrap gap-1.5">
                  {profile.industryDomains.map((domain) => (
                    <span
                      key={domain}
                      className="inline-flex items-center rounded-full border border-cream-200 bg-white px-2.5 py-1 text-xs font-medium text-charcoal capitalize"
                    >
                      {domain.replace(/-/g, ' ')}
                    </span>
                  ))}
                </div>
              </ProfileRow>
            )}

            {profile.narrative && (
              <ProfileRow label="Summary">
                <p className="text-sm leading-relaxed text-charcoal">{profile.narrative}</p>
              </ProfileRow>
            )}
          </div>

          {generatedAt && (
            <p className="mt-5 text-xs text-warm-gray">
              Last refreshed {formatRelativeTimestamp(generatedAt)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[180px,1fr] sm:items-baseline">
      <div className="text-xs font-semibold uppercase tracking-wide text-warm-gray">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function formatRelativeTimestamp(isoTimestamp: string): string {
  const then = Date.parse(isoTimestamp);
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(isoTimestamp).toLocaleDateString();
}
