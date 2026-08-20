'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { Send } from 'lucide-react';
import { BrandIcon } from '@/components/BrandLogo';
import { MarkdownText } from '@/components/MarkdownText';
import { NamedStages, type NamedStage } from '@/components/shell/NamedStages';
import { useAuth } from '@/contexts/AuthContext';
import { openSettings } from '@/store/useSettingsStore';
import { useUIStore } from '@/store/useUIStore';
import {
  resolveFeedBuild,
  selectFeedThreadKey,
  selectVisibleJobs,
  useFeedStore,
  type FeedChip,
  type FeedMessage,
} from '@/store/useFeedStore';
import { useFeedJobLists } from './useVisibleFeedJobs';
import {
  JOB_FEED_COUNTRY_OPTIONS,
  getJobFeedTierLimits,
} from '@/lib/job-feed/constants';
import { createDefaultJobFeedInput, getLocalDateKey, toJobFeedInput } from '@/lib/job-feed/helpers';
import type { JobFeedFeedItem, JobFeedSettingsInput } from '@/lib/job-feed/types';
import { applyFeedIntent, detectFeedIntent, formatSalary } from '@/lib/job-feed/rerank-intent';
import { parseSetupLine } from '@/lib/job-feed/setup-intent';
import {
  loadCareerProfile,
  loadFeedOverview,
  loadSavedFeedJobs,
  loadSearchStrategy,
  runFeed,
  saveFeedSettings,
} from './feed-actions';
import { countryLabel, escapeMarkdown, formatFeedDay, plural } from './feed-format';
import {
  buildJobFeedPreviewCareerProfile,
  buildJobFeedPreviewSnapshot,
  buildJobFeedPreviewStrategy,
  getJobFeedPreviewMode,
  getJobFeedPreviewTier,
} from './preview-utils';

type FeedPhase =
  | 'loading'
  | 'upgrade'
  | 'no_cv'
  | 'setup'
  | 'awaiting'
  | 'building'
  | 'feed'
  | 'empty'
  | 'error';

