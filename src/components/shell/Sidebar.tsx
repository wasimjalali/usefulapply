'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, ClipboardList, Plus, Settings } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { useAuth } from '@/contexts/AuthContext';
import { useSessionStore } from '@/store/useSessionStore';
import { useUIStore } from '@/store/useUIStore';
import { fileDisplayUrl } from '@/storage/paths';
import { useJobFeedBadge } from '@/hooks/useJobFeedBadge';
import {
  deriveApplicationStatus,
  statusPillClass,
} from '@/components/shell/application-status';

interface SidebarProps {
  isWorking?: boolean;
}

export function Sidebar({ isWorking = false }: SidebarProps) {
  const requestNewApplication = useUIStore((s) => s.requestNewApplication);
  const router = useRouter();
  const { user, profile } = useAuth();
  const sessions = useSessionStore((s) => s.sessions);
  const currentSession = useSessionStore((s) => s.currentSession);
  const loadSession = useSessionStore((s) => s.loadSession);
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const jobFeedBadge = useJobFeedBadge(Boolean(user), user?.id ?? null);

  const feedCount = jobFeedBadge.hasPending
    ? jobFeedBadge.unprocessedCount
    : jobFeedBadge.jobCount;
  const feedLabel = feedCount > 0
    ? `${feedCount} new role${feedCount === 1 ? '' : 's'} for you`
    : 'No new roles yet';

  const displayName = profile?.full_name || user?.name || user?.email || 'Your account';
  const initials = useMemo(() => {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return displayName.slice(0, 2).toUpperCase();
  }, [displayName]);

  const planLabel = profile?.subscription_tier === 'max'
    ? 'Max plan'
    : profile?.subscription_tier === 'plus'
      ? 'Plus plan'
      : 'Free plan';

  const avatarUrl = fileDisplayUrl(profile?.avatar_url);

  return (
    <aside className="flex h-full w-[248px] flex-shrink-0 flex-col gap-4 border-r border-cream-200 bg-cream-100 px-3 pb-3 pt-4">
      <div className="px-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => setActiveTab('cv')}
          className="cursor-pointer"
          aria-label="Go to Application Kit"
        >
          <BrandLogo variant="full" size="xs" theme="light" />
        </button>
      </div>

      <button
        type="button"
        onClick={requestNewApplication}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-cream-200 bg-cream-50 text-sm font-semibold text-navy-800 shadow-sm hover:bg-white cursor-pointer"
      >
        <Plus className="h-4 w-4" />
        New application
      </button>

      <button
        type="button"
        onClick={() => {
          setActiveTab('jobs');
          jobFeedBadge.acknowledge();
        }}
        className={`flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left shadow-sm cursor-pointer ${
          activeTab === 'jobs'
            ? 'border-gold-200 bg-white'
            : 'border-cream-200 bg-cream-50 hover:bg-white'
        }`}
      >
        <span className="inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-600">
          <Briefcase className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-navy-800">Today&apos;s feed</span>
          <span className="block text-xs text-warm-gray">{feedLabel}</span>
        </span>
        {feedCount > 0 && (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-gold-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {feedCount}
          </span>
        )}
      </button>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        <p className="px-1.5 text-[11px] font-semibold tracking-[0.08em] text-warm-gray">APPLICATIONS</p>
        {sessions.length === 0 && (
          <p className="px-1.5 text-xs text-warm-gray">No applications yet.</p>
        )}
        {sessions.map((session) => {
          const isCurrent = currentSession?.id === session.id && activeTab !== 'jobs' && activeTab !== 'tracker';
          const status = deriveApplicationStatus(session, {
            isCurrent,
            isWorking: isCurrent && isWorking,
          });
          return (
            <button
              key={session.id}
              type="button"
              onClick={() => {
                loadSession(session.id);
                setActiveTab('cv');
              }}
              className={`flex w-full flex-col gap-1.5 rounded-lg px-3 py-2.5 text-left cursor-pointer ${
                isCurrent
                  ? 'border border-cream-200 bg-white shadow-sm'
                  : 'border border-transparent hover:bg-cream-50'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-semibold text-navy-800">
                  {session.company || 'New application'}
                </span>
                <span className={`inline-flex h-[22px] flex-shrink-0 items-center rounded-full px-2 text-[11px] font-semibold ${statusPillClass(status)}`}>
                  {status}
                </span>
              </span>
              <span className="truncate text-xs text-warm-gray">
                {session.jobTitle || 'Role not set'}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setActiveTab('tracker')}
        className={`flex items-center gap-2 px-1.5 py-2 text-[13px] font-medium cursor-pointer ${
          activeTab === 'tracker' ? 'text-navy-800' : 'text-warm-gray hover:text-navy-700'
        }`}
      >
        <ClipboardList className="h-4 w-4" />
        Tracker table
      </button>

      <div className="h-px bg-cream-200" />

      <div className="flex items-center gap-2.5 px-1.5 py-1">
        <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy-600 text-[12px] font-semibold text-white">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-navy-800">{displayName}</p>
          <p className="text-[11px] text-warm-gray">{planLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/settings')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-warm-gray hover:bg-cream-50 hover:text-navy-800 cursor-pointer"
          aria-label="Open settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
