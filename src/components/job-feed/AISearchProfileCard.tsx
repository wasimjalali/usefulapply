'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import type { CareerProfile } from '@/lib/job-feed/career-profile';

interface CareerProfileResponse {
  profile: CareerProfile | null;
  cvNewerThanProfile: boolean;
  status: 'ok' | 'no_cv' | 'no_profile';
  generatedAt: string | null;
}

type CardStatus = 'loading' | 'upgrade_required' | 'ok' | 'no_cv' | 'no_profile';

/**
 * Read-only preview of the AI-inferred career profile that drives the job feed.
 * Auto-refreshes when the underlying CV changes (the wizard fires a
 * background regen and re-mounts this card). No manual refresh button —
 * we don't want users burning tokens on idle clicks. Profile editing is
 * deferred to a later iteration.
 */
export function AISearchProfileCard() {
  const [data, setData] = useState<CareerProfileResponse | null>(null);
  const [cardStatus, setCardStatus] = useState<CardStatus>('loading');
  const lastRegenAttemptRef = useRef<number>(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/job-feed/career-profile');
      if (response.status === 403) {
        setCardStatus('upgrade_required');
        return;
      }
      if (!response.ok) {
        setData(null);
        setCardStatus('no_profile');
        return;
      }
      const json = (await response.json()) as CareerProfileResponse;
      setData(json);
      setCardStatus(json.status === 'ok' ? 'ok' : json.status);
    } catch {
      setData(null);
      setCardStatus('no_profile');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Silent auto-regen when the user has uploaded a newer CV than the cached
  // profile reflects. We don't show a button — the system just refreshes.
  // Once the regeneration completes, we reload to show the new profile.
  // A 60-second cooldown prevents repeated firing on re-renders or rapid
  // component re-mounts, and a cancellation flag avoids state updates after
  // unmount.
  useEffect(() => {
    if (data?.cvNewerThanProfile !== true) return;
    const now = Date.now();
    if (now - lastRegenAttemptRef.current < 60_000) return;
    lastRegenAttemptRef.current = now;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/job-feed/career-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: true }),
        });
        if (!res.ok) return;
        if (!cancelled) await load();
      } catch {
        // Keep cooldown active so we don't spin on repeated failures.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.cvNewerThanProfile, load]);

  // Self-heal a missing or stale-by-schema profile. status "no_profile" means
  // a CV exists but no valid profile is stored (genuinely new, or an existing
  // profile that no longer validates after a schema bump). Nothing else in
  // this card's flow would refresh that case, so synthesize once. Shares the
  // 60s cooldown so we don't spin on repeated failures.
  useEffect(() => {
    if (cardStatus !== 'no_profile') return;
    const now = Date.now();
    if (now - lastRegenAttemptRef.current < 60_000) return;
    lastRegenAttemptRef.current = now;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/job-feed/career-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: true }),
        });
        if (!res.ok) return;
        if (!cancelled) await load();
      } catch {
        // Keep cooldown active so we don't spin on repeated failures.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardStatus, load]);

  if (cardStatus === 'loading') {
    return (
      <div className="rounded-2xl border border-cream-200 bg-cream-50 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-warm-gray">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your search profile.
        </div>
      </div>
    );
  }

  if (cardStatus === 'upgrade_required') {
    return (
      <div className="rounded-2xl border border-cream-200 bg-cream-50 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-gold-100 p-2">
            <Sparkles className="h-4 w-4 text-gold-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-charcoal">Your AI search profile</h3>
            <p className="mt-1 text-sm text-warm-gray">
              Upgrade your plan to unlock the AI-powered search profile and daily job feed.
            </p>
            <a
              href="/pricing"
              className="mt-2 inline-flex items-center text-sm font-medium text-navy-600 underline-offset-2 hover:underline"
            >
              View plans
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (cardStatus === 'no_cv' || (!data && cardStatus !== 'no_profile')) {
    return (
      <div className="rounded-2xl border border-cream-200 bg-cream-50 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-gold-100 p-2">
            <Sparkles className="h-4 w-4 text-gold-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-charcoal">Your AI search profile</h3>
            <p className="mt-1 text-sm text-warm-gray">
              Upload a CV first and Useful Apply will infer your titles, seniority, and skill clusters to power smarter daily searches.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (cardStatus === 'no_profile' || !data?.profile) {
    return (
      <div className="rounded-2xl border border-cream-200 bg-cream-50 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-gold-100 p-2">
            <Sparkles className="h-4 w-4 text-gold-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-charcoal">Your AI search profile</h3>
            <p className="mt-1 text-sm text-warm-gray">
              Useful Apply is reading your CV. Your profile will appear here in a moment.
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
          <h3 className="text-base font-semibold text-charcoal">Your AI search profile</h3>
          <p className="mt-1 text-sm text-warm-gray">
            What Useful Apply inferred from your CV. Powers your daily feed.
          </p>

          {cvNewerThanProfile && (
            <p className="mt-2 rounded-lg bg-gold-50 px-3 py-2 text-xs text-charcoal">
              We&apos;re refreshing your profile to match your latest CV.
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
