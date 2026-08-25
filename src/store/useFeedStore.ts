/**
 * Job Feed store: the state the feed conversation (middle column) and the
 * feed canvas (right column) both read. Deliberately NOT persisted: the
 * feed is a daily artefact rebuilt from `/api/job-feed/overview` on every
 * open, and the conversation's opening message is derived from that payload,
 * so a reload should show today's real feed rather than yesterday's replay.
 *
 * Application state still lives in useSessionStore. Nothing here is written
 * back to D1, so no mapping in useSupabaseSync is needed.
 */

import { create } from 'zustand';
import type {
  JobFeedFeedItem,
  JobFeedItemFeedbackState,
  JobFeedOverviewResponse,
  JobFeedSettingsInput,
} from '@/lib/job-feed/types';
import type { SearchStrategy } from '@/lib/job-feed/search-strategy';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import type { ConfirmedSearchQuery } from '@/lib/job-feed/search-plan';

/** Which surface the canvas shows. The list is the home; the others have Back. */
export type FeedCanvasView = 'list' | 'detail' | 'edit';
export type FeedListTab = 'today' | 'saved';
export type FeedEditPill = 'profile' | 'searches';
export type FeedSetupStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A chip offered under an assistant message. Handlers live in the conversation. */
export interface FeedChip {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary';
  pressed?: boolean;
}

export interface FeedMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  chips?: FeedChip[];
  /** Consent line renders under the last setup question, per J1. */
  note?: string;
}

/**
 * Client-side narrowing applied to today's list after a chat request. Today's
 * ranking is fixed once the run completes (one run per day), so "only remote"
 * filters what is on screen and saves the preference for the next run. The
 * conversation says exactly that; see BACKEND-GAPS.md.
 */
export interface FeedListFilters {
  remoteOnly: boolean;
  minSalary: number | null;
  excludedTerms: string[];
}

export const EMPTY_FEED_FILTERS: FeedListFilters = {
  remoteOnly: false,
  minSalary: null,
  excludedTerms: [],
};

/** Named stages for J2. Driven by real completions, never by a timer. */
export interface FeedBuildState {
  profileDone: boolean;
  strategyDone: boolean;
  searchDone: boolean;
  /** How many searches actually run today (the tier's daily query budget). */
  plannedQueries: number | null;
}

interface FeedState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  errorMessage: string | null;
  overview: JobFeedOverviewResponse | null;
  /** Pages 2+ of the inbox, loaded on demand. */
  extraJobs: JobFeedFeedItem[];
  loadingMore: boolean;
  savedJobs: JobFeedFeedItem[] | null;
  loadingSaved: boolean;
  /** Set when the saved list failed to load, so an empty list is not read as "none saved". */
  savedError: string | null;
  strategy: SearchStrategy | null;
  careerProfile: CareerProfile | null;
  /** Non-null while a run or a first-time setup is in flight. */
  build: FeedBuildState | null;
  isRunning: boolean;
  isSavingSettings: boolean;
  /**
   * True after the in-tab poller has waited 20 minutes on a still-generating
   * run. The conversation leaves the building view; a later successful
   * overview that is no longer generating clears it.
   */
  pollGaveUp: boolean;
  /** Bumped on reset so in-flight fetches cannot write a cleared store. */
  fetchGeneration: number;

  view: FeedCanvasView;
  listTab: FeedListTab;
  selectedJobId: string | null;
  editPill: FeedEditPill;
  filters: FeedListFilters;

  /**
   * Turns the user added on top of the derived opening message. Keyed by the
   * feed it belongs to, so a new run starts a clean conversation without an
   * effect having to clear it.
   */
  thread: { key: string; items: FeedMessage[] };
  /** Chips already picked on this feed, so a spent chip is not offered again. */
  usedChips: { key: string; ids: string[] };
  /** Setup question the conversation is on. 0 country, 1 city, 2 work mode, 3 salary, 4 plan, 5 consent, 6 all-done. */
  setupStep: FeedSetupStep;
  setupDraft: Partial<JobFeedSettingsInput>;
  setupPlan: ConfirmedSearchQuery[];
}

interface FeedActions {
  setStatus: (status: FeedState['status'], errorMessage?: string | null) => void;
  setOverview: (overview: JobFeedOverviewResponse | null) => void;
  patchJobFeedback: (jobId: string, feedback: JobFeedItemFeedbackState) => void;
  removeJob: (jobId: string) => void;
  setExtraJobs: (jobs: JobFeedFeedItem[]) => void;
  appendExtraJobs: (jobs: JobFeedFeedItem[]) => void;
  setLoadingMore: (value: boolean) => void;
  setSavedJobs: (jobs: JobFeedFeedItem[] | null) => void;
  setLoadingSaved: (value: boolean) => void;
  setSavedError: (message: string | null) => void;
  setStrategy: (strategy: SearchStrategy | null) => void;
  setCareerProfile: (profile: CareerProfile | null) => void;
  setBuild: (build: FeedBuildState | null) => void;
  patchBuild: (patch: Partial<FeedBuildState>) => void;
  setIsRunning: (value: boolean) => void;
  setIsSavingSettings: (value: boolean) => void;
  setPollGaveUp: (value: boolean) => void;

