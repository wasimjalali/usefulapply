'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  AVAILABILITY_CHOICES,
  AVAILABILITY_LABELS,
  AVAILABILITY_NOTE_MAX,
  SALARY_EXPECTATION_MAX,
  type AvailabilityChoice,
} from '@/lib/profile/logistics';

interface LogisticsQuestionsProps {
  /** The guided line shows it as a full step, the chat as an inline card. */
  layout: 'line' | 'chat';
  saveLabel: string;
  /** Called once the answer (or the skip) is stored, so the parked kit can run. */
  onResolved: (outcome: 'saved' | 'skipped') => void;
}

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-cream-200 bg-cream-50 px-3 text-sm text-charcoal placeholder:text-warm-gray focus:border-navy-500 focus:outline-none';

/**
 * The two questions asked once before the first kit: when the applicant can
 * start and what they expect to earn. The writers use only these answers, so
 * nothing about timing or pay is invented. A skip is stored too, so it's
 * never asked again.
 */
export function LogisticsQuestions({ layout, saveLabel, onResolved }: LogisticsQuestionsProps) {
  const { updateProfile, refreshProfile } = useAuth();
  const [choice, setChoice] = useState<AvailabilityChoice | null>(null);
  const [note, setNote] = useState('');
  const [salary, setSalary] = useState('');
  const [busy, setBusy] = useState<'save' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const noteTrimmed = note.trim();
  const salaryTrimmed = salary.trim();
  // A start date is the main question, but a salary alone is still worth saving.
  const canSave = choice === 'other'
    ? noteTrimmed.length > 0
    : choice !== null || salaryTrimmed.length > 0;

  const store = async (
    values: { availability: AvailabilityChoice | null; availabilityNote?: string | null; salaryExpectation?: string | null },
    outcome: 'saved' | 'skipped',
  ) => {
    setBusy(outcome === 'saved' ? 'save' : 'skip');
    setError(null);
    try {
      const { error: saveError } = await updateProfile(values as never);
      if (saveError) throw saveError;
      // The server stamps when the question was asked. Reading it back keeps
      // the next kit from asking again.
      await refreshProfile();
    } catch {
      setBusy(null);
      setError("We couldn't save that. Try again.");
      return;
    }
    setBusy(null);
    onResolved(outcome);
  };

  const save = () => {
    if (!canSave || busy) return;
    void store(
      {
        availability: choice,
        availabilityNote: choice ? noteTrimmed || null : null,
        salaryExpectation: salaryTrimmed || null,
      },
      'saved',
    );
  };

  const skip = () => {
    if (busy) return;
    // Availability alone: the server stamps that the question was asked, and nothing else is overwritten.
    void store({ availability: null }, 'skipped');
  };

  const isLine = layout === 'line';
  const Heading = isLine ? 'h1' : 'h2';

  return (
    <div
      className={isLine
        ? 'mt-9 w-full max-w-[720px] rounded-2xl border border-cream-200 bg-white p-8 shadow-sm'
        : 'rounded-2xl border border-cream-200 bg-cream-50 p-5 shadow-sm'}
    >
      <Heading className={isLine ? 'text-2xl font-semibold text-navy-800' : 'text-base font-semibold text-navy-800'}>
        Two quick questions before I write
      </Heading>

      <div className="mt-5 flex flex-col gap-5">
        <div>
          <p id="logistics-start-label" className="text-sm font-medium text-navy-800">When can you start?</p>
          <div role="radiogroup" aria-labelledby="logistics-start-label" className="mt-2 flex flex-wrap gap-2">
            {AVAILABILITY_CHOICES.map((value) => {
              const selected = choice === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setChoice(selected ? null : value)}
                  className={`inline-flex items-center rounded-full border text-sm ${isLine ? 'h-9 px-4' : 'h-8 px-3'} font-medium shadow-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50 cursor-pointer ${
                    selected
                      ? 'border-navy-600 bg-navy-600 text-white'
                      : 'border-cream-200 bg-cream-50 text-navy-800 hover:bg-white'
                  }`}
                >
                  {AVAILABILITY_LABELS[value]}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-navy-800">
            {choice === 'other' ? 'Details' : 'Details (optional)'}
          </span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') save(); }}
            maxLength={AVAILABILITY_NOTE_MAX}
            placeholder="3 months to the end of the quarter"
            className={`mt-2 ${INPUT_CLASS}`}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-navy-800">Salary expectation (optional)</span>
          <input
            value={salary}
            onChange={(event) => setSalary(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') save(); }}
            maxLength={SALARY_EXPECTATION_MAX}
            placeholder="65,000 EUR gross a year"
            className={`mt-2 ${INPUT_CLASS}`}
          />
          <span className="mt-1.5 block text-xs text-warm-gray">Leave it empty and it won&apos;t be mentioned.</span>
        </label>
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!canSave || busy !== null}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-gold-400 px-[22px] text-sm font-semibold text-white transition-colors duration-200 hover:bg-gold-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50 disabled:cursor-not-allowed disabled:bg-cream-200 disabled:text-warm-gray cursor-pointer"
        >
          {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={skip}
          disabled={busy !== null}
          className="rounded-lg px-2 py-1 text-sm font-medium text-navy-600 transition-colors duration-200 hover:text-navy-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50 disabled:cursor-not-allowed disabled:text-warm-gray cursor-pointer"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
