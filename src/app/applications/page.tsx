'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useSessionStore } from '@/store/useSessionStore';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import { updateSession } from '@/lib/supabase/sessions';
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
} from 'lucide-react';

type ApplicationStatus = 'applied' | 'interview' | 'rejected' | 'accepted' | 'follow_up';

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; bg: string; text: string; dot: string }> = {
  applied: { label: 'Applied', bg: 'bg-gold-100', text: 'text-gold-700', dot: 'bg-gold-400' },
  interview: { label: 'Interview', bg: 'bg-sage-100', text: 'text-sage-600', dot: 'bg-sage-500' },
  rejected: { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400' },
  accepted: { label: 'Accepted', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  follow_up: { label: 'Follow-Up Sent', bg: 'bg-navy-100', text: 'text-navy-700', dot: 'bg-navy-500' },
};

const ALL_STATUSES: ApplicationStatus[] = ['applied', 'interview', 'follow_up', 'rejected', 'accepted'];

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.applied;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function StatusDropdown({
  status,
  onStatusChange,
}: {
  status: ApplicationStatus;
  onStatusChange: (newStatus: ApplicationStatus) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.applied;

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all hover:ring-2 hover:ring-cream-300 ${config.bg} ${config.text}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
        {config.label}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white rounded-xl shadow-lg border border-cream-200 py-1 animate-in fade-in slide-in-from-top-1">
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

export default function ApplicationsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { sessions, loadSession } = useSessionStore();

  useSupabaseSync();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');
  const [updatingSessionId, setUpdatingSessionId] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [authLoading, user, router]);

  // Filter out local-only sessions (not yet synced to Supabase)
  const syncedSessions = useMemo(() => {
    return sessions
      .filter((s) => !s.id.startsWith('session-'))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sessions]);

  // Apply search and status filters
  const filteredSessions = useMemo(() => {
    return syncedSessions.filter((session) => {
      const matchesSearch =
        !searchQuery ||
        (session.company || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (session.jobTitle || '').toLowerCase().includes(searchQuery.toLowerCase());

      const sessionStatus = (session as any).status || 'applied';
      const matchesStatus = statusFilter === 'all' || sessionStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [syncedSessions, searchQuery, statusFilter]);

  // Compute stats
  const stats = useMemo(() => {
    const counts: Record<string, number> = { all: syncedSessions.length };
    for (const s of syncedSessions) {
      const status = (s as any).status || 'applied';
      counts[status] = (counts[status] || 0) + 1;
    }
    return counts;
  }, [syncedSessions]);

  const handleStatusChange = async (sessionId: string, newStatus: ApplicationStatus) => {
    setUpdatingSessionId(sessionId);
    try {
      const { error } = await updateSession(sessionId, { status: newStatus });
      if (error) {
        console.error('[Applications] Error updating status:', error);
      } else {
        // Update local store
        const store = useSessionStore.getState();
        const updatedSessions = store.sessions.map((s) =>
          s.id === sessionId ? { ...s, status: newStatus } as any : s
        );
        store.setSessions(updatedSessions);
        // Also update currentSession if it matches
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

  const handleRowClick = (sessionId: string) => {
    loadSession(sessionId);
    router.push('/dashboard');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
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
            count={stats.all || 0}
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
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-cream-200 rounded-xl text-sm text-charcoal placeholder:text-warm-gray/60 focus:outline-none focus:ring-2 focus:ring-navy-200 focus:border-navy-300 transition-all"
            />
          </div>
          <div className="relative sm:w-48">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | 'all')}
              aria-label="Filter by status"
              className="w-full pl-10 pr-8 py-2.5 bg-white border border-cream-200 rounded-xl text-sm text-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-navy-200 focus:border-navy-300 transition-all"
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
        {filteredSessions.length === 0 ? (
          <div className="mt-12 text-center">
            <div className="inline-flex p-4 bg-cream-200/60 rounded-2xl mb-4">
              <Briefcase className="w-8 h-8 text-warm-gray" />
            </div>
            <h3 className="text-lg font-semibold text-navy-700 mb-1">
              {syncedSessions.length === 0 ? 'No applications yet' : 'No matching applications'}
            </h3>
            <p className="text-sm text-warm-gray mb-6 max-w-sm mx-auto">
              {syncedSessions.length === 0
                ? 'Start your first job application in the dashboard and track it here.'
                : 'Try adjusting your search or filter criteria.'}
            </p>
            {syncedSessions.length === 0 && (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-gold-400 to-gold-500 rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Start First Application
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block mt-4">
              <div className="bg-white rounded-2xl border border-cream-200 shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-cream-200 bg-cream-50/60">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wider">Company</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wider">Job Title</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wider">Date</th>
                      <th className="text-center px-5 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wider">Match</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-100">
                    {filteredSessions.map((session) => {
                      const sessionStatus = ((session as any).status || 'applied') as ApplicationStatus;
                      return (
                        <tr
                          key={session.id}
                          onClick={() => handleRowClick(session.id)}
                          className="hover:bg-cream-50/60 transition-colors cursor-pointer group"
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-navy-100 to-navy-200 flex items-center justify-center">
                                <Briefcase className="w-3.5 h-3.5 text-navy-600" />
                              </div>
                              <span className="text-sm font-semibold text-navy-700 group-hover:text-navy-800 truncate max-w-[180px]">
                                {session.company || 'Unknown Company'}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm text-charcoal truncate block max-w-[220px]">
                              {session.jobTitle || 'Untitled Position'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5 text-xs text-warm-gray">
                              <CalendarDays className="w-3.5 h-3.5" />
                              {new Date(session.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            {session.matchScore ? (
                              <div className="inline-flex items-center gap-1">
                                <Target className="w-3.5 h-3.5 text-gold-500" />
                                <span className={`text-xs font-bold ${
                                  session.matchScore >= 85 ? 'text-sage-600' :
                                  session.matchScore >= 70 ? 'text-gold-600' :
                                  session.matchScore >= 55 ? 'text-warm-gray' :
                                  'text-red-500'
                                }`}>
                                  {session.matchScore}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-cream-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {updatingSessionId === session.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-gold-500 ml-auto" />
                            ) : (
                              <StatusDropdown
                                status={sessionStatus}
                                onStatusChange={(newStatus) => handleStatusChange(session.id, newStatus)}
                              />
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
              {filteredSessions.map((session) => {
                const sessionStatus = ((session as any).status || 'applied') as ApplicationStatus;
                return (
                  <div
                    key={session.id}
                    onClick={() => handleRowClick(session.id)}
                    className="bg-white rounded-xl border border-cream-200 shadow-sm p-4 cursor-pointer hover:border-cream-300 transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-navy-100 to-navy-200 flex items-center justify-center">
                            <Briefcase className="w-3 h-3 text-navy-600" />
                          </div>
                          <h3 className="text-sm font-semibold text-navy-700 truncate">
                            {session.company || 'Unknown Company'}
                          </h3>
                        </div>
                        <p className="text-xs text-charcoal ml-9 truncate">
                          {session.jobTitle || 'Untitled Position'}
                        </p>
                      </div>
                      {updatingSessionId === session.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gold-500 flex-shrink-0" />
                      ) : (
                        <StatusDropdown
                          status={sessionStatus}
                          onStatusChange={(newStatus) => handleStatusChange(session.id, newStatus)}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-3 ml-9">
                      <div className="flex items-center gap-1 text-xs text-warm-gray">
                        <CalendarDays className="w-3 h-3" />
                        {new Date(session.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                      {session.matchScore && (
                        <div className="flex items-center gap-1">
                          <Target className="w-3 h-3 text-gold-500" />
                          <span className={`text-xs font-bold ${
                            session.matchScore >= 85 ? 'text-sage-600' :
                            session.matchScore >= 70 ? 'text-gold-600' :
                            session.matchScore >= 55 ? 'text-warm-gray' :
                            'text-red-500'
                          }`}>
                            {session.matchScore}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Results count */}
            <p className="mt-4 text-xs text-warm-gray text-center">
              Showing {filteredSessions.length} of {syncedSessions.length} application{syncedSessions.length !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