  setView: (view: FeedCanvasView) => void;
  setListTab: (tab: FeedListTab) => void;
  openJobDetail: (jobId: string) => void;
  backToList: () => void;
  setEditPill: (pill: FeedEditPill) => void;
  setFilters: (filters: FeedListFilters) => void;

  addMessage: (key: string, message: Omit<FeedMessage, 'id'>) => void;
  markChipUsed: (key: string, chipId: string) => void;
  setSetupStep: (step: FeedState['setupStep']) => void;
  patchSetupDraft: (patch: Partial<JobFeedSettingsInput>) => void;
  setSetupPlan: (plan: ConfirmedSearchQuery[]) => void;
  resetFeed: () => void;
}

const initialState: FeedState = {
  status: 'idle',
  errorMessage: null,
  overview: null,
  extraJobs: [],
  loadingMore: false,
  savedJobs: null,
  loadingSaved: false,
  savedError: null,
  strategy: null,
  careerProfile: null,
  build: null,
  isRunning: false,
  isSavingSettings: false,
  pollGaveUp: false,
  fetchGeneration: 0,
  view: 'list',
  listTab: 'today',
  selectedJobId: null,
  editPill: 'profile',
  filters: EMPTY_FEED_FILTERS,
  thread: { key: '', items: [] },
  usedChips: { key: '', ids: [] },
  setupStep: 0,
  setupDraft: {},
  setupPlan: [],
};

let messageSeq = 0;
function nextMessageId(): string {
  messageSeq += 1;
  return `feed-msg-${messageSeq}`;
}

const withFeedback = (job: JobFeedFeedItem, jobId: string, feedback: JobFeedItemFeedbackState) =>
  job.id === jobId ? { ...job, feedback } : job;

export const useFeedStore = create<FeedState & FeedActions>()((set) => ({
  ...initialState,

  setStatus: (status, errorMessage = null) => set({ status, errorMessage }),
  setOverview: (overview) => set((state) => {
    const prevRun = state.overview?.feedRun?.id ?? state.overview?.latestRun?.id ?? null;
    const nextRun = overview?.feedRun?.id ?? overview?.latestRun?.id ?? null;
    return {
      overview,
      extraJobs: prevRun !== nextRun ? [] : state.extraJobs,
      pollGaveUp: overview?.state === 'generating' ? state.pollGaveUp : false,
    };
  }),

  patchJobFeedback: (jobId, feedback) => set((state) => ({
    overview: state.overview
      ? { ...state.overview, jobs: state.overview.jobs.map((job) => withFeedback(job, jobId, feedback)) }
      : state.overview,
    extraJobs: state.extraJobs.map((job) => withFeedback(job, jobId, feedback)),
    savedJobs: state.savedJobs
      ? state.savedJobs.map((job) => withFeedback(job, jobId, feedback))
      : state.savedJobs,
  })),

  removeJob: (jobId) => set((state) => ({
    overview: state.overview
      ? { ...state.overview, jobs: state.overview.jobs.filter((job) => job.id !== jobId) }
      : state.overview,
    extraJobs: state.extraJobs.filter((job) => job.id !== jobId),
    savedJobs: state.savedJobs ? state.savedJobs.filter((job) => job.id !== jobId) : state.savedJobs,
    // The detail view is about one job. If it just left the feed, go back.
    view: state.selectedJobId === jobId && state.view === 'detail' ? 'list' : state.view,
    selectedJobId: state.selectedJobId === jobId ? null : state.selectedJobId,
  })),

  setExtraJobs: (jobs) => set({ extraJobs: jobs }),
  appendExtraJobs: (jobs) => set((state) => ({ extraJobs: [...state.extraJobs, ...jobs] })),
  setLoadingMore: (value) => set({ loadingMore: value }),
  setSavedJobs: (jobs) => set({ savedJobs: jobs }),
  setLoadingSaved: (value) => set({ loadingSaved: value }),
  setSavedError: (message) => set({ savedError: message }),
  setStrategy: (strategy) => set({ strategy }),
  setCareerProfile: (profile) => set({ careerProfile: profile }),
  setBuild: (build) => set({ build }),
  patchBuild: (patch) => set((state) => ({ build: state.build ? { ...state.build, ...patch } : state.build })),
  setIsRunning: (value) => set({ isRunning: value }),
  setIsSavingSettings: (value) => set({ isSavingSettings: value }),
  setPollGaveUp: (value) => set({ pollGaveUp: value }),

  setView: (view) => set({ view }),
  setListTab: (tab) => set({ listTab: tab }),
  openJobDetail: (jobId) => set({ view: 'detail', selectedJobId: jobId }),
  backToList: () => set({ view: 'list', selectedJobId: null }),
  setEditPill: (pill) => set({ editPill: pill }),
  setFilters: (filters) => set({ filters }),

  addMessage: (key, message) => set((state) => {
    const items = state.thread.key === key ? state.thread.items : [];
    return { thread: { key, items: [...items, { ...message, id: nextMessageId() }] } };
  }),

  // A picked chip is spent. The opening message is derived, so the record of
  // what was picked has to live here rather than on the message.
  markChipUsed: (key, chipId) => set((state) => {
    const ids = state.usedChips.key === key ? state.usedChips.ids : [];
    if (ids.includes(chipId)) return state;
    return { usedChips: { key, ids: [...ids, chipId] } };
  }),

  setSetupStep: (step) => set({ setupStep: step }),
  patchSetupDraft: (patch) => set((state) => ({ setupDraft: { ...state.setupDraft, ...patch } })),
  setSetupPlan: (plan) => set({ setupPlan: plan }),
  resetFeed: () => set((state) => ({ ...initialState, fetchGeneration: state.fetchGeneration + 1 })),
}));

