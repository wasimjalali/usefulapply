'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowUpRight, Briefcase, Check, Loader2, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDatePrefs } from '@/hooks/useDatePrefs';
import { getJobFeedTierLimits } from '@/lib/job-feed/constants';
import { readJobFeedQueryProgress, type JobFeedQueryProgress } from '@/lib/job-feed/types';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { useCreditsBalance } from '@/hooks/useCreditsBalance';
import { resolveFeedBuild, useFeedStore } from '@/store/useFeedStore';
import { openSettings } from '@/store/useSettingsStore';
import { FeedEditView } from './FeedEditView';
import { FeedJobCard } from './FeedJobCard';
import { FeedJobDetail } from './FeedJobDetail';
import { buildRankedForLine, plural } from './feed-format';
import { getJobFeedPreviewMode, getJobFeedPreviewTier } from './preview-utils';
import { useFeedJobActions } from './useFeedJobActions';
import { useFeedJobLists, useVisibleFeedJobs } from './useVisibleFeedJobs';

interface FeedCanvasProps {
  /**
   * Mobile shows the list and the ad but not the kit actions: the application
   * kit is desktop only, so a Check fit button there would open a workspace
   * the phone cannot show.
   */
  readOnly?: boolean;
}

export function FeedCanvas({ readOnly = false }: FeedCanvasProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const datePrefs = useDatePrefs();
  const { credits } = useCreditsBalance();
  const overview = useFeedStore((state) => state.overview);
  const status = useFeedStore((state) => state.status);
  const errorMessage = useFeedStore((state) => state.errorMessage);
  const rawBuild = useFeedStore((state) => state.build);
  const pollGaveUp = useFeedStore((state) => state.pollGaveUp);
  const strategy = useFeedStore((state) => state.strategy);
  const careerProfile = useFeedStore((state) => state.careerProfile);
  const view = useFeedStore((state) => state.view);
  const listTab = useFeedStore((state) => state.listTab);
  const selectedJobId = useFeedStore((state) => state.selectedJobId);
  const editPill = useFeedStore((state) => state.editPill);
  const loadingMore = useFeedStore((state) => state.loadingMore);
  const loadingSaved = useFeedStore((state) => state.loadingSaved);
  const savedError = useFeedStore((state) => state.savedError);
  const savedJobs = useFeedStore((state) => state.savedJobs);
  const extraJobs = useFeedStore((state) => state.extraJobs);
  const filters = useFeedStore((state) => state.filters);
  const jobs = useVisibleFeedJobs();
  const { all: allJobs } = useFeedJobLists();
  const actions = useFeedJobActions();
  const [detailBusy, setDetailBusy] = useState(false);
  const [previewMode] = useState(() => getJobFeedPreviewMode());

  // Auth does not run in local dev, so a preview names the plan it is showing.
  const tier = getJobFeedPreviewTier(previewMode) ?? profile?.subscription_tier ?? null;
  const canSteer = (tier === 'plus' || tier === 'max') && !readOnly;
  const knownFree = tier === 'free';
  // What actually runs, not the ceiling. Free keeps a second call in reserve
  // for an empty day, and telling the user "2 searches" when one runs would be
  // a promise the normal day does not keep.
  const queryBudget = getJobFeedTierLimits(tier ?? 'free').maxMainQueries;
  const canAffordFit = credits === null || credits.total >= CREDIT_COSTS.FIT_ANALYSIS;
  const canAffordKit = credits === null || credits.total >= CREDIT_COSTS.FULL_APPLICATION;
  const selectedJob = useMemo(
    () => allJobs.find((job) => job.id === selectedJobId) ?? jobs.find((job) => job.id === selectedJobId) ?? null,
    [allJobs, jobs, selectedJobId],
  );
  const build = useMemo(
    () => resolveFeedBuild(rawBuild, overview?.state, pollGaveUp),
    [overview?.state, pollGaveUp, rawBuild],
  );

  // Building takes the whole canvas: J2's searches are the thing to look at.
  if (build) {
    const liveRun = overview?.latestRun;
    const liveProgress = liveRun && (liveRun.status === 'running' || liveRun.status === 'queued')
      ? readJobFeedQueryProgress(liveRun.metadata)
      : [];
    return (
      <BuildingCanvas
        queryBudget={queryBudget}
        strategy={strategy}
        canSteer={canSteer}
        build={build}
        progress={liveProgress}
      />
    );
  }

  if (view === 'edit' && canSteer) {
    return (
      <FeedEditView
        overview={overview}
        profile={careerProfile}
        strategy={strategy}
        queryBudget={queryBudget}
        tier={tier}
        pill={editPill}
        onPillChange={(pill) => useFeedStore.getState().setEditPill(pill)}
        onBack={() => useFeedStore.getState().backToList()}
        onEditProfile={() => router.push('/documents')}
      />
    );
  }

  if (view === 'detail' && selectedJob) {
    return (
      <FeedJobDetail
        job={selectedJob}
        busy={detailBusy || actions.busyJobId === selectedJob.id}
        onBack={() => useFeedStore.getState().backToList()}
        onCheckFit={(job) => { void actions.checkFit(job, 'analyze'); }}
        onGenerateKit={(job) => {
          setDetailBusy(true);
          void actions.checkFit(job, 'apply').finally(() => setDetailBusy(false));
        }}
        onSave={(job) => { void actions.save(job); }}
        onOpenEmployerSite={actions.openEmployerSite}
        onUpgrade={() => openSettings('usage')}
        showCheckFit={!readOnly}
        canAffordFit={canAffordFit}
        canAffordKit={canAffordKit}
      />
    );
  }

  if (status === 'loading' || status === 'idle') {
    return (
      <EmptyCanvas
        icon={<Loader2 className="h-6 w-6 animate-spin" />}
        title="Getting your feed"
      />
    );
  }

  if (status === 'error' || overview?.state === 'error') {
    // The run's stored error_message is written for operators, so it stays in
    // the logs rather than on screen.
    return (
      <EmptyCanvas
        icon={<AlertCircle className="h-6 w-6" />}
        title={overview?.state === 'error' ? "Today's run didn't finish" : "Your feed didn't load"}
        body={overview?.state === 'error'
          ? 'Nothing was charged. Run it again from the conversation.'
          : (errorMessage ?? 'Try again from the conversation.')}
      />
    );
  }

  if (overview?.state === 'setup_required' || overview?.state === 'no_cv_required' || overview?.state === 'upgrade_required') {
    return (
      <EmptyCanvas
        icon={<Briefcase className="h-6 w-6" />}
        title="Your feed lands here"
        body={readOnly
          ? "Set your feed up on a computer and it'll show up here."
          : "Answer the three questions on the left and I'll build it. About a minute. After that you run it again when you want a new list."}
      />
    );
  }

  if (overview?.state === 'awaiting_first_run' || overview?.state === 'paused') {
    return (
      <EmptyCanvas
        icon={<Briefcase className="h-6 w-6" />}
        title="Your feed lands here"
        body={readOnly
          ? "Start your first feed on a computer. After that you can run it again each day."
          : "Start it from the conversation. About a minute. After that you run it again when you want a new list."}
      />
    );
  }

  const showingSaved = listTab === 'saved';
  // An empty list reads differently when the user narrowed it themselves.
  const narrowed = filters.remoteOnly || filters.minSalary !== null || filters.excludedTerms.length > 0;
  // A count nobody has fetched yet is not zero, so the heading holds off.
  const savedCountKnown = savedJobs !== null && !loadingSaved;
  const todayCount = overview?.jobsTodayCount ?? 0;
  const headline = showingSaved
    ? (savedCountKnown ? `${jobs.length} saved ${plural(jobs.length, 'role', 'roles')}` : 'Saved roles')
    : todayCount > 0
      ? (knownFree
        ? `Your top ${jobs.length} today`
        : `${todayCount} new ${plural(todayCount, 'role', 'roles')} today`)
      : `${jobs.length} ${plural(jobs.length, 'role', 'roles')}`;
  const rankedFor = buildRankedForLine(overview, datePrefs);
  const feedCap = overview?.feedCap ?? jobs.length;
  const hiddenMatched = Math.max(0, (overview?.jobsMatchedCount ?? 0) - feedCap);
  const hasMore = !showingSaved
    && overview !== null
    && (overview.jobs.length + extraJobs.length) < (overview.jobsTotalCount ?? 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 items-start gap-3 border-b border-cream-200 px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold text-navy-800">{headline}</h2>
          {rankedFor && <p className="truncate text-xs text-warm-gray">{rankedFor}</p>}
        </div>
        <div className="inline-flex flex-shrink-0 items-center rounded-full border border-cream-200 bg-cream-50 p-0.5" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!showingSaved}
            onClick={actions.showToday}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors duration-200 cursor-pointer ${
              !showingSaved ? 'bg-white font-semibold text-navy-800 shadow-sm' : 'font-medium text-warm-gray hover:text-navy-700'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={showingSaved}
            onClick={actions.showSaved}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors duration-200 cursor-pointer ${
              showingSaved ? 'bg-white font-semibold text-navy-800 shadow-sm' : 'font-medium text-warm-gray hover:text-navy-700'
            }`}
          >
            Saved
          </button>
        </div>
        {canSteer && (
          <button
            type="button"
            onClick={() => useFeedStore.getState().setView('edit')}
            className="inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-full border border-cream-200 bg-cream-50 px-3.5 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white cursor-pointer"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Edit feed
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-5 py-4">
        {loadingSaved && showingSaved && (
          <p className="text-sm text-warm-gray">Loading your saved roles.</p>
        )}

        {showingSaved && savedError && (
          <p className="text-sm text-warm-gray">{savedError}</p>
        )}

        {jobs.length === 0 && !loadingSaved && !(showingSaved && savedError) && (
          <p className="text-sm text-warm-gray">
            {showingSaved
              ? 'Nothing saved yet. The bookmark on a card keeps it here.'
              : narrowed
                ? "Nothing left after the changes you asked for. Loosen one in the conversation and they come back."
                : 'Nothing came back strong enough today. Run it again from the conversation when you want a new list.'}
          </p>
        )}

        {jobs.map((job) => (
          <FeedJobCard
            key={job.id}
            job={job}
            busy={actions.busyJobId === job.id}
            onOpenDetail={actions.openDetail}
            onCheckFit={(item) => { void actions.checkFit(item, 'analyze'); }}
            onSave={(item) => { void actions.save(item); }}
            onOpenEmployerSite={actions.openEmployerSite}
            onUpgrade={() => openSettings('usage')}
            showCheckFit={!readOnly}
            canAffordFit={canAffordFit}
          />
        ))}

        {hasMore && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => { void actions.loadMore(); }}
            className="w-full rounded-2xl border border-cream-200 bg-cream-50 px-5 py-3 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white disabled:cursor-not-allowed disabled:text-warm-gray cursor-pointer"
          >
            {loadingMore ? 'Loading' : 'Show more roles'}
          </button>
        )}

        {knownFree && !readOnly && !showingSaved && jobs.length > 0 && (
          <div className="flex items-center gap-4 rounded-2xl border border-gold-200 bg-gold-50 px-5 py-4">
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-charcoal">
              <strong className="font-semibold">You&apos;re seeing your top {feedCap} today.</strong>
              {hiddenMatched > 0
                ? ` ${hiddenMatched} more ${plural(hiddenMatched, 'role', 'roles')} matched today.`
                : ''}
              {' '}Plus shows every role that matched, searches more sources and lets you steer the feed.
            </p>
            <button
              type="button"
              onClick={() => openSettings('usage')}
              className="inline-flex h-10 flex-shrink-0 items-center gap-2 rounded-full border border-gold-400 bg-cream-50 px-4 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white cursor-pointer"
            >
              See Plus
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyCanvas({ icon, title, body }: { icon: React.ReactNode; title: string; body?: string }) {
  return (
    <div className="flex h-full items-center justify-center px-10">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 text-gold-600">
          {icon}
        </span>
        <h2 className="text-2xl font-semibold text-navy-800">{title}</h2>
        {body && <p className="mt-2 text-sm leading-relaxed text-warm-gray">{body}</p>}
      </div>
    </div>
  );
}

/**
 * J2. The searches are real: they come from the saved strategy, in the order
 * the run works through them. Per-query found counts come from
 * metadata.progress on the run row, polled with the overview.
 */
function BuildingCanvas({
  queryBudget,
  strategy,
  canSteer,
  build,
  progress,
}: {
  queryBudget: number;
  strategy: ReturnType<typeof useFeedStore.getState>['strategy'];
  canSteer: boolean;
  build: NonNullable<ReturnType<typeof useFeedStore.getState>['build']>;
  progress: JobFeedQueryProgress[];
}) {
  const queries = (strategy?.queries ?? []).slice(0, queryBudget);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex-shrink-0 border-b border-cream-200 px-5 py-3">
        <h2 className="text-xl font-semibold text-navy-800">Searching for you</h2>
        <p className="text-xs text-warm-gray">
          {queries.length > 0
            ? `${queries.length} ${plural(queries.length, 'search', 'searches')} today, in priority order.`
            : `${queryBudget} ${plural(queryBudget, 'search', 'searches')} run on your plan each time you build the feed.`}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-5 py-4">
        {queries.map((query, index) => {
          const item = progress.find((entry) => entry.query === query.query) ?? progress[index];
          const done = build.searchDone || item?.status === 'done' || item?.status === 'failed';
          const foundLine = item && (item.status === 'done' || item.status === 'failed')
            ? `${item.found} found`
            : null;
          return (
          <div
            key={`${query.query}-${index}`}
            className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${
              done ? 'border-gold-200 bg-gold-50' : 'border-cream-200 bg-cream-50'
            }`}
          >
            <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full">
              {done ? (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold-400 text-white">
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </span>
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-gold-500" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-navy-800">{query.query}</p>
              <p className="mt-0.5 text-xs text-warm-gray">{query.rationale}</p>
              {foundLine && <p className="mt-1 text-[11px] text-warm-gray">{foundLine}</p>}
            </div>
          </div>
          );
        })}

        {queries.length === 0 && (
          <p className="text-sm text-warm-gray">
            {canSteer
              ? "I'm planning the searches now. They show up here as soon as they're set."
              : 'Plus shows you every query it runs and why.'}
          </p>
        )}
      </div>
    </div>
  );
}
