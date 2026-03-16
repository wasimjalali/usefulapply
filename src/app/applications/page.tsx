'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useSessionStore } from '@/store/useSessionStore';
import { updateSession, getSession, deleteSession } from '@/lib/supabase/sessions';
import { getSupabase } from '@/lib/supabase/client';
import {
  ArrowLeft,
  Search,
  ChevronDown,
  Briefcase,
  CalendarDays,
  Target,
  Loader2,
  Plus,
  Filter,
  ClipboardList,
  Trash2,
  Pencil,
  Check,
  X,
} from 'lucide-react';

type ApplicationStatus = 'applied' | 'interview' | 'rejected' | 'accepted' | 'follow_up';

interface TrackerSession {
  id: string;
  company: string | null;
  job_title: string | null;
  match_score: number | null;
  status: ApplicationStatus;
  created_at: string;
}

const PAGE_SIZE = 25;

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; bg: string; text: string; dot: string }> = {
  applied: { label: 'Applied', bg: 'bg-gold-100', text: 'text-gold-700', dot: 'bg-gold-400' },
  interview: { label: 'Interview', bg: 'bg-cream-200', text: 'text-charcoal', dot: 'bg-warm-gray' },
  rejected: { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400' },
  accepted: { label: 'Accepted', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  follow_up: { label: 'Follow-Up Sent', bg: 'bg-navy-100', text: 'text-navy-700', dot: 'bg-navy-500' },
};

const ALL_STATUSES: ApplicationStatus[] = ['applied', 'interview', 'follow_up', 'rejected', 'accepted'];

function StatusDropdown({
  status,
  onStatusChange,
}: {
  status: ApplicationStatus;
  onStatusChange: (newStatus: ApplicationStatus) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.applied;

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuStyle({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    setIsOpen((prev) => !prev);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={openMenu}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all hover:ring-2 hover:ring-gold-200 ${config.bg} ${config.text}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
        {config.label}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && menuStyle && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} />
          <div
            className="fixed z-50 w-44 bg-white rounded-xl shadow-xl border border-cream-200 py-1"
            style={{ top: menuStyle.top, right: menuStyle.right }}
          >
            {ALL_STATUSES.map((s) => {
              const sc = STATUS_CONFIG[s];
              return (
                <button
                  key={s}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(s);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${
                    s === status ? 'bg-cream-100' : 'hover:bg-cream-50'
                  } ${sc.text}`}
                >
                  <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
                  {sc.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function StatPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
        active
          ? 'bg-navy-600 text-white shadow-sm'
          : 'bg-white text-warm-gray hover:bg-cream-100 border border-cream-200'
      }`}
    >
      {label}
      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
        active ? 'bg-white/20 text-white' : 'bg-cream-100 text-charcoal'
      }`}>
        {count}
      </span>
    </button>
  );
}

function InlineEditableCompany({
  value,
  onSave,
  className = '',
}: {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setDraft(value);
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    await onSave(trimmed);
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className="px-1.5 py-0.5 text-sm font-semibold text-navy-700 border border-gold-400 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-gold-400 w-[160px]"
        />
        {isSaving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-gold-500" />
        ) : (
          <>
            <button onClick={handleSave} className="p-0.5 rounded text-emerald-600 hover:bg-emerald-50 cursor-pointer" title="Save">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleCancel} className="p-0.5 rounded text-warm-gray hover:bg-cream-100 cursor-pointer" title="Cancel">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    );
  }

  const isUnknown = !value || value === 'Unknown Company';

  return (
    <span
      className={`group/edit inline-flex items-center gap-1 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        className={`truncate max-w-[160px] ${isUnknown ? 'text-warm-gray italic' : ''}`}
        title={value || 'Unknown Company'}
      >
        {value || 'Unknown Company'}
      </span>
      <button
        onClick={() => { setDraft(value || ''); setIsEditing(true); }}
        className="opacity-0 group-hover/edit:opacity-100 p-0.5 rounded text-warm-gray hover:text-navy-600 hover:bg-navy-50 transition-all cursor-pointer"
        title="Rename company"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </span>
  );
}

export default function ApplicationsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { loadSession } = useSessionStore();

  const [applications, setApplications] = useState<TrackerSession[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  // Accurate per-status counts from full DB (not just loaded page)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');
  const [updatingSessionId, setUpdatingSessionId] = useState<string | null>(null);
  const [navigatingSessionId, setNavigatingSessionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Fetch lightweight application data directly from Supabase (only columns needed for tracker)
  const fetchApplications = useCallback(async (offset: number, limit: number) => {
    if (!user) return { data: [], count: 0 };

    const supabase = getSupabase() as any;
    const { data, error, count } = await supabase
      .from('application_sessions')
      .select('id, company, job_title, match_score, status, created_at', { count: 'exact' })
      .eq('user_id', user.id)
      .not('generated_cv', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Applications] Error fetching:', error);
      return { data: [], count: 0 };
    }

    return { data: (data || []) as TrackerSession[], count: count || 0 };
  }, [user]);

  const handleDelete = async (sessionId: string) => {
    setDeletingSessionId(sessionId);
    try {
      const { error } = await deleteSession(sessionId, user?.id);
      if (!error) {
        const deleted = applications.find((a) => a.id === sessionId);
        setApplications((prev) => prev.filter((a) => a.id !== sessionId));
        setTotalCount((prev) => Math.max(0, prev - 1));
        // Keep statusCounts accurate
        if (deleted) {
          const s = deleted.status || 'applied';
          setStatusCounts((prev) => ({ ...prev, [s]: Math.max(0, (prev[s] || 0) - 1) }));
        }
      } else {
        console.error('[Applications] Delete error:', error);
      }
    } catch (err) {
      console.error('[Applications] Delete error:', err);
    } finally {
      setDeletingSessionId(null);
      setConfirmDeleteId(null);
    }
  };

  // Initial load — fetch first page + accurate status counts from full DB in parallel
  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setIsLoadingInitial(true);
      const supabase = getSupabase() as any;

      const [pageResult, statusResult] = await Promise.all([
        fetchApplications(0, PAGE_SIZE),
        // Lightweight query: only status column, no heavy content — for accurate pill counts
        // Must match fetchApplications filter (generated_cv IS NOT NULL) for consistent counts
        supabase
          .from('application_sessions')
          .select('status')
          .eq('user_id', user.id)
          .not('generated_cv', 'is', null) as Promise<{ data: { status: string | null }[] | null; error: unknown }>,
      ]);

      setApplications(pageResult.data);
      setTotalCount(pageResult.count);

      if (statusResult.data) {
        const counts: Record<string, number> = {};
        for (const row of statusResult.data) {
          const s = row.status || 'applied';
          counts[s] = (counts[s] || 0) + 1;
        }
        setStatusCounts(counts);
      }

      setIsLoadingInitial(false);
    };

    load();
  }, [user, fetchApplications]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [authLoading, user, router]);

  const hasMore = applications.length < totalCount;

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    const { data } = await fetchApplications(applications.length, PAGE_SIZE);
    setApplications((prev) => [...prev, ...data]);
    setIsLoadingMore(false);
  };

  // Apply search and status filters (client-side on loaded data)
  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const matchesSearch =
        !searchQuery ||
        (app.company || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (app.job_title || '').toLowerCase().includes(searchQuery.toLowerCase());

      const appStatus = app.status || 'applied';
      const matchesStatus = statusFilter === 'all' || appStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [applications, searchQuery, statusFilter]);

  // Stats use DB-accurate counts from statusCounts (full dataset, not just loaded page)
  const stats = useMemo((): Record<string, number> => {
    return { all: totalCount, ...statusCounts };
  }, [totalCount, statusCounts]);

  // Clear selection when filters change (prevent acting on hidden items)
  useEffect(() => {
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
  }, [searchQuery, statusFilter]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredApplications.length) return new Set();
      return new Set(filteredApplications.map((a) => a.id));
    });
  }, [filteredApplications]);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    const idsToDelete = Array.from(selectedIds);
    for (const id of idsToDelete) {
      try {
        const { error } = await deleteSession(id, user?.id);
        if (!error) {
          const deleted = applications.find((a) => a.id === id);
          setApplications((prev) => prev.filter((a) => a.id !== id));
          setTotalCount((prev) => Math.max(0, prev - 1));
          if (deleted) {
            const s = deleted.status || 'applied';
            setStatusCounts((prev) => ({ ...prev, [s]: Math.max(0, (prev[s] || 0) - 1) }));
          }
        }
      } catch (err) {
        console.error('[Applications] Bulk delete error:', err);
      }
    }
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
    setIsBulkDeleting(false);
  };

  const handleRenameCompany = async (sessionId: string, newCompany: string) => {
    try {
      const { error } = await updateSession(sessionId, { company: newCompany }, user?.id);
      if (error) {
        console.error('[Applications] Error renaming company:', error);
        return;
      }
      // Update local state
      setApplications((prev) =>
        prev.map((app) => (app.id === sessionId ? { ...app, company: newCompany } : app))
      );
      // Update Zustand store if session exists there
      const store = useSessionStore.getState();
      const updatedSessions = store.sessions.map((s) =>
        s.id === sessionId ? { ...s, company: newCompany } as any : s
      );
      store.setSessions(updatedSessions);
      if (store.currentSession?.id === sessionId) {
        store.updateCurrentSession({ company: newCompany } as any);
      }
    } catch (err) {
      console.error('[Applications] Rename company error:', err);
    }
  };

  const handleStatusChange = async (sessionId: string, newStatus: ApplicationStatus) => {
    setUpdatingSessionId(sessionId);
    try {
      const { error } = await updateSession(sessionId, { status: newStatus }, user?.id);
      if (error) {
        console.error('[Applications] Error updating status:', error);
      } else {
        // Update local tracker list and keep statusCounts accurate
        const oldStatus = applications.find((a) => a.id === sessionId)?.status || 'applied';
        setApplications((prev) =>
          prev.map((app) => (app.id === sessionId ? { ...app, status: newStatus } : app))
        );
        if (oldStatus !== newStatus) {
          setStatusCounts((prev) => ({
            ...prev,
            [oldStatus]: Math.max(0, (prev[oldStatus] || 0) - 1),
            [newStatus]: (prev[newStatus] || 0) + 1,
          }));
        }
        // Also update Zustand store if session exists there
        const store = useSessionStore.getState();
        const updatedSessions = store.sessions.map((s) =>
          s.id === sessionId ? { ...s, status: newStatus } as any : s
        );
        store.setSessions(updatedSessions);
        if (store.currentSession?.id === sessionId) {
          store.updateCurrentSession({ status: newStatus } as any);
        }
      }
    } catch (err) {
      console.error('[Applications] Status update error:', err);
    } finally {
      setUpdatingSessionId(null);
    }
  };

  const handleRowClick = async (sessionId: string) => {
    setNavigatingSessionId(sessionId);
    try {
      // Fetch the full session (all columns including generated CV, cover letter, email, follow-up)
      const fullSession = await getSession(sessionId, user?.id);
      if (fullSession) {
        // Map Supabase snake_case to Zustand camelCase and inject into the store
        const store = useSessionStore.getState();
        const mapped = {
          id: fullSession.id,
          jobTitle: fullSession.job_title || '',
          company: fullSession.company || '',
          jobDescription: fullSession.job_description || '',
          createdAt: fullSession.created_at,
          updatedAt: fullSession.updated_at,
          matchScore: fullSession.match_score ?? undefined,
          matchingSkills: fullSession.matching_skills || [],
          missingSkills: fullSession.missing_skills || [],
          suggestions: fullSession.suggestions || [],
          requirements: fullSession.requirements ?? null,
          gaps: fullSession.gaps ?? null,
          generatedCV: fullSession.generated_cv ?? null,
          optimizedCVData: fullSession.generated_cv?._optimizedCVData ?? undefined,
          coverLetter: fullSession.cover_letter ?? null,
          email: fullSession.email ?? null,
          followUpEmail: fullSession.follow_up_email ?? null,
          companyResearch: fullSession.company_research ?? null,
          cvEdits: fullSession.cv_edits || [],
          status: fullSession.status ?? 'applied',
          chatMessages: [],
        } as any;

        // Upsert the full session into the sessions array
        const existingSessions = store.sessions;
        const updated = existingSessions.some((s) => s.id === sessionId)
          ? existingSessions.map((s) => (s.id === sessionId ? { ...s, ...mapped } : s))
          : [...existingSessions, mapped];
        store.setSessions(updated);

        // Set as current session
        loadSession(sessionId);
      }
    } catch (err) {
      console.error('[Applications] Error loading full session:', err);
      // Fall back to loading whatever's in the store
      loadSession(sessionId);
    } finally {
      setNavigatingSessionId(null);
    }
    router.push('/dashboard');
  };

  if (authLoading || isLoadingInitial) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
          <p className="text-sm text-warm-gray">Loading your applications...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-cream-100">
      {/* Header */}
      <div className="bg-white border-b border-cream-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 text-sm text-warm-gray hover:text-navy-600 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
              <div className="h-5 w-px bg-cream-300" />
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-gradient-to-br from-navy-600 to-navy-700 rounded-xl shadow-sm">
                  <ClipboardList className="w-4 h-4 text-gold-400" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-navy-700">Application Tracker</h1>
                  <p className="text-xs text-warm-gray hidden sm:block">Track and manage your job applications</p>
                </div>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-gold-400 to-gold-500 rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Application</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <StatPill
            label="All"
            count={totalCount}
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
          />
          {ALL_STATUSES.map((s) => (
            <StatPill
              key={s}
              label={STATUS_CONFIG[s].label}
              count={stats[s] || 0}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
            />
          ))}
        </div>

        {/* Search + Filter Bar */}
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
            <input
              type="text"
              placeholder="Search by company or job title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-cream-300 rounded-xl text-sm text-charcoal placeholder:text-warm-gray/60 focus:outline-none focus:border-gold-400 focus:ring-0 transition-all"
              style={{ boxShadow: 'none' }}
            />
          </div>
          <div className="relative sm:w-48">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | 'all')}
              aria-label="Filter by status"
              className="w-full pl-10 pr-8 py-2.5 bg-white border border-cream-300 rounded-xl text-sm text-charcoal appearance-none cursor-pointer focus:outline-none focus:border-gold-400 focus:ring-0 transition-all"
              style={{ boxShadow: 'none' }}
            >
              <option value="all">All Statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray pointer-events-none" />
          </div>
        </div>

        {/* Applications List */}
        {applications.length === 0 ? (
          <div className="mt-12 text-center">
            <div className="inline-flex p-4 bg-cream-200/60 rounded-2xl mb-4">
              <Briefcase className="w-8 h-8 text-warm-gray" />
            </div>
            <h3 className="text-lg font-semibold text-navy-700 mb-1">No applications yet</h3>
            <p className="text-sm text-warm-gray mb-6 max-w-sm mx-auto">
              Start your first job application in the dashboard and track it here.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-gold-400 to-gold-500 rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Start First Application
            </Link>
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="mt-12 text-center">
            <div className="inline-flex p-4 bg-cream-200/60 rounded-2xl mb-4">
              <Search className="w-8 h-8 text-warm-gray" />
            </div>
            <h3 className="text-lg font-semibold text-navy-700 mb-1">No matching applications</h3>
            <p className="text-sm text-warm-gray mb-4 max-w-sm mx-auto">
              Try adjusting your search or filter criteria.
            </p>
            <button
              onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
              className="text-sm font-medium text-gold-600 hover:text-gold-700 transition-colors cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
              <div className="mt-4 flex items-center justify-between px-4 py-2.5 bg-navy-50 border border-navy-200 rounded-xl">
                <span className="text-sm font-medium text-navy-700">
                  {selectedIds.size} application{selectedIds.size !== 1 ? 's' : ''} selected
                </span>
                {confirmBulkDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600 font-medium">Delete {selectedIds.size} application{selectedIds.size !== 1 ? 's' : ''}?</span>
                    <button
                      onClick={handleBulkDelete}
                      disabled={isBulkDeleting}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {isBulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      {isBulkDeleting ? 'Deleting...' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setConfirmBulkDelete(false)}
                      disabled={isBulkDeleting}
                      className="px-3 py-1.5 text-xs font-semibold text-warm-gray bg-white border border-cream-300 rounded-lg hover:bg-cream-50 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setConfirmBulkDelete(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete Selected
                    </button>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="px-3 py-1.5 text-xs font-semibold text-warm-gray bg-white border border-cream-300 rounded-lg hover:bg-cream-50 transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Desktop Table */}
            <div className="hidden md:block mt-4">
              <div className="bg-white rounded-2xl border border-cream-200 shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-cream-200 bg-cream-50/60">
                      <th className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={filteredApplications.length > 0 && selectedIds.size === filteredApplications.length}
                          onChange={toggleSelectAll}
                          className="w-3.5 h-3.5 rounded border-cream-300 text-navy-600 focus:ring-navy-500 cursor-pointer"
                          title="Select all"
                        />
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wider">Company</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wider">Job Title</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wider">Date</th>
                      <th className="text-center px-5 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wider">Match</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wider">Status</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-100">
                    {filteredApplications.map((app) => {
                      const appStatus = app.status || 'applied';
                      return (
                        <tr
                          key={app.id}
                          className={`transition-colors group ${navigatingSessionId === app.id ? 'bg-cream-50/80 opacity-70' : 'hover:bg-cream-50/60'}`}
                        >
                          <td className="w-10 px-3 py-3.5">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(app.id)}
                              onChange={() => toggleSelection(app.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-3.5 h-3.5 rounded border-cream-300 text-navy-600 focus:ring-navy-500 cursor-pointer"
                            />
                          </td>
                          <td
                            className="px-5 py-3.5 cursor-pointer"
                            onClick={() => navigatingSessionId ? undefined : handleRowClick(app.id)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-navy-100 to-navy-200 flex items-center justify-center">
                                <Briefcase className="w-3.5 h-3.5 text-navy-600" />
                              </div>
                              <InlineEditableCompany
                                value={app.company || ''}
                                onSave={(newName) => handleRenameCompany(app.id, newName)}
                                className="text-sm font-semibold text-navy-700 group-hover:text-navy-800"
                              />
                            </div>
                          </td>
                          <td
                            className="px-5 py-3.5 cursor-pointer"
                            onClick={() => navigatingSessionId ? undefined : handleRowClick(app.id)}
                          >
                            <span className="text-sm text-charcoal truncate block max-w-[220px]">
                              {app.job_title || 'Untitled Position'}
                            </span>
                          </td>
                          <td
                            className="px-5 py-3.5 cursor-pointer"
                            onClick={() => navigatingSessionId ? undefined : handleRowClick(app.id)}
                          >
                            <div className="flex items-center gap-1.5 text-xs text-warm-gray">
                              <CalendarDays className="w-3.5 h-3.5" />
                              {new Date(app.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </div>
                          </td>
                          <td
                            className="px-5 py-3.5 text-center cursor-pointer"
                            onClick={() => navigatingSessionId ? undefined : handleRowClick(app.id)}
                          >
                            {app.match_score ? (
                              <div className="inline-flex items-center gap-1">
                                <Target className="w-3.5 h-3.5 text-gold-500" />
                                <span className={`text-xs font-bold ${
                                  app.match_score >= 85 ? 'text-gold-600' :
                                  app.match_score >= 70 ? 'text-gold-600' :
                                  app.match_score >= 55 ? 'text-warm-gray' :
                                  'text-red-500'
                                }`}>
                                  {app.match_score}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-cream-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {navigatingSessionId === app.id ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-navy-500" />
                                <span className="text-xs text-warm-gray">Opening...</span>
                              </div>
                            ) : updatingSessionId === app.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-gold-500 ml-auto" />
                            ) : (
                              <StatusDropdown
                                status={appStatus}
                                onStatusChange={(newStatus) => handleStatusChange(app.id, newStatus)}
                              />
                            )}
                          </td>
                          <td className="px-3 py-3.5 text-right">
                            {deletingSessionId === app.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                            ) : confirmDeleteId === app.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(app.id); }}
                                  className="px-2 py-0.5 text-[10px] font-semibold text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors cursor-pointer"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                                  className="px-2 py-0.5 text-[10px] font-semibold text-warm-gray bg-cream-100 rounded-md hover:bg-cream-200 transition-colors cursor-pointer"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(app.id); }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-warm-gray hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                                title="Delete application"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden mt-4 space-y-3">
              {filteredApplications.map((app) => {
                const appStatus = app.status || 'applied';
                return (
                  <div
                    key={app.id}
                    className={`bg-white rounded-xl border border-cream-200 shadow-sm p-4 transition-all ${navigatingSessionId === app.id ? 'opacity-70' : 'hover:border-cream-300'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(app.id)}
                        onChange={() => toggleSelection(app.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 mt-1 rounded border-cream-300 text-navy-600 focus:ring-navy-500 cursor-pointer flex-shrink-0"
                      />
                      <div
                        className={`flex-1 min-w-0 ${navigatingSessionId ? '' : 'cursor-pointer'}`}
                        onClick={() => navigatingSessionId ? undefined : handleRowClick(app.id)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-navy-100 to-navy-200 flex items-center justify-center">
                            <Briefcase className="w-3 h-3 text-navy-600" />
                          </div>
                          <InlineEditableCompany
                            value={app.company || ''}
                            onSave={(newName) => handleRenameCompany(app.id, newName)}
                            className="text-sm font-semibold text-navy-700"
                          />
                        </div>
                        <p className="text-xs text-charcoal ml-9 truncate">
                          {app.job_title || 'Untitled Position'}
                        </p>
                      </div>
                      {updatingSessionId === app.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gold-500 flex-shrink-0" />
                      ) : (
                        <StatusDropdown
                          status={appStatus}
                          onStatusChange={(newStatus) => handleStatusChange(app.id, newStatus)}
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-3 ml-9">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1 text-xs text-warm-gray">
                          <CalendarDays className="w-3 h-3" />
                          {new Date(app.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                        {app.match_score && (
                          <div className="flex items-center gap-1">
                            <Target className="w-3 h-3 text-gold-500" />
                            <span className={`text-xs font-bold ${
                              app.match_score >= 85 ? 'text-gold-600' :
                              app.match_score >= 70 ? 'text-gold-600' :
                              app.match_score >= 55 ? 'text-warm-gray' :
                              'text-red-500'
                            }`}>
                              {app.match_score}%
                            </span>
                          </div>
                        )}
                      </div>
                      {deletingSessionId === app.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                      ) : confirmDeleteId === app.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(app.id); }}
                            className="px-2 py-0.5 text-[10px] font-semibold text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                            className="px-2 py-0.5 text-[10px] font-semibold text-warm-gray bg-cream-100 rounded-md hover:bg-cream-200 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(app.id); }}
                          className="p-1.5 rounded-lg text-warm-gray hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                          title="Delete application"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load More + Count */}
            <div className="mt-6 flex flex-col items-center gap-3">
              {hasMore && (
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-navy-700 bg-white border border-cream-300 rounded-xl hover:bg-cream-50 hover:border-gold-300 transition-all shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      Load More Applications
                      <span className="text-xs text-warm-gray">
                        ({applications.length} of {totalCount})
                      </span>
                    </>
                  )}
                </button>
              )}
              <p className="text-xs text-warm-gray">
                Showing {filteredApplications.length} of {totalCount} application{totalCount !== 1 ? 's' : ''}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