/**
 * The build state to render. A run started in this tab drives `build`
 * directly. A run the server reports as in flight (started elsewhere, or on
 * this tab before a reload) still deserves the searching view: by the time a
 * run is running the profile and the strategy are already resolved.
 */
export function resolveFeedBuild(
  build: FeedBuildState | null,
  overviewState: JobFeedOverviewResponse['state'] | undefined,
  pollGaveUp = false,
): FeedBuildState | null {
  if (pollGaveUp) return null;
  if (build) return build;
  if (overviewState !== 'generating') return null;
  // A run started elsewhere has no local completions to read. Leave every
  // stage open rather than ticking profile/strategy off by assumption.
  return { profileDone: false, strategyDone: false, searchDone: false, plannedQueries: null };
}

/**
 * Identity of the feed the conversation belongs to. A new run means a new
 * morning, so the thread starts clean. Derived from the store alone so the
 * conversation and the canvas agree without passing it around.
 */
export function selectFeedThreadKey(state: Pick<FeedState, 'overview'>): string {
  const overview = state.overview;
  if (!overview) return 'no-feed';
  // Key on the run, not the display state. ready ↔ thin_feed flips as the
  // visible count crosses 10 and would otherwise wipe the conversation.
  return overview.feedRun?.id ?? overview.latestRun?.id ?? 'no-run';
}

/**
 * Today's list after the chat's filters, deduplicated by canonical job id.
 *
 * For one-off reads via `useFeedStore.getState()` only. It builds a new array
 * every call, so passing it to `useFeedStore(...)` as a selector would loop
 * forever. Components use `useVisibleFeedJobs()` instead.
 */
export function selectVisibleJobs(state: Pick<FeedState, 'listTab' | 'savedJobs' | 'overview' | 'extraJobs' | 'filters'>): JobFeedFeedItem[] {
  const source = state.listTab === 'saved'
    ? (state.savedJobs ?? [])
    : [...(state.overview?.jobs ?? []), ...state.extraJobs];

  const seen = new Set<string>();
  const deduped: JobFeedFeedItem[] = [];
  for (const job of source) {
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    deduped.push(job);
  }

  // Saved is a bookmark list. Chat filters only narrow today's feed.
  if (state.listTab === 'saved') return deduped;
  return deduped.filter((job) => matchesFilters(job, state.filters));
}

export function matchesFilters(job: JobFeedFeedItem, filters: FeedListFilters): boolean {
  if (filters.remoteOnly && job.workMode !== 'remote') return false;
  if (filters.minSalary !== null) {
    const top = readSalaryCeiling(job.salaryText);
    // A job with no stated salary stays in the list: hiding it would be a
    // guess, and the user asked to raise a floor, not to hide unknowns.
    if (top !== null && top < filters.minSalary) return false;
  }
  if (filters.excludedTerms.length > 0) {
    const haystack = `${job.title} ${job.company}`.toLowerCase();
    if (filters.excludedTerms.some((term) => haystack.includes(term.toLowerCase()))) return false;
  }
  return true;
}

/**
 * Highest number in a free-text salary string, normalised to a yearly figure.
 * "$140,000 - $165,000" → 165000, "$87.5K to $180K" → 180000. Returns null
 * when nothing parseable is there, so the caller can keep the job.
 */
export function readSalaryCeiling(salaryText: string | null): number | null {
  if (!salaryText) return null;
  const matches = salaryText.matchAll(/(\d[\d,.]*)\s*(k\b|000)?/gi);
  let top: number | null = null;
  for (const match of matches) {
    const raw = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(raw)) continue;
    const suffix = match[2]?.toLowerCase();
    const value = suffix === 'k' ? raw * 1000 : raw;
    // Anything under 1000 with no K is an hourly rate or a stray number.
    if (value < 1000) continue;
    if (top === null || value > top) top = value;
  }
  return top;
}
