'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import {
  STATUSES_WITH_DATE,
  TRACKER_STATUSES,
  TRACKER_STATUS_LABEL,
  parseDate,
  toIso,
  type TrackerStatus,
} from './tracker-status';

interface StatusPopoverProps {
  status: TrackerStatus;
  interviewAt: string | null;
  followUpDueAt: string | null;
  /** `when` opens straight on the date step, for a click on the NEXT cell. */
  mode: 'status' | 'when';
  /** The element the panel hangs under, so it can escape the table's clipping. */
  anchor: HTMLElement | null;
  /** The reminder line is a promise, so it only shows when the email is on. */
  remindersOn: (status: TrackerStatus) => boolean;
  onClose: () => void;
  onSave: (next: {
    status: TrackerStatus;
    interviewAt?: string | null;
    followUpDueAt?: string | null;
  }) => void;
}

const PANEL_WIDTH = 244;
/** Roughly the taller of the two steps; used to flip the panel above the row. */
const PANEL_HEIGHT = 230;

/** Tomorrow, then the next two weekdays. */
function quickDates(now: Date): { label: string; date: Date }[] {
  const out: { label: string; date: Date }[] = [];
  const cursor = new Date(now.getTime());
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1);
  out.push({ label: 'Tomorrow', date: new Date(cursor.getTime()) });
  while (out.length < 3) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day === 0 || day === 6) continue;
    out.push({
      label: cursor.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
      date: new Date(cursor.getTime()),
    });
  }
  return out;
}

function toDateInputValue(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function toTimeInputValue(date: Date): string {
  return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

/** Only the date that belongs to this status, never the one it is leaving. */
function dateForStatus(
  status: TrackerStatus,
  interviewAt: string | null,
  followUpDueAt: string | null,
): Date | null {
  if (status === 'interview') return parseDate(interviewAt);
  if (status === 'follow_up' || status === 'accepted') return parseDate(followUpDueAt);
  return null;
}

export function StatusPopover({
  status,
  interviewAt,
  followUpDueAt,
  mode,
  anchor,
  remindersOn,
  onClose,
  onSave,
}: StatusPopoverProps) {
  const [step, setStep] = useState<'status' | 'when'>(mode);
  const [pending, setPending] = useState<TrackerStatus>(status);
  const existing = dateForStatus(status, interviewAt, followUpDueAt);
  const [date, setDate] = useState<string>(existing ? toDateInputValue(existing) : '');
  const [time, setTime] = useState<string>(existing ? toTimeInputValue(existing) : '09:00');
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const quick = useMemo(() => quickDates(new Date()), []);

  // Fixed to the viewport, because the table card clips its overflow and the
  // bottom rows would otherwise lose the Save button.
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const below = rect.bottom + 4;
      const flip = below + PANEL_HEIGHT > window.innerHeight;
      setPosition({
        top: flip ? Math.max(8, rect.top - PANEL_HEIGHT - 4) : below,
        left: Math.min(Math.max(8, rect.left), window.innerWidth - PANEL_WIDTH - 8),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, step]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const pick = (next: TrackerStatus) => {
    setPending(next);
    if (STATUSES_WITH_DATE.includes(next)) {
      // A different status starts with an empty date: the one on screen
      // belonged to the status being left.
      const carried = next === status ? existing : null;
      setDate(carried ? toDateInputValue(carried) : '');
      setTime(carried ? toTimeInputValue(carried) : '09:00');
      setStep('when');
      return;
    }
    onSave({ status: next });
  };

  const save = () => {
    if (!date) {
      onSave({ status: pending });
      return;
    }
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = pending === 'interview' ? time.split(':').map(Number) : [9, 0];
    const when = new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0);
    if (Number.isNaN(when.getTime())) {
      onSave({ status: pending });
      return;
    }
    onSave(
      pending === 'interview'
        ? { status: pending, interviewAt: toIso(when) }
        : { status: pending, followUpDueAt: toIso(when) },
    );
  };

  const label = TRACKER_STATUS_LABEL[pending];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={step === 'status' ? 'Change status' : `When is the ${label.toLowerCase()}?`}
        style={{
          position: 'fixed',
          top: position?.top ?? -9999,
          left: position?.left ?? -9999,
          width: PANEL_WIDTH,
        }}
        className="z-50 rounded-card border border-border bg-surface p-1.5 shadow-elevated focus:outline-none"
      >
        {step === 'status' ? (
          <ul role="listbox" aria-label="Status">
            {TRACKER_STATUSES.map((option) => {
              const on = option === status;
              return (
                <li key={option}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => pick(option)}
                    className={`flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-[13px] cursor-pointer ${
                      on ? 'bg-surface-raised font-semibold text-ink shadow-resting' : 'text-ink hover:bg-canvas'
                    }`}
                  >
                    <span className="h-2 w-2 flex-shrink-0 rounded-pill bg-brand" />
                    <span className="flex-1">{TRACKER_STATUS_LABEL[option]}</span>
                    {on && <Check className="h-4 w-4 text-accent-strong" />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-1.5">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <span className="h-2 w-2 rounded-pill bg-brand" />
              {label}
              <span className="font-normal text-ink-muted">· when?</span>
            </p>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {quick.map((option) => {
                const value = toDateInputValue(option.date);
                const on = date === value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setDate(value)}
                    className={`rounded-pill px-2.5 py-1.5 text-[12px] font-medium cursor-pointer ${
                      on
                        ? 'bg-accent text-accent-ink'
                        : 'border border-border bg-surface text-ink hover:bg-canvas'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
              <label className="rounded-pill border border-border bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink hover:bg-canvas cursor-pointer">
                Pick a date
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="sr-only"
                />
              </label>
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              {pending === 'interview' && (
                <input
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  aria-label="Time"
                  className="h-9 flex-1 rounded-control border border-border bg-surface-raised px-2.5 text-[13px] text-ink"
                />
              )}
              <button
                type="button"
                onClick={save}
                className={`h-9 rounded-control bg-accent px-4 text-[13px] font-semibold text-accent-ink hover:bg-accent-strong cursor-pointer ${
                  pending === 'interview' ? '' : 'flex-1'
                }`}
              >
                Save
              </button>
            </div>

            <p className="mt-2 text-[11px] leading-snug text-ink-muted">
              {remindersOn(pending) ? 'I’ll remind you the day before. ' : ''}
              Skip the date and it just says {label}.
            </p>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