const SETUP_COUNTRY_CHIPS = JOB_FEED_COUNTRY_OPTIONS.slice(0, 5);
const SALARY_CHIPS = [120_000, 150_000, 180_000];

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function FeedConversation() {
  const posthog = usePostHog();
  const { user, profile } = useAuth();

  const status = useFeedStore((state) => state.status);
  const overview = useFeedStore((state) => state.overview);
  const errorMessage = useFeedStore((state) => state.errorMessage);
  const build = useFeedStore((state) => state.build);
  const isRunning = useFeedStore((state) => state.isRunning);
  const isSavingSettings = useFeedStore((state) => state.isSavingSettings);
  const pollGaveUp = useFeedStore((state) => state.pollGaveUp);
  const strategy = useFeedStore((state) => state.strategy);
  const careerProfile = useFeedStore((state) => state.careerProfile);
  const thread = useFeedStore((state) => state.thread);
  const setupStep = useFeedStore((state) => state.setupStep);
  const setupDraft = useFeedStore((state) => state.setupDraft);
  const filters = useFeedStore((state) => state.filters);
  const usedChips = useFeedStore((state) => state.usedChips);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const [previewMode] = useState(() => getJobFeedPreviewMode());
  const isPreviewing = previewMode !== 'off';

  // Auth does not run in local dev, so a preview names the plan it is showing.
  // Do not fall back to free while the real plan is still unknown.
  const tier = getJobFeedPreviewTier(previewMode) ?? profile?.subscription_tier ?? null;
  const canSteer = tier === 'plus' || tier === 'max';
  const knownFree = tier === 'free';
  const queryBudget = getJobFeedTierLimits(tier ?? 'free').maxDailyQueries;

  // ---- data ---------------------------------------------------------------

  useEffect(() => {
    if (isPreviewing) {
      const snapshot = buildJobFeedPreviewSnapshot(previewMode, browserTimeZone());
      const store = useFeedStore.getState();
      store.setOverview(snapshot.overview);
      store.setStrategy(buildJobFeedPreviewStrategy());
      store.setCareerProfile(buildJobFeedPreviewCareerProfile());
      store.setStatus('ready');
      return;
    }
    if (!user) {
      const store = useFeedStore.getState();
      store.resetFeed();
      store.setStatus('ready');
      return;
    }
    void loadFeedOverview();
  }, [isPreviewing, previewMode, user]);

  // The queries and the CV read-out feed both the building canvas and Edit
  // feed. Paid plans only; the endpoints 403 otherwise and we show less.
  useEffect(() => {
    if (isPreviewing || !user || !canSteer) return;
    void loadSearchStrategy();
    void loadCareerProfile();
  }, [canSteer, isPreviewing, user]);

  // While a run is in flight the overview is the only source of truth for
  // "is it done". 5s while it is young, 10s after two minutes, capped.
  const runStatus = overview?.latestRun?.status;
  useEffect(() => {
    if (isPreviewing) return;
    const inFlight = runStatus === 'running' || runStatus === 'queued';
    if (!inFlight) return;

    const startedAt = Date.now();
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let delayMs = 10_000;
    let warned = false;
    const schedule = () => {
      if (cancelled) return;
      const elapsed = Date.now() - startedAt;
      if (elapsed > 20 * 60_000) {
        delayMs = 30_000;
        if (!warned) {
          warned = true;
          const store = useFeedStore.getState();
          store.setBuild(null);
          store.setPollGaveUp(true);
          store.addMessage(selectFeedThreadKey(store), {
            role: 'assistant',
            content: "This is taking longer than it should. I'll keep whatever is already on the right and keep checking in the background. You can try running it again.",
            chips: [{ id: 'retry-run', label: 'Run it again', variant: 'primary' }],
          });
        }
      }
      timeoutId = setTimeout(async () => {
        const result = await loadFeedOverview({ quiet: true });
        if (cancelled) return;
        if (!result.ok && result.status === 429) delayMs = 20_000;
        schedule();
      }, delayMs);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [isPreviewing, runStatus]);

  // ---- derived ------------------------------------------------------------

  const phase: FeedPhase = useMemo(() => {
    if (status === 'loading' || (status === 'idle' && !overview)) return 'loading';
    if (status === 'error') return 'error';
    if (pollGaveUp) {
      return overview?.jobs && overview.jobs.length > 0 ? 'feed' : 'empty';
    }
    if (build || isRunning) return 'building';
    if (!overview) return 'error';
    switch (overview.state) {
      case 'upgrade_required':
        return 'upgrade';
      case 'no_cv_required':
        return 'no_cv';
      case 'setup_required':
        return 'setup';
      case 'paused':
      case 'awaiting_first_run':
        return 'awaiting';
      case 'generating':
        return 'building';
      case 'error':
        return 'error';
      case 'empty':
        return 'empty';
      default:
        return 'feed';
    }
  }, [build, isRunning, overview, pollGaveUp, status]);

  const { all: allJobs } = useFeedJobLists();
  const todayCount = overview?.jobsTodayCount ?? 0;
  const totalCount = overview?.jobsTotalCount ?? 0;
  const feedKey = selectFeedThreadKey({ overview });
  const canRunToday = (() => {
    const run = overview?.latestManualRun ?? overview?.latestRun ?? null;
    if (!run) return true;
    if (run.status === 'running' || run.status === 'queued') return false;
    const timeZone = overview?.settings?.user_timezone || run.local_timezone || 'UTC';
    return run.local_date !== getLocalDateKey(new Date(), timeZone);
  })();

  const openingMessages = useMemo(
    () => buildOpening({
      phase,
      overview,
      careerProfile,
      allJobs,
      todayCount,
      totalCount,
      canSteer,
      knownFree,
      canRunToday,
      tier,
      setupStep,
      setupDraft,
      errorMessage,
      build,
      queryBudget,
      plannedQueries: strategy?.queries.length ?? null,
      usedChipIds: usedChips.key === feedKey ? usedChips.ids : [],
    }),
    [
      allJobs, build, canRunToday, canSteer, careerProfile, errorMessage, feedKey,
      knownFree, overview, phase, queryBudget, setupDraft, setupStep,
      strategy?.queries.length, tier, todayCount, totalCount, usedChips,
    ],
  );

  const messages: FeedMessage[] = useMemo(() => {
    // A thread written for an earlier feed does not belong under today's
    // opening message, so it is dropped rather than replayed. A chip already
    // picked is gone from every message, derived or not.
    const spent = usedChips.key === feedKey ? usedChips.ids : [];
    const items = [...openingMessages, ...(thread.key === feedKey ? thread.items : [])];
    return items.map((item) => (
      item.chips?.some((chip) => spent.includes(chip.id))
        ? { ...item, chips: item.chips.filter((chip) => !spent.includes(chip.id)) }
        : item
    ));
  }, [feedKey, openingMessages, thread, usedChips]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, build]);

  // ---- helpers ------------------------------------------------------------

  const say = useCallback((message: Omit<FeedMessage, 'id'>) => {
    const store = useFeedStore.getState();
    store.addMessage(selectFeedThreadKey(store), message);
  }, []);

  // Null when nothing is saved yet. The settings PUT is a full replace, so
  // synthesising defaults here would overwrite countries, cities, work mode,
  // salary floor and avoid-words the client has not loaded.
  const currentSettingsInput = useCallback((): JobFeedSettingsInput | null => {
    const settings = useFeedStore.getState().overview?.settings;
    return settings ? toJobFeedInput(settings, browserTimeZone()) : null;
  }, []);

  const startBuild = useCallback((firstTime: boolean) => {
    useFeedStore.getState().setBuild({
      profileDone: !firstTime,
      strategyDone: !firstTime,
      searchDone: false,
      plannedQueries: null,
    });
  }, []);

  const finishBuild = useCallback(async () => {
    useFeedStore.getState().patchBuild({ searchDone: true });
    let result = await loadFeedOverview({ quiet: true });
    if (!result.ok) result = await loadFeedOverview();
    useFeedStore.getState().setBuild(null);
    if (!result.ok) {
      say({
        role: 'assistant',
        content: "The search finished but I couldn't load the list. Try again in a moment.",
        chips: [{ id: 'retry-load', label: 'Try again', variant: 'primary' }],
      });
    }
  }, [say]);

  const triggerRun = useCallback(async (firstTime: boolean) => {
    // Clear the give-up flag first. It suppresses the building view in both
    // columns, so leaving it set until the run returns makes "Run it again"
    // look like a dead button for the whole run.
    useFeedStore.getState().setPollGaveUp(false);
    startBuild(firstTime);
    const result = await runFeed();
    if (!result.ok) {
      useFeedStore.getState().setBuild(null);
      say({ role: 'assistant', content: result.error });
      return;
    }
    if (result.data.cooldown || result.data.skipped) {
      useFeedStore.getState().setBuild(null);
      await loadFeedOverview({ quiet: true });
      say({
        role: 'assistant',
        content: "Today's feed is already built. You can run it again tomorrow.",
      });
      return;
    }
    posthog?.capture('job_feed_manual_run_requested', { source: 'feed_conversation' });
    await finishBuild();
  }, [finishBuild, posthog, say, startBuild]);

  const completeSetup = useCallback(async (draft: JobFeedSettingsInput) => {
    startBuild(true);
    const saved = await saveFeedSettings(draft, { firstTime: true });
    if (!saved.ok) {
      useFeedStore.getState().setBuild(null);
      say({ role: 'assistant', content: saved.error });
      return;
    }
    posthog?.capture('job_feed_setup_completed', { source: 'feed_conversation' });
    await loadFeedOverview({ quiet: true });
    await loadSearchStrategy();
    await loadCareerProfile();
    const result = await runFeed();
    if (!result.ok) {
      useFeedStore.getState().setBuild(null);
      say({ role: 'assistant', content: result.error });
      return;
    }
    await finishBuild();
  }, [finishBuild, posthog, say, startBuild]);

  /** Save a steering change and narrow what is already on screen. */
  const applySteer = useCallback(async (text: string) => {
    const intent = detectFeedIntent(text);
    if (intent.kind === 'unknown') {
      say({
        role: 'assistant',
        content: 'I can change where I look, the work mode, the salary floor and the words to avoid. Try "only remote", "salary floor 150K" or "no agencies".',
      });
      return;
    }

    if (!canSteer) {
      say({
        role: 'assistant',
        content: 'Steering the feed is on Plus and Max. On a paid plan I save changes like that and use them on the next run.',
        chips: [{ id: 'see-plus', label: 'See Plus', variant: 'primary' }],
      });
      return;
    }

    const currentSettings = currentSettingsInput();
    if (!currentSettings) {
      say({
        role: 'assistant',
        content: "Give me a second, I'm still loading your feed settings. Ask me again in a moment and it'll stick.",
      });
      return;
    }

    const store = useFeedStore.getState();
    const before = selectVisibleJobs(store);
    const nextFilters = {
      remoteOnly: filters.remoteOnly || intent.remoteOnly,
      minSalary: intent.minSalary ?? filters.minSalary,
      excludedTerms: [...filters.excludedTerms, ...intent.excludeFromList],
    };
    store.setFilters(nextFilters);
    const after = selectVisibleJobs(useFeedStore.getState());
    const hidden = before.length - after.length;

    if (!isPreviewing) {
      const saved = await saveFeedSettings(
        applyFeedIntent(currentSettings, intent, intent.kind === 'add_city' ? cityFrom(intent.confirmation) : undefined),
      );
      if (!saved.ok) {
        store.setFilters(filters);
        say({ role: 'assistant', content: saved.error });
        return;
      }
    }

    posthog?.capture('job_feed_steered', { intent: intent.kind });
    const listLine = hidden > 0
      ? ` I've hidden ${hidden} ${plural(hidden, 'role', 'roles')} from today's list.`
      : " Today's list already matches.";
    say({
      role: 'assistant',
      content: `${intent.confirmation}${listLine} The next run uses it from the start.`,
    });
  }, [canSteer, currentSettingsInput, filters, isPreviewing, posthog, say]);

  // ---- chip and composer handling ----------------------------------------

  const handleChip = useCallback(async (chip: FeedChip) => {
    const store = useFeedStore.getState();

    if (chip.id.startsWith('country:')) {
      const code = chip.id.slice('country:'.length);
      store.patchSetupDraft({ target_countries: [code], target_market: code === 'ca' ? 'canada' : 'us' });
      store.setSetupStep(1);
      return;
    }
    if (chip.id.startsWith('workmode:')) {
      const mode = chip.id.slice('workmode:'.length) as JobFeedSettingsInput['remote_preference'];
      store.patchSetupDraft({ remote_preference: mode, remote_preferences: [mode] });
      store.setSetupStep(2);
      return;
    }
    if (chip.id.startsWith('salary:')) {
      const raw = chip.id.slice('salary:'.length);
      store.patchSetupDraft({ salary_floor: raw === 'skip' ? null : Number(raw) });
      store.setSetupStep(3);
      return;
    }

    switch (chip.id) {
      case 'consent': {
        const base = createDefaultJobFeedInput(browserTimeZone());
        await completeSetup({ ...base, ...setupDraft, enabled: true, consent_accepted: true });
        return;
      }
      case 'build-feed':
        await triggerRun(false);
        return;
      case 'resume-feed': {
        const paused = currentSettingsInput();
        if (!paused) {
          say({ role: 'assistant', content: "Give me a second, I'm still loading your feed settings. Try that again in a moment." });
          return;
        }
        const saved = await saveFeedSettings({ ...paused, enabled: true, consent_accepted: true });
        if (!saved.ok) {
          say({ role: 'assistant', content: saved.error });
          return;
        }
        await loadFeedOverview({ quiet: true });
        say({ role: 'assistant', content: "Back on. I'll use these settings on the next run." });
        return;
      }
      case 'only-remote':
        store.markChipUsed(selectFeedThreadKey(store), chip.id);
        say({ role: 'user', content: 'Only remote' });
        await applySteer('only remote');
        return;
      case 'raise-salary':
        store.markChipUsed(selectFeedThreadKey(store), chip.id);
        say({ role: 'user', content: 'Raise my salary floor' });
        say({
          role: 'assistant',
          content: 'What floor should I hold you to?',
          chips: SALARY_CHIPS.map((value) => ({
            id: `floor:${value}`,
            label: formatSalary(value),
            variant: 'secondary' as const,
          })),
        });
        return;
      case 'upload-cv':
        useUIStore.getState().setActiveTab('cv');
        return;
      case 'see-plus':
        posthog?.capture('job_feed_upgrade_clicked', { source: 'feed_conversation' });
        openSettings('usage');
        return;
      case 'retry-run':
      case 'build-today':
        await triggerRun(false);
        return;
      case 'retry-load':
        await loadFeedOverview();
        return;
      case 'show-saved':
        store.setListTab('saved');
        store.setView('list');
        if (store.savedJobs === null) void loadSavedFeedJobs();
        return;
      default:
        break;
    }

    if (chip.id.startsWith('floor:')) {
      for (const value of SALARY_CHIPS) store.markChipUsed(selectFeedThreadKey(store), `floor:${value}`);
      const value = Number(chip.id.slice('floor:'.length));
      say({ role: 'user', content: formatSalary(value) });
      await applySteer(`salary floor ${value}`);
      return;
    }
    if (chip.id.startsWith('why:')) {
      const jobId = chip.id.slice('why:'.length);
      store.markChipUsed(selectFeedThreadKey(store), chip.id);
      const job = allJobs.find((item) => item.id === jobId);
      if (!job) return;
      say({ role: 'user', content: `Why ${escapeMarkdown(job.company)} first?` });
      say({ role: 'assistant', content: buildWhyAnswer(job) });
      return;
    }
  }, [allJobs, applySteer, completeSetup, currentSettingsInput, posthog, say, setupDraft, triggerRun]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    try {
      if (phase === 'setup') {
        const parsed = parseSetupLine(text);
        const store = useFeedStore.getState();
        say({ role: 'user', content: text });
        if (parsed.countries.length === 0) {
          say({
            role: 'assistant',
            content: 'I need a country to search in. Pick one above, or name it and I\'ll take it from there.',
          });
          return;
        }
        const base = createDefaultJobFeedInput(browserTimeZone());
        const draft: Partial<JobFeedSettingsInput> = {
          ...store.setupDraft,
          target_countries: parsed.countries,
          target_market: parsed.countries.length === 1 && parsed.countries[0] === 'ca' ? 'canada' : 'us',
          remote_preference: parsed.remotePreference ?? store.setupDraft.remote_preference ?? base.remote_preference,
          remote_preferences: [parsed.remotePreference ?? store.setupDraft.remote_preference ?? base.remote_preference],
          salary_floor: parsed.salaryFloor ?? store.setupDraft.salary_floor ?? null,
        };
        store.patchSetupDraft(draft);
        store.setSetupStep(3);
        return;
      }

      say({ role: 'user', content: text });
      await applySteer(text);
    } finally {
      setBusy(false);
    }
  }, [applySteer, busy, input, phase, say]);

  // ---- render -------------------------------------------------------------

  const headerSubtitle = (() => {
    if (phase === 'loading') return 'Loading';
    if (phase === 'building') return 'Building · about a minute';
    if (phase === 'setup' || phase === 'awaiting') return 'Not built yet';
    if (phase === 'error') return overview?.state === 'error' ? "Today's run failed" : 'Feed did not load';
    const day = formatFeedDay(new Date());
    if (phase === 'feed') {
      const count = todayCount > 0 ? todayCount : totalCount;
      const label = todayCount > 0 ? 'new' : '';
      return `${day} · ${count} ${label} ${plural(count, 'role', 'roles')}`.replace('  ', ' ');
    }
    return day;
  })();

  const resolvedBuild = resolveFeedBuild(build, overview?.state, pollGaveUp);
  const stages = resolvedBuild
    ? buildStages(resolvedBuild, queryBudget, strategy?.queries.length ?? null)
    : null;

  return (
    <section className="flex h-full w-full min-w-0 flex-col border-r border-cream-200 bg-cream-50">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-cream-200 px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-base font-semibold text-navy-800">Today&apos;s feed</h2>
          <p className="text-xs text-warm-gray">{headerSubtitle}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 pb-3 pt-4">
        {messages.map((message) => (
          message.role === 'user' ? (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[86%] rounded-2xl rounded-br-sm border border-cream-200 bg-white px-3.5 py-3 shadow-sm">
                <MarkdownText content={message.content} className="text-sm text-charcoal" />
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex gap-3">
              <div className="h-fit flex-shrink-0">
                <BrandIcon size="xs" theme="light" />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <MarkdownText content={message.content} className="text-sm leading-relaxed text-charcoal" />
                {message.chips && message.chips.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {message.chips.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        disabled={busy || isSavingSettings}
                        onClick={() => { void handleChip(chip); }}
                        className={`inline-flex h-10 max-w-full items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${
                          chip.variant === 'primary'
                            ? 'bg-gold-400 text-white hover:bg-gold-500'
                            : 'border border-cream-200 bg-cream-50 text-navy-800 shadow-sm hover:bg-white'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}
                {message.note && <p className="text-sm text-warm-gray">{message.note}</p>}
              </div>
            </div>
          )
        ))}

        {stages && (
          <div className="pl-9">
            <div className="rounded-2xl border border-cream-200 bg-white p-3 shadow-sm">
              <NamedStages stages={stages.list} percent={stages.percent} />
            </div>
          </div>
        )}

        {phase === 'feed' && knownFree && (
          <p className="pl-9 text-sm text-warm-gray">
            Plus searches more sources and shows every role that matched.
          </p>
        )}

        <div ref={endRef} />
      </div>

      <div className="flex-shrink-0 border-t border-cream-200 bg-cream-50 px-5 pb-4 pt-2.5">
        <div className="flex items-end gap-2 rounded-2xl border border-cream-200 bg-white px-3.5 py-2.5 shadow-sm">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            disabled={busy || isSavingSettings}
            placeholder={phase === 'setup'
              ? 'Or just type it: "US and Canada, remote, 150K+"'
              : phase === 'building'
                ? "You can keep typing, I'll answer after this"
                : 'Tell me what to change, e.g. "more remote, no agencies"'}
            className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-charcoal placeholder:text-warm-gray/70 focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => { void handleSend(); }}
            disabled={!input.trim() || busy || isSavingSettings}
            aria-label="Send"
            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gold-400 text-white transition-colors duration-200 hover:bg-gold-500 disabled:cursor-not-allowed disabled:bg-cream-200 disabled:text-warm-gray cursor-pointer"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Derived conversation
// ---------------------------------------------------------------------------

function buildStages(
  build: { profileDone: boolean; strategyDone: boolean; searchDone: boolean },
  queryBudget: number,
  plannedQueries: number | null,
): { list: NamedStage[]; percent: number } {
  const searchCount = plannedQueries === null ? queryBudget : Math.min(plannedQueries, queryBudget);
  const list: NamedStage[] = [
    {
      title: 'Reading your profile',
      detail: 'Titles, seniority and skill areas from your CV',
      state: build.profileDone ? 'done' : 'active',
    },
    {
      title: 'Planning your searches',
      detail: `${searchCount} ${plural(searchCount, 'search', 'searches')} worth running today`,
      state: build.strategyDone ? 'done' : build.profileDone ? 'active' : 'todo',
    },
    {
      title: 'Searching',
      detail: `${searchCount} ${plural(searchCount, 'search', 'searches')} across public job boards`,
      state: build.searchDone ? 'done' : build.strategyDone ? 'active' : 'todo',
    },
    {
      title: 'Ranking against your CV',
      detail: 'Strong, good and the rest',
      state: build.searchDone ? 'done' : 'todo',
    },
  ];
  const done = list.filter((stage) => stage.state === 'done').length;
  return { list, percent: (done / list.length) * 100 };
}

function buildWhyAnswer(job: JobFeedFeedItem): string {
  if (job.matchReason) return escapeMarkdown(job.matchReason);
  const facts: string[] = [];
  if (job.fitLabel === 'strong') facts.push('it came out as a strong match');
  if (job.location) facts.push(escapeMarkdown(job.location.toLowerCase()));
  if (job.salaryText) facts.push(escapeMarkdown(job.salaryText));
  const tail = facts.length > 0 ? ` What I have on it: ${facts.join(', ')}.` : '';
  return `I don't have a written reason stored for this one.${tail} Open it and read the ad, then check the fit if it looks right.`;
}

function buildOpening(params: {
  phase: FeedPhase;
  overview: ReturnType<typeof useFeedStore.getState>['overview'];
  careerProfile: ReturnType<typeof useFeedStore.getState>['careerProfile'];
  allJobs: JobFeedFeedItem[];
  todayCount: number;
  totalCount: number;
  canSteer: boolean;
  knownFree: boolean;
  canRunToday: boolean;
  tier: string | null;
  setupStep: 0 | 1 | 2 | 3;
  setupDraft: Partial<JobFeedSettingsInput>;
  errorMessage: string | null;
  build: unknown;
  queryBudget: number;
  plannedQueries: number | null;
  usedChipIds: string[];
}): FeedMessage[] {
  const {
    phase, overview, careerProfile, allJobs, todayCount, canSteer,
    canRunToday, setupStep, setupDraft, errorMessage, queryBudget,
    plannedQueries, usedChipIds,
  } = params;
  const message = (content: string, chips?: FeedChip[], note?: string): FeedMessage => ({
    id: `feed-opening-${content.slice(0, 24)}`,
    role: 'assistant',
    content,
    chips,
    note,
  });

  switch (phase) {
    case 'loading':
      return [message('Getting today\'s feed.')];

    case 'error':
      // Two different failures: the feed did not load, or the run itself
      // failed. Only the second one is worth re-running.
      return overview?.state === 'error'
        ? [message(
            "Today's run didn't finish, so there's nothing new to show. Nothing was charged. I can run it again now.",
            [{ id: 'retry-run', label: 'Run it again', variant: 'primary' }],
          )]
        : [message(
            errorMessage ?? 'Your feed did not load. Try again in a moment.',
            [{ id: 'retry-load', label: 'Try again', variant: 'primary' }],
          )];

    case 'upgrade':
      return [message(
        'The daily feed is on Free, Plus and Max. Your plan does not have it yet.',
        [{ id: 'see-plus', label: 'See Plus', variant: 'primary' }],
      )];

    case 'no_cv':
      return [message(
        'I read your CV to know what to search for. Upload it and I\'ll build the feed.',
        [{ id: 'upload-cv', label: 'Upload my CV', variant: 'primary' }],
      )];

    case 'awaiting':
      return [message(
        overview?.state === 'paused'
          ? 'Your feed is paused. Turn it back on and I\'ll use these settings on the next run.'
          : 'Everything\'s set. I\'ll search public job boards for you and rank what I find against your CV. You run it when you want a new list.',
        [{
          id: overview?.state === 'paused' ? 'resume-feed' : 'build-feed',
          label: overview?.state === 'paused' ? 'Turn it back on' : 'Build my feed',
          variant: 'primary',
        }],
      )];

    case 'building':
      return [message('Building your feed. I\'ll show you what I\'m doing on the right.')];

    case 'empty':
      // Nothing to click: one run per day, so widening now changes tomorrow,
      // and the conversation is where that gets said.
      return [message(
        canSteer
          ? "I searched but nothing came back strong enough to show you. Tell me what to loosen and the next run picks it up. Your countries, work mode and salary floor are all fair game."
          : 'I searched but nothing came back strong enough to show you.',
        canRunToday
          ? [{ id: 'build-today', label: "Build today's feed", variant: 'primary' }]
          : undefined,
      )];

    case 'setup': {
      const items: FeedMessage[] = [];
      const readOut = describeProfile(careerProfile);
      items.push(message(
        readOut
          ? `I read your CV: ${readOut}. I'll search for roles like that when you build the feed. Three quick things I can't guess from the CV.`
          : "I'll search public job boards for roles like yours when you build the feed. Three quick things I can't read off your CV.",
      ));

      items.push({
        id: 'setup-q1',
        role: 'assistant',
        content: '**Where should I look?**',
        chips: setupStep === 0
          ? SETUP_COUNTRY_CHIPS.map((option) => ({
              id: `country:${option.value}`,
              label: option.label,
              variant: 'secondary' as const,
            }))
          : undefined,
      });
      if (setupStep > 0) {
        items.push({
          id: 'setup-a1',
          role: 'user',
          content: (setupDraft.target_countries ?? []).map(countryLabel).join(', '),
        });
        items.push({
          id: 'setup-q2',
          role: 'assistant',
          content: '**How do you want to work?**',
          chips: setupStep === 1
            ? [
                { id: 'workmode:remote_only', label: 'Remote only', variant: 'secondary' as const },
                { id: 'workmode:remote_first', label: 'Remote first', variant: 'secondary' as const },
                { id: 'workmode:hybrid', label: 'Hybrid okay', variant: 'secondary' as const },
                { id: 'workmode:onsite', label: 'On-site okay', variant: 'secondary' as const },
              ]
            : undefined,
        });
      }
      if (setupStep > 1) {
        items.push({
          id: 'setup-a2',
          role: 'user',
          content: workModeAnswer(setupDraft.remote_preference ?? null),
        });
        items.push({
          id: 'setup-q3',
          role: 'assistant',
          content: '**Minimum salary, or skip?**',
          chips: setupStep === 2
            ? [
                ...SALARY_CHIPS.map((value) => ({
                  id: `salary:${value}`,
                  label: formatSalary(value),
                  variant: 'secondary' as const,
                })),
                { id: 'salary:skip', label: 'Skip', variant: 'secondary' as const },
              ]
            : undefined,
        });
      }
      if (setupStep > 2) {
        items.push({
          id: 'setup-a3',
          role: 'user',
          content: setupDraft.salary_floor ? formatSalary(setupDraft.salary_floor) : 'Skip',
        });
        items.push({
          id: 'setup-consent',
          role: 'assistant',
          content: 'I\'ll search public job boards on your behalf. OK?',
          chips: [{ id: 'consent', label: 'Yes, build my feed', variant: 'primary' }],
        });
      }
      return items;
    }

    case 'feed':
    default: {
      // Named companies are the strong matches themselves, so the count and
      // the names can never disagree. Counts come from today's run, not the
      // 7-day inbox, and only from jobs that are actually loaded.
      const strongTop = allJobs.filter((job) => job.fitLabel === 'strong').slice(0, 2);
      const strong = allJobs.filter((job) => job.fitLabel === 'strong').length;
      const diagnosticsBelongToFeed = overview?.latestRun?.id === overview?.feedRun?.id;
      const duplicates = diagnosticsBelongToFeed
        ? (overview?.latestRunDiagnostics?.duplicateCount ?? 0)
        : 0;
      const ranToday = !canRunToday;
      const searchCount = plannedQueries === null ? null : Math.min(plannedQueries, queryBudget);
      const strongNames = strongTop.map((job) => escapeMarkdown(job.company)).join(' and ');
      const strongLine = strongTop.length > 0
        ? ` ${strong} strong ${plural(strong, 'match', 'matches')} in this list: ${strongNames}.`
        : '';
      const dupLine = ranToday && duplicates > 0
        ? ` ${duplicates} ${plural(duplicates, 'duplicate was', 'duplicates were')} removed.`
        : '';

      const lead = strongTop[0] ?? allJobs[0];
      const chips: FeedChip[] = [];
      if (canRunToday) {
        chips.push({ id: 'build-today', label: "Build today's feed", variant: 'primary' });
      }
      if (lead) chips.push({ id: `why:${lead.id}`, label: `Why ${lead.company} first?`, variant: 'secondary' });
      if (canSteer) {
        chips.push({ id: 'only-remote', label: 'Only remote', variant: 'secondary' });
        chips.push({ id: 'raise-salary', label: 'Raise my salary floor', variant: 'secondary' });
      }

      const body = ranToday
        ? `Good morning. ${
            searchCount === null
              ? 'I searched for you'
              : `I ran ${searchCount} ${plural(searchCount, 'search', 'searches')} for you`
          } and found ${todayCount} ${plural(todayCount, 'new role', 'new roles')}.${strongLine}${dupLine}`
        : `${plural(allJobs.length, 'This role is', 'These roles are')} from your last search.${strongLine} There is no automatic morning run. I can search again now.`;

      return [message(
        body,
        chips.filter((chip) => !usedChipIds.includes(chip.id)),
      )];
    }
  }
}

/** "Senior Product Manager, B2B SaaS, API and integrations" from the profile. */
function describeProfile(profile: ReturnType<typeof useFeedStore.getState>['careerProfile']): string | null {
  if (!profile) return null;
  const context = profile.industryDomains.length > 0
    ? profile.industryDomains.slice(0, 2)
    : profile.primarySkillClusters.slice(0, 1).map((cluster) => cluster.name);
  const parts = [profile.inferredTitles[0]?.canonical, ...context]
    .filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(', ') : null;
}

function workModeAnswer(value: JobFeedSettingsInput['remote_preference'] | null): string {
  switch (value) {
    case 'remote_only':
      return 'Remote only';
    case 'remote_first':
      return 'Remote first';
    case 'hybrid':
      return 'Hybrid okay';
    case 'onsite':
      return 'On-site okay';
    default:
      return 'Flexible';
  }
}

function cityFrom(confirmation: string): string | undefined {
  const match = confirmation.match(/^(.+?) is in the search now\.$/);
  return match?.[1];
}
