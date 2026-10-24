'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { detectTimezone } from '@/lib/utils/format-date';
import { authClient } from '@/auth/client';
import { changePassword } from '@/lib/supabase';
import { uploadAvatar, setAvatar, deleteAvatar, deleteProfilePhoto } from '@/lib/supabase/storage';
import { fileDisplayUrl } from '@/storage/paths';
import { useCVStore } from '@/store/useCVStore';
import { getBillingSubscriptionAction } from '@/db/actions';
import { willBillAgain, type BillingSubscriptionLike } from '@/lib/subscription-billing';
import { openSettings } from '@/store/useSettingsStore';
import {
  Caption,
  LinkButton,
  OutlineButton,
  PaneHeading,
  Row,
  RowGroup,
  Select,
  ValueText,
} from '@/components/settings/parts';
import {
  AVAILABILITY_CHOICES,
  AVAILABILITY_LABELS,
  AVAILABILITY_NOTE_MAX,
  LOGISTICS_TEXT_BLOCKED_MESSAGE,
  SALARY_EXPECTATION_MAX,
  hasBlockedLogisticsText,
} from '@/lib/profile/logistics';

type EditableField = 'full_name' | 'phone' | 'location' | 'availability_note' | 'salary_expectation' | 'availability';

// The start date and salary go through the profile service under their API
// names, which also records that the applicant was asked.
const LOGISTICS_UPDATE_KEYS: Partial<Record<EditableField, string>> = {
  availability_note: 'availabilityNote',
  salary_expectation: 'salaryExpectation',
};
const FIELD_MAX: Partial<Record<EditableField, number>> = {
  availability_note: AVAILABILITY_NOTE_MAX,
  salary_expectation: SALARY_EXPECTATION_MAX,
};

const SAVE_FAILED = "We couldn't save that. Try again.";

/**
 * "Other" with no Details, or Details with no start choice: the writers ignore both, so "Saved" would
 * mislead. Returns what to tell the user, or null when the saved start date is usable.
 */
function logisticsUnusable(row: { availability?: string | null; availability_note?: string | null } | null): string | null {
  if (!row) return null;
  const note = row.availability_note?.trim();
  if (row.availability === 'other' && !note) return 'Add details to use Other.';
  if (!row.availability && note) return 'Pick when you can start to use these details.';
  return null;
}

const AVAILABILITY_OPTIONS = [
  { value: '', label: 'Not set' },
  ...AVAILABILITY_CHOICES.map((value) => ({ value, label: AVAILABILITY_LABELS[value] })),
];

const DATE_FORMATS = [
  { value: 'dmy', sample: (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
  { value: 'mdy', sample: (d: Date) => d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) },
  { value: 'iso', sample: (d: Date) => d.toISOString().slice(0, 10) },
] as const;

function detectedTimezone(): string {
  return detectTimezone() ?? 'UTC';
}

function timezoneOptions(current: string): Array<{ value: string; label: string }> {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  let zones: string[] = [];
  try {
    zones = supported ? supported('timeZone') : [];
  } catch {
    zones = [];
  }
  if (zones.length === 0) {
    zones = [
      'UTC', 'Europe/London', 'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Madrid',
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Toronto', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
      'Australia/Sydney',
    ];
  }
  if (current && !zones.includes(current)) zones = [current, ...zones];
  return zones.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }));
}

