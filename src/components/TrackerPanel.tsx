'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSessionStore } from '@/store/useSessionStore';
import { useUIStore } from '@/store/useUIStore';
import { updateSession, getSession, deleteSession, getChatMessages } from '@/lib/supabase/sessions';
import { getSupabase } from '@/lib/supabase/client';
import {
  Search,
  ChevronDown,
  Briefcase,
  CalendarDays,
  Target,
  Loader2,
  Plus,
  Filter,
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
        top: rect.bottom + 8,
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
        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all hover:opacity-80 ${config.bg} ${config.text}`}
      >
        <span className={`w-2 h-2 rounded-full ${config.dot}`} />
        {config.label}
        <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
      </button>

      {isOpen && menuStyle && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} />
          <div
            className="fixed z-50 w-48 bg-white rounded-xl shadow-xl border border-cream-200 py-1.5"
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
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
                    s === status ? 'bg-cream-100' : 'hover:bg-cream-50'
                  } ${sc.text}`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${sc.dot}`} />
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

function PipelineStage({
  label,
  count,
  active,
  onClick,
  isFirst,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  isFirst?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex-1 min-w-[100px] flex flex-col items-center justify-center py-3.5 px-3 cursor-pointer transition-all ${
        active
          ? 'bg-navy-600 text-white'
          : 'bg-white text-charcoal hover:bg-cream-50'
      } ${isFirst ? 'rounded-l-xl' : ''}`}
    >
      <span className={`text-xl font-bold leading-none ${active ? 'text-white' : 'text-navy-700'}`}>
        {count || '--'}
      </span>
      <span className={`text-xs font-semibold mt-1 uppercase tracking-wide ${active ? 'text-white/80' : 'text-warm-gray'}`}>
        {label}
      </span>
      <div className="absolute right-0 top-0 bottom-0 w-px bg-cream-200" />
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

