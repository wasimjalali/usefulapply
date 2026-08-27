'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { detectTimezone } from '@/lib/utils/format-date';
import { authClient } from '@/auth/client';
import { changePassword } from '@/lib/supabase';
import { uploadAvatar, deleteAvatar, deleteProfilePhoto } from '@/lib/supabase/storage';
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

type EditableField = 'full_name' | 'phone' | 'location';

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
    setDraft(stored(field));
    setEditing(field);
  }, [stored]);

  const commit = useCallback(async (field: EditableField) => {
    setEditing(null);
    if (cancelledEditRef.current) {
      cancelledEditRef.current = false;
      return;
    }
    const next = draft.trim();
    if (next === stored(field)) return;
    const { error } = await updateProfile({ [field]: next || null } as never);
    if (error) return;
    flashSaved(field);
  }, [draft, stored, updateProfile, flashSaved]);

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
    if (!file.type.startsWith('image/')) {
      setPhotoError('That file is not an image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Keep the photo under 5MB.');
      return;
    }
    setPhotoBusy(true);
    const { key, error } = await uploadAvatar(user.id, file);
    if (error || !key) {
      setPhotoBusy(false);
      setPhotoError('The upload failed. Try again.');
      return;
    }
    const { error: saveError } = await updateProfile({ avatar_url: key });
    setPhotoBusy(false);
    if (saveError) {
      setPhotoError('We could not save the photo. Try again.');
      return;
    }
    const { error: cleanupError } = await deleteAvatar(user.id, key);
    if (cleanupError) console.error('[settings] failed to remove old avatar:', cleanupError);
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
  };

  const handleRemovePhoto = async () => {
    if (!user) return;
    setPhotoError(null);
    setPhotoBusy(true);
    const { error: saveError } = await updateProfile({ avatar_url: null });
    if (saveError) {
      setPhotoBusy(false);
      setPhotoError('We could not remove the photo. Try again.');
      return;
    }
    const { error: avatarError } = await deleteAvatar(user.id);
    if (avatarError) console.error('[settings] failed to delete avatar objects:', avatarError);
    const { error: legacyError } = await deleteProfilePhoto(user.id);
    if (legacyError) console.error('[settings] failed to delete legacy CV photo:', legacyError);
    useCVStore.getState().setProfilePhoto(null);
    setPhotoBusy(false);
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

  const timezone = profile?.timezone || detectedTimezone();
  const tzOptions = useMemo(() => timezoneOptions(timezone), [timezone]);
  const today = useMemo(() => new Date(), []);
  const dateFormat = profile?.date_format || 'dmy';

  const providerLabel = provider === 'google'
    ? 'Google'
    : provider === 'credential'
      ? 'Email and password'
      : null;

  const editableRow = (field: EditableField, label: string, placeholder: string) => (
    <Row label={label}>
      {editing === field ? (
        <input
          autoFocus
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(field)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              cancelledEditRef.current = true;
              setEditing(null);
            }
          }}
          className="h-9 w-[240px] rounded-lg border border-cream-200 bg-white px-3 text-right text-sm text-charcoal focus:border-navy-500 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => startEdit(field)}
          className="text-sm text-charcoal hover:text-navy-600 cursor-pointer"
        >
          {stored(field) || <span className="text-warm-gray">Add {label.toLowerCase()}</span>}
        </button>
      )}
      {savedField === field && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-sage-600">
          <Check className="h-3.5 w-3.5" />
          Saved
        </span>
      )}
    </Row>
  );

  return (
    <div>
      <PaneHeading>General</PaneHeading>

      <Caption>ACCOUNT</Caption>
      <RowGroup>
        <div className="flex items-center gap-4 px-5 py-4">
          <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy-600 text-sm font-semibold text-white">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-navy-800">{displayName}</p>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-warm-gray">
              <span className="truncate">{user?.email}</span>
              <button
                type="button"
                onClick={handleCopyEmail}
                aria-label="Copy email address"
                className="text-warm-gray hover:text-navy-600 cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-sage-600" /> : <Copy className="h-3.5 w-3.5" />}
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
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handlePhoto(file);
            }}
          />
          {avatarUrl && (
            <LinkButton disabled={photoBusy} onClick={() => { void handleRemovePhoto(); }}>
              Remove
            </LinkButton>
          )}
          <LinkButton disabled={photoBusy} onClick={() => fileInputRef.current?.click()}>
            {photoBusy ? 'Working' : 'Change'}
          </LinkButton>
        </Row>
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
              className="h-9 w-full rounded-lg border border-cream-200 bg-white px-3 text-sm text-charcoal focus:border-navy-500 focus:outline-none"
            />
            <input
              name="next"
              type="password"
              autoComplete="new-password"
              placeholder="New password, at least 8 characters"
              className="h-9 w-full rounded-lg border border-cream-200 bg-white px-3 text-sm text-charcoal focus:border-navy-500 focus:outline-none"
            />
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat the new password"
              className="h-9 w-full rounded-lg border border-cream-200 bg-white px-3 text-sm text-charcoal focus:border-navy-500 focus:outline-none"
            />
            {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
            <button
              type="submit"
              disabled={passwordBusy}
              className="inline-flex h-9 items-center rounded-full border border-cream-200 bg-cream-50 px-4 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white disabled:text-warm-gray cursor-pointer"
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
            onChange={(next) => { void updateProfile({ timezone: next } as never); }}
          />
        </Row>
        <Row label="Date format">
          <Select
            label="Date format"
            value={dateFormat}
            options={DATE_FORMATS.map((f) => ({ value: f.value, label: f.sample(today) }))}
            onChange={(next) => { void updateProfile({ date_format: next } as never); }}
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
          <div className="border-t border-cream-200 px-5 py-3">
            <p className="text-xs text-warm-gray">
              Your plan is still billing. Cancel it first, otherwise the card keeps being charged after the account is gone.
            </p>
            <div className="mt-2">
              <LinkButton onClick={() => openSettings('usage')}>Go to Usage and Billing</LinkButton>
            </div>
          </div>
        )}
        {confirmingDelete && !subscriptionBlocksDelete && (
          <div className="flex items-center gap-2 border-t border-cream-200 px-5 py-3">
            <input
              value={deleteTyped}
              onChange={(event) => setDeleteTyped(event.target.value)}
              placeholder="Type DELETE"
              aria-label="Type DELETE to confirm"
              autoFocus
              className="h-9 flex-1 rounded-lg border border-cream-200 bg-white px-3 text-sm text-navy-800 placeholder:text-warm-gray focus:outline-none"
            />
            <button
              type="button"
              disabled={deleteTyped !== 'DELETE' || deleteBusy}
              onClick={() => { void handleDelete(); }}
              className="h-9 rounded-lg px-3 text-sm font-semibold text-red-600 hover:bg-cream-100 disabled:cursor-not-allowed disabled:text-warm-gray cursor-pointer"
            >
              {deleteBusy ? 'Sending' : 'Send the link'}
            </button>
          </div>
        )}
        {deleteSentTo && (
          <p className="border-t border-cream-200 px-5 py-3 text-xs text-warm-gray">
            Check {deleteSentTo}. The link deletes everything and works for 30 minutes. Open it in this browser.
          </p>
        )}
        {deleteError && <p className="px-5 pb-3 text-xs text-red-600">{deleteError}</p>}
      </RowGroup>
    </div>
  );
}