export function GeneralPane() {
  const { user, profile, signOut, updateProfile, refreshProfile } = useAuth();

  const [editing, setEditing] = useState<EditableField | null>(null);
  const [draft, setDraft] = useState('');
  const cancelledEditRef = useRef(false);
  const [savedField, setSavedField] = useState<EditableField | null>(null);
  // The row whose last save the writers can't use (see logisticsUnusable), with what to tell the user.
  // Cleared by the next edit.
  const [unusable, setUnusable] = useState<{ field: EditableField; message: string } | null>(null);
  // The row whose last save was refused or failed, so a rejected edit never just vanishes.
  const [saveError, setSaveError] = useState<{ field: EditableField; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordDone, setPasswordDone] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await authClient.listAccounts();
        const rows = (result?.data ?? []) as Array<{ providerId?: string }>;
        if (cancelled) return;
        const social = rows.find((row) => row.providerId && row.providerId !== 'credential');
        setProvider(social?.providerId ?? (rows.length > 0 ? 'credential' : null));
      } catch {
        // Leave the row on its neutral value rather than guessing.
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const flashSaved = useCallback((field: EditableField) => {
    setSavedField(field);
    setTimeout(() => setSavedField((current) => (current === field ? null : current)), 1600);
  }, []);

  const stored = useCallback((field: EditableField) => {
    if (field === 'full_name') return profile?.full_name ?? user?.name ?? '';
    return (profile?.[field] as string | null) ?? '';
  }, [profile, user]);

  const startEdit = useCallback((field: EditableField) => {
    // Escape removes the input, and a removed node never fires blur, so the
    // cancel flag is cleared here rather than in commit alone.
    cancelledEditRef.current = false;
    setUnusable(null);
    setSaveError(null);
    setDraft(stored(field));
    setEditing(field);
  }, [stored]);

  const commit = useCallback(async (field: EditableField, input?: HTMLInputElement) => {
    if (cancelledEditRef.current) {
      cancelledEditRef.current = false;
      setEditing(null);
      return;
    }
    const next = draft.trim();
    const logisticsKey = LOGISTICS_UPDATE_KEYS[field];
    if (logisticsKey && hasBlockedLogisticsText(next)) {
      // Keep the edit open with the reason: the server would refuse it and hide why.
      setSaveError({ field, message: LOGISTICS_TEXT_BLOCKED_MESSAGE });
      window.setTimeout(() => input?.focus(), 0);
      return;
    }
    setSaveError(null);
    setEditing(null);
    if (next === stored(field)) return;
    const { error } = await updateProfile({ [logisticsKey ?? field]: next || null });
    if (error) {
      console.error('[GeneralPane] Profile save failed:', error);
      // Reopen with what the user typed so they can retry.
      setDraft(next);
      setEditing(field);
      setSaveError({ field, message: SAVE_FAILED });
      return;
    }
    // The update carries API names, so read the stored row back.
    if (logisticsKey) {
      const latest = await refreshProfile();
      const message = field === 'availability_note' ? logisticsUnusable(latest) : null;
      if (message) {
        setSavedField(null);
        setUnusable({ field, message });
        return;
      }
    }
    flashSaved(field);
  }, [draft, stored, updateProfile, refreshProfile, flashSaved]);

  const changeAvailability = useCallback(async (next: string) => {
    setUnusable(null);
    setSaveError(null);
    setSavedField(null);
    const { error } = await updateProfile({ availability: next || null });
    if (error) {
      console.error('[GeneralPane] Start date save failed:', error);
      setSaveError({ field: 'availability', message: SAVE_FAILED });
      return;
    }
    const message = logisticsUnusable(await refreshProfile());
    if (message) {
      setUnusable({ field: 'availability', message });
      return;
    }
    flashSaved('availability');
  }, [updateProfile, refreshProfile, flashSaved]);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  const handleCopyEmail = async () => {
    if (!user?.email) return;
    try {
      await navigator.clipboard.writeText(user.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const handlePhoto = async (file: File) => {
    if (!user) return;
    setPhotoError(null);
    // Browsers often report an empty type for HEIC, so the name decides too.
    const isImage = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'].includes(file.type)
      || /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name);
    if (!isImage) {
      setPhotoError('Use a JPG, PNG, WebP or iPhone (HEIC) photo.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError('Keep the photo under 10MB.');
      return;
    }
    setPhotoBusy(true);
    const { key, error } = await uploadAvatar(user.id, file);
    if (error || !key) {
      setPhotoBusy(false);
      // Only the route's own user-facing copy may render; anything else
      // (network errors, generic failures) gets the generic line.
      const serverCopy = new Set([
        'That image could not be processed. Try a JPG or PNG.',
        'Unsupported file type.',
        'File is too large.',
        'Storage limit reached. Delete some files to upload more.',
        'Too many requests. Please try again later.',
      ]);
      setPhotoError(error && serverCopy.has(error.message)
        ? error.message
        : 'The upload failed. Try again.');
      return;
    }
    const { error: saveError } = await setAvatar(user.id, key);
    if (saveError) {
      setPhotoBusy(false);
      setPhotoError('We could not save the photo. Try again.');
      return;
    }
    // A photo still served from the legacy bucket is superseded now; leaving
    // it would waste quota and resurrect on a later remove failure.
    const previousCvPhoto = useCVStore.getState().profilePhoto;
    if (previousCvPhoto?.dataUrl?.includes('/api/files/profile-photos/')) {
      const { error: legacyError } = await deleteProfilePhoto(user.id);
      if (legacyError) console.error('[settings] failed to remove legacy CV photo:', legacyError);
    }
    // The same photo is the CV photo, so the CV preview updates right away.
    const displayUrl = fileDisplayUrl(key);
    if (displayUrl) {
      useCVStore.getState().setProfilePhoto({
        id: `photo-${Date.now()}`,
        fileName: file.name,
        dataUrl: displayUrl,
        uploadedAt: new Date().toISOString(),
      });
    }
    await refreshProfile();
    // Busy holds until the whole tail is done, so Remove cannot interleave
    // with the cleanup and store sync above.
    setPhotoBusy(false);
  };

  const handleRemovePhoto = async () => {
    if (!user) return;
    setPhotoError(null);
    setPhotoBusy(true);
    const { error: removeError, incomplete } = await deleteAvatar(user.id);
    if (removeError) {
      setPhotoBusy(false);
      setPhotoError('We could not remove the photo. Try again.');
      return;
    }
    useCVStore.getState().setProfilePhoto(null);
    setPhotoBusy(false);
    if (incomplete) {
      // A leftover object would bring the photo back on the next load.
      console.error('[settings] photo delete incomplete');
      setPhotoError('The photo may not be fully removed. Try Remove again.');
    }
    await refreshProfile();
  };

  const handleChangePassword = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const current = String(data.get('current') ?? '');
    const next = String(data.get('next') ?? '');
    const confirm = String(data.get('confirm') ?? '');
    setPasswordError(null);

    if (!current) { setPasswordError('Enter your current password.'); return; }
    if (next.length < 8) { setPasswordError('Use at least 8 characters.'); return; }
    if (next !== confirm) { setPasswordError('The two new passwords do not match.'); return; }

    setPasswordBusy(true);
    const { error } = await changePassword(next, current);
    setPasswordBusy(false);
    if (error) {
      // The provider's own wording never reaches the screen.
      console.error('[settings] password change failed:', error);
      setPasswordError('That current password is not right.');
      return;
    }
    form.reset();
    setShowPassword(false);
    setPasswordDone(true);
    setTimeout(() => setPasswordDone(false), 2400);
  };

  const [billing, setBilling] = useState<BillingSubscriptionLike | null>(null);
  // Same rule the delete route enforces, so the row never offers something the
  // server will refuse.
  const subscriptionBlocksDelete = willBillAgain(billing);

  const billingUserId = user?.id;
  useEffect(() => {
    if (!billingUserId) return;
    let cancelled = false;
    void getBillingSubscriptionAction(billingUserId)
      .then((row) => { if (!cancelled) setBilling(row); })
      .catch(() => { if (!cancelled) setBilling(null); });
    return () => { cancelled = true; };
  }, [billingUserId]);

  // Confirmed inside the modal. A native OS prompt in the middle of this
  // surface is the cheapest-looking moment in the flow.
  const handleDelete = async () => {
    if (deleteTyped !== 'DELETE' || subscriptionBlocksDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    setDeleteSentTo(null);
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'DELETE' });
      if (!res.ok) {
        const failure = await res.json().catch(() => ({}));
        setDeleteBusy(false);
        if (failure.code === 'SUBSCRIPTION_ACTIVE') {
          // The client checks this too, so landing here means the plan changed
          // somewhere else. Re-read rather than guess at the new state.
          if (billingUserId) {
            setBilling(await getBillingSubscriptionAction(billingUserId).catch(() => null));
          }
          setDeleteError(null);
          return;
        }
        setDeleteError('We could not send the link. Please contact support.');
        return;
      }
      const payload = await res.json().catch(() => ({}));
      setDeleteBusy(false);
      setConfirmingDelete(false);
      setDeleteTyped('');
      setDeleteSentTo(typeof payload.email === 'string' ? payload.email : (user?.email ?? null));
    } catch {
      setDeleteBusy(false);
      setDeleteError('We could not send the link. Please contact support.');
    }
  };

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSentTo, setDeleteSentTo] = useState<string | null>(null);

  const displayName = profile?.full_name || user?.name || user?.email || 'Your account';
  const initials = useMemo(() => {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return displayName.slice(0, 2).toUpperCase();
  }, [displayName]);
  const avatarUrl = fileDisplayUrl(profile?.avatar_url);
  // Legacy CV photos (profile-photos bucket, no avatar_url) must stay removable.
  const cvPhoto = useCVStore((s) => s.profilePhoto);

  const timezone = profile?.timezone || detectedTimezone();
  const tzOptions = useMemo(() => timezoneOptions(timezone), [timezone]);
  const today = useMemo(() => new Date(), []);
  const dateFormat = profile?.date_format || 'dmy';

  const providerLabel = provider === 'google'
    ? 'Google'
    : provider === 'credential'
      ? 'Email and password'
      : null;

  // A refused or failed save is long, so it sits under the label instead of widening the row.
  const saveErrorHint = (field: EditableField) => (
    saveError?.field === field ? <span role="alert" className="text-danger">{saveError.message}</span> : undefined
  );

  const editableRow = (field: EditableField, label: string, placeholder: string, emptyLabel?: string) => (
    <Row label={label} hint={saveErrorHint(field)}>
      {editing === field ? (
        <input
          autoFocus
          value={draft}
          placeholder={placeholder}
          maxLength={FIELD_MAX[field]}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(field, e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              cancelledEditRef.current = true;
              setEditing(null);
            }
          }}
          className="h-9 w-[240px] rounded-control border border-border bg-surface-raised px-3 text-right text-sm text-ink-body focus:border-border-focus focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => startEdit(field)}
          title={stored(field) || undefined}
          className="max-w-[260px] truncate text-sm text-ink-body hover:text-brand cursor-pointer"
        >
          {stored(field) || <span className="text-ink-muted">{emptyLabel ?? `Add ${label.toLowerCase()}`}</span>}
        </button>
      )}
      {savedField === field && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
          <Check className="h-3.5 w-3.5" />
          Saved
        </span>
      )}
      {unusable?.field === field && <p role="alert" className="text-xs text-danger">{unusable.message}</p>}
    </Row>
  );

  return (
    <div>
      <PaneHeading>General</PaneHeading>

      <Caption>ACCOUNT</Caption>
      <RowGroup>
        <div className="flex items-center gap-4 px-5 py-4">
          <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-pill bg-brand text-sm font-semibold text-brand-ink">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="truncate">{user?.email}</span>
              <button
                type="button"
                onClick={handleCopyEmail}
                aria-label="Copy email address"
                className="text-ink-muted hover:text-brand cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </span>
          </div>
          <OutlineButton onClick={() => { void handleSignOut(); }}>Sign out</OutlineButton>
        </div>
      </RowGroup>

      <Caption>PROFILE</Caption>
      <RowGroup>
        {editableRow('full_name', 'Name', 'Your name')}
        {editableRow('phone', 'Phone', 'Your phone number')}
        {editableRow('location', 'Location', 'City, country')}
        <Row label="Photo" hint={photoError ?? 'Also used on CV templates that carry a photo'}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handlePhoto(file);
            }}
          />
          {(avatarUrl || cvPhoto) && (
            <LinkButton disabled={photoBusy} onClick={() => { void handleRemovePhoto(); }}>
              Remove
            </LinkButton>
          )}
          <LinkButton disabled={photoBusy} onClick={() => fileInputRef.current?.click()}>
            {photoBusy ? 'Working' : 'Change'}
          </LinkButton>
        </Row>
      </RowGroup>

      <Caption>APPLICATIONS</Caption>
      <RowGroup>
        <Row label="When you can start" hint={saveErrorHint('availability')}>
          <Select
            label="When you can start"
            value={profile?.availability ?? ''}
            options={AVAILABILITY_OPTIONS}
            onChange={(next) => { void changeAvailability(next); }}
          />
          {savedField === 'availability' && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
          {unusable?.field === 'availability' && <p role="alert" className="text-xs text-danger">{unusable.message}</p>}
        </Row>
        {editableRow('availability_note', 'Details', '3 months to the end of the quarter', 'Not set')}
        {editableRow('salary_expectation', 'Salary expectation', '65,000 EUR gross a year', 'Not set')}
      </RowGroup>

      <Caption>SIGN-IN AND SECURITY</Caption>
      <RowGroup>
        <Row label="Password" hint={passwordDone ? 'Password changed.' : undefined}>
          <LinkButton onClick={() => { setShowPassword((v) => !v); setPasswordError(null); }}>
            {showPassword ? 'Cancel' : 'Change'}
          </LinkButton>
        </Row>
        {showPassword && (
          <form
            className="space-y-3 px-5 py-4"
            onSubmit={(e) => { e.preventDefault(); void handleChangePassword(e.currentTarget); }}
          >
            <input
              name="current"
              type="password"
              autoComplete="current-password"
              placeholder="Current password"
              className="h-9 w-full rounded-control border border-border bg-surface-raised px-3 text-sm text-ink-body focus:border-border-focus focus:outline-none"
            />
            <input
              name="next"
              type="password"
              autoComplete="new-password"
              placeholder="New password, at least 8 characters"
              className="h-9 w-full rounded-control border border-border bg-surface-raised px-3 text-sm text-ink-body focus:border-border-focus focus:outline-none"
            />
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat the new password"
              className="h-9 w-full rounded-control border border-border bg-surface-raised px-3 text-sm text-ink-body focus:border-border-focus focus:outline-none"
            />
            {passwordError && <p className="text-xs text-danger">{passwordError}</p>}
            <button
              type="submit"
              disabled={passwordBusy}
              className="inline-flex h-9 items-center rounded-pill border border-border bg-surface px-4 text-sm font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-surface-raised disabled:text-ink-muted cursor-pointer"
            >
              {passwordBusy ? 'Saving' : 'Save password'}
            </button>
          </form>
        )}
        {providerLabel && (
          <Row label="Signed in with">
            <ValueText>{providerLabel} · {user?.email}</ValueText>
          </Row>
        )}
      </RowGroup>

      <Caption>PREFERENCES</Caption>
      <RowGroup>
        <Row label="Timezone">
          <Select
            label="Timezone"
            value={timezone}
            options={tzOptions}
            onChange={(next) => { void updateProfile({ timezone: next }); }}
          />
        </Row>
        <Row label="Date format">
          <Select
            label="Date format"
            value={dateFormat}
            options={DATE_FORMATS.map((f) => ({ value: f.value, label: f.sample(today) }))}
            onChange={(next) => { void updateProfile({ date_format: next }); }}
          />
        </Row>
      </RowGroup>

      <Caption>ACCOUNT DATA</Caption>
      <RowGroup>
        <Row label="Delete account" hint="This wipes your CVs, applications and history for good.">
          {confirmingDelete ? (
            <LinkButton onClick={() => { setConfirmingDelete(false); setDeleteTyped(''); setDeleteError(null); }}>
              Cancel
            </LinkButton>
          ) : (
            <LinkButton onClick={() => setConfirmingDelete(true)}>Delete</LinkButton>
          )}
        </Row>
        {confirmingDelete && subscriptionBlocksDelete && (
          <div className="border-t border-border px-5 py-3">
            <p className="text-xs text-ink-muted">
              Your plan is still billing. Cancel it first, otherwise the card keeps being charged after the account is gone.
            </p>
            <div className="mt-2">
              <LinkButton onClick={() => openSettings('usage')}>Go to Usage and Billing</LinkButton>
            </div>
          </div>
        )}
        {confirmingDelete && !subscriptionBlocksDelete && (
          <div className="flex items-center gap-2 border-t border-border px-5 py-3">
            <input
              value={deleteTyped}
              onChange={(event) => setDeleteTyped(event.target.value)}
              placeholder="Type DELETE"
              aria-label="Type DELETE to confirm"
              autoFocus
              className="h-9 flex-1 rounded-control border border-border bg-surface-raised px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none"
            />
            <button
              type="button"
              disabled={deleteTyped !== 'DELETE' || deleteBusy}
              onClick={() => { void handleDelete(); }}
              className="h-9 rounded-control px-3 text-sm font-semibold text-danger hover:bg-canvas disabled:cursor-not-allowed disabled:text-ink-muted cursor-pointer"
            >
              {deleteBusy ? 'Sending' : 'Send the link'}
            </button>
          </div>
        )}
        {deleteSentTo && (
          <p className="border-t border-border px-5 py-3 text-xs text-ink-muted">
            Check {deleteSentTo}. The link deletes everything and works for 30 minutes. Open it in this browser.
          </p>
        )}
        {deleteError && <p className="px-5 pb-3 text-xs text-danger">{deleteError}</p>}
      </RowGroup>
    </div>
  );
}