export function TrackerPanel() {
  const { user } = useAuth();
  const { loadSession } = useSessionStore();
  const setActiveTab = useUIStore((s) => s.setActiveTab);

  const [applications, setApplications] = useState<TrackerSession[]>([]);
  const [totalCount, setTotalCount] = useState(0);
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
      console.error('[Tracker] Error fetching:', error);
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
        if (deleted) {
          const s = deleted.status || 'applied';
          setStatusCounts((prev) => ({ ...prev, [s]: Math.max(0, (prev[s] || 0) - 1) }));
        }
      } else {
        console.error('[Tracker] Delete error:', error);
      }
    } catch (err) {
      console.error('[Tracker] Delete error:', err);
    } finally {
      setDeletingSessionId(null);
      setConfirmDeleteId(null);
    }
  };

  // Initial load
  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setIsLoadingInitial(true);
      const supabase = getSupabase() as any;

      const [pageResult, statusResult] = await Promise.all([
        fetchApplications(0, PAGE_SIZE),
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

  const hasMore = applications.length < totalCount;

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    const { data } = await fetchApplications(applications.length, PAGE_SIZE);
    setApplications((prev) => [...prev, ...data]);
    setIsLoadingMore(false);
  };

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

  const stats = useMemo((): Record<string, number> => {
    return { all: totalCount, ...statusCounts };
  }, [totalCount, statusCounts]);

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
        console.error('[Tracker] Bulk delete error:', err);
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
        console.error('[Tracker] Error renaming company:', error);
        return;
      }
      setApplications((prev) =>
        prev.map((app) => (app.id === sessionId ? { ...app, company: newCompany } : app))
      );
      const store = useSessionStore.getState();
      const updatedSessions = store.sessions.map((s) =>
        s.id === sessionId ? { ...s, company: newCompany } as any : s
      );
      store.setSessions(updatedSessions);
      if (store.currentSession?.id === sessionId) {
        store.updateCurrentSession({ company: newCompany } as any);
      }
    } catch (err) {
      console.error('[Tracker] Rename company error:', err);
    }
  };

  const handleStatusChange = async (sessionId: string, newStatus: ApplicationStatus) => {
    setUpdatingSessionId(sessionId);
    try {
      const { error } = await updateSession(sessionId, { status: newStatus }, user?.id);
      if (error) {
        console.error('[Tracker] Error updating status:', error);
      } else {
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
      console.error('[Tracker] Status update error:', err);
    } finally {
      setUpdatingSessionId(null);
    }
  };

  const handleRowClick = async (sessionId: string) => {
    setNavigatingSessionId(sessionId);
    try {
      const [fullSession, chatMessages] = await Promise.all([
        getSession(sessionId, user?.id),
        getChatMessages(sessionId),
      ]);
      if (fullSession) {
        const store = useSessionStore.getState();
        const mappedMessages = (chatMessages || []).map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.created_at,
          actions: msg.actions || [],
        }));
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
          fitAssessment: fullSession.fit_assessment ?? null,
          chatMessages: mappedMessages,
        } as any;

        const existingSessions = store.sessions;
        const updated = existingSessions.some((s) => s.id === sessionId)
          ? existingSessions.map((s) => (s.id === sessionId ? { ...s, ...mapped } : s))
          : [...existingSessions, mapped];
        store.setSessions(updated);

        loadSession(sessionId);
      }
    } catch (err) {
      console.error('[Tracker] Error loading full session:', err);
      loadSession(sessionId);
    } finally {
      setNavigatingSessionId(null);
    }
    // Switch to CV tab to show the loaded session
    setActiveTab('cv');
  };

  if (isLoadingInitial) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
          <p className="text-sm text-warm-gray">Loading your applications...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-sm text-warm-gray">Sign in to track your applications.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Pipeline Status Bar */}
        <div className="flex rounded-xl border border-cream-200 overflow-hidden shadow-sm">
          <PipelineStage
            label="All"
            count={totalCount}
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            isFirst
          />
          {ALL_STATUSES.map((s) => (
            <PipelineStage
              key={s}
              label={STATUS_CONFIG[s].label}
              count={stats[s] || 0}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
            />
          ))}
        </div>

        {/* Toolbar Row */}
        <div className="mt-5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-shrink-0">
            <input
              type="checkbox"
              checked={filteredApplications.length > 0 && selectedIds.size === filteredApplications.length}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-cream-300 text-navy-600 focus:ring-navy-500 cursor-pointer"
              title="Select all"
            />
            <span className="text-sm text-warm-gray">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${filteredApplications.length} job${filteredApplications.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
              <input
                type="text"
                placeholder="Search by company or job title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-white border border-cream-200 rounded-lg text-sm text-charcoal placeholder:text-warm-gray/50 focus:outline-none focus:border-gold-400 focus:ring-0 transition-all"
                style={{ boxShadow: 'none' }}
              />
            </div>
            <div className="relative sm:w-44">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | 'all')}
                aria-label="Filter by status"
                className="w-full pl-10 pr-8 py-2.5 bg-white border border-cream-200 rounded-lg text-sm text-charcoal appearance-none cursor-pointer focus:outline-none focus:border-gold-400 focus:ring-0 transition-all"
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
        </div>

        {/* Applications List */}
        {applications.length === 0 ? (
          <div className="mt-16 text-center">
            <div className="inline-flex p-6 bg-cream-100 rounded-3xl mb-6">
              <Briefcase className="w-12 h-12 text-warm-gray/60" />
            </div>
            <h3 className="text-xl font-bold text-navy-700 mb-2">No jobs tracked yet</h3>
            <p className="text-base text-warm-gray mb-8 max-w-sm mx-auto leading-relaxed">
              Start your first job application and it will appear here automatically.
            </p>
            <button
              onClick={() => setActiveTab('cv')}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-gold-400 to-gold-500 rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add a New Job
            </button>
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="mt-16 text-center">
            <div className="inline-flex p-6 bg-cream-100 rounded-3xl mb-6">
              <Search className="w-12 h-12 text-warm-gray/60" />
            </div>
            <h3 className="text-xl font-bold text-navy-700 mb-2">No jobs match your search</h3>
            <p className="text-base text-warm-gray mb-6 max-w-sm mx-auto">
              Try adjusting your search or filter criteria.
            </p>
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
              className="text-sm font-semibold text-gold-600 hover:text-gold-700 transition-colors cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
              <div className="mt-4 flex items-center justify-between px-5 py-3 bg-navy-50 border border-navy-200 rounded-xl">
                <span className="text-sm font-semibold text-navy-700">
                  {selectedIds.size} job{selectedIds.size !== 1 ? 's' : ''} selected
                </span>
                {confirmBulkDelete ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-red-600 font-medium">Delete {selectedIds.size} job{selectedIds.size !== 1 ? 's' : ''}?</span>
                    <button
                      onClick={handleBulkDelete}
                      disabled={isBulkDeleting}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {isBulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {isBulkDeleting ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                    <button
                      onClick={() => setConfirmBulkDelete(false)}
                      disabled={isBulkDeleting}
                      className="px-4 py-2 text-sm font-semibold text-warm-gray bg-white border border-cream-300 rounded-lg hover:bg-cream-50 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setConfirmBulkDelete(true)}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Selected
                    </button>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="px-4 py-2 text-sm font-semibold text-warm-gray bg-white border border-cream-200 rounded-lg hover:bg-cream-50 transition-colors cursor-pointer"
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
                    <tr className="border-b border-cream-200 bg-cream-50">
                      <th className="w-12 px-4 py-4" />
                      <th className="text-left px-6 py-4 text-xs font-semibold text-warm-gray uppercase tracking-wider">Job Position</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-warm-gray uppercase tracking-wider">Company</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-warm-gray uppercase tracking-wider">Date Saved</th>
                      <th className="text-center px-6 py-4 text-xs font-semibold text-warm-gray uppercase tracking-wider">Match Score</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-warm-gray uppercase tracking-wider">Status</th>
                      <th className="w-12 px-4 py-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-100">
                    {filteredApplications.map((app) => {
                      const appStatus = app.status || 'applied';
                      return (
                        <tr
                          key={app.id}
                          className={`group transition-colors ${navigatingSessionId === app.id ? 'bg-cream-50 opacity-70' : 'hover:bg-cream-50/50'}`}
                        >
                          <td className="w-12 px-4 py-5">
                            <input
                              type="checkbox"
                              title="Select row"
                              checked={selectedIds.has(app.id)}
                              onChange={() => toggleSelection(app.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 rounded border-cream-300 text-navy-600 focus:ring-navy-500 cursor-pointer"
                            />
                          </td>
                          <td
                            className="px-6 py-5 cursor-pointer"
                            onClick={() => navigatingSessionId ? undefined : handleRowClick(app.id)}
                          >
                            <span className="text-base font-semibold text-navy-700 truncate block max-w-[260px] group-hover:text-navy-800">
                              {app.job_title || 'Untitled Position'}
                            </span>
                          </td>
                          <td
                            className="px-6 py-5 cursor-pointer"
                            onClick={() => navigatingSessionId ? undefined : handleRowClick(app.id)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-navy-100 to-navy-200 flex items-center justify-center">
                                <Briefcase className="w-4 h-4 text-navy-600" />
                              </div>
                              <InlineEditableCompany
                                value={app.company || ''}
                                onSave={(newName) => handleRenameCompany(app.id, newName)}
                                className="text-base font-medium text-charcoal"
                              />
                            </div>
                          </td>
                          <td
                            className="px-6 py-5 cursor-pointer"
                            onClick={() => navigatingSessionId ? undefined : handleRowClick(app.id)}
                          >
                            <div className="flex items-center gap-2 text-sm text-warm-gray">
                              <CalendarDays className="w-4 h-4 flex-shrink-0" />
                              {new Date(app.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </div>
                          </td>
                          <td
                            className="px-6 py-5 text-center cursor-pointer"
                            onClick={() => navigatingSessionId ? undefined : handleRowClick(app.id)}
                          >
                            {app.match_score ? (
                              <div className="inline-flex items-center gap-1.5">
                                <Target className="w-4 h-4 text-gold-500" />
                                <span className={`text-base font-bold ${
                                  app.match_score >= 70 ? 'text-gold-600' :
                                  app.match_score >= 55 ? 'text-warm-gray' :
                                  'text-red-500'
                                }`}>
                                  {app.match_score}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-cream-400">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-5">
                            {navigatingSessionId === app.id ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-navy-500" />
                                <span className="text-sm text-warm-gray">Opening...</span>
                              </div>
                            ) : updatingSessionId === app.id ? (
                              <Loader2 className="w-5 h-5 animate-spin text-gold-500" />
                            ) : (
                              <StatusDropdown
                                status={appStatus}
                                onStatusChange={(newStatus) => handleStatusChange(app.id, newStatus)}
                              />
                            )}
                          </td>
                          <td className="w-12 px-4 py-5 text-right">
                            {deletingSessionId === app.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                            ) : confirmDeleteId === app.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(app.id); }}
                                  className="px-2.5 py-1 text-xs font-semibold text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors cursor-pointer"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                                  className="px-2.5 py-1 text-xs font-semibold text-warm-gray bg-cream-100 rounded-md hover:bg-cream-200 transition-colors cursor-pointer"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(app.id); }}
                                className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-warm-gray hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                                title="Delete application"
                              >
                                <Trash2 className="w-4 h-4" />
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
                    className={`bg-white rounded-2xl border border-cream-200 shadow-sm p-5 transition-all ${navigatingSessionId === app.id ? 'opacity-70' : 'hover:border-cream-300 hover:shadow-md'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(app.id)}
                        onChange={() => toggleSelection(app.id)}
                        onClick={(e) => e.stopPropagation()}
                        title="Select row"
                        className="w-4 h-4 mt-1 rounded border-cream-300 text-navy-600 focus:ring-navy-500 cursor-pointer flex-shrink-0"
                      />
                      <div
                        className={`flex-1 min-w-0 ${navigatingSessionId ? '' : 'cursor-pointer'}`}
                        onClick={() => navigatingSessionId ? undefined : handleRowClick(app.id)}
                      >
                        <p className="text-base font-bold text-navy-700 truncate mb-1">
                          {app.job_title || 'Untitled Position'}
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0 w-6 h-6 rounded-md bg-gradient-to-br from-navy-100 to-navy-200 flex items-center justify-center">
                            <Briefcase className="w-3 h-3 text-navy-600" />
                          </div>
                          <InlineEditableCompany
                            value={app.company || ''}
                            onSave={(newName) => handleRenameCompany(app.id, newName)}
                            className="text-sm text-warm-gray"
                          />
                        </div>
                      </div>
                      {updatingSessionId === app.id ? (
                        <Loader2 className="w-5 h-5 animate-spin text-gold-500 flex-shrink-0" />
                      ) : (
                        <StatusDropdown
                          status={appStatus}
                          onStatusChange={(newStatus) => handleStatusChange(app.id, newStatus)}
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-cream-100">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-sm text-warm-gray">
                          <CalendarDays className="w-4 h-4" />
                          {new Date(app.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                        {app.match_score && (
                          <div className="flex items-center gap-1.5">
                            <Target className="w-4 h-4 text-gold-500" />
                            <span className={`text-sm font-bold ${
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
                        <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                      ) : confirmDeleteId === app.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(app.id); }}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                            className="px-3 py-1.5 text-xs font-semibold text-warm-gray bg-cream-100 rounded-lg hover:bg-cream-200 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(app.id); }}
                          className="p-2 rounded-xl text-warm-gray hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                          title="Delete application"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load More + Count */}
            <div className="mt-8 flex flex-col items-center gap-3">
              {hasMore && (
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-navy-700 bg-white border border-cream-200 rounded-xl hover:bg-cream-50 hover:border-gold-300 transition-all shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      Load More
                      <span className="text-xs text-warm-gray">
                        ({applications.length} of {totalCount})
                      </span>
                    </>
                  )}
                </button>
              )}
              <p className="text-sm text-warm-gray">
                Showing {filteredApplications.length} of {totalCount} application{totalCount !== 1 ? 's' : ''}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
