'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Caption, LinkButton, PaneHeading, Row, RowGroup, Toggle, ValueText } from '@/components/settings/parts';
import { useSettingsStore } from '@/store/useSettingsStore';

// `notify_feed_ready` is deliberately absent. The feed runs in real time on a
// click and the user watches it finish, so there is no moment to mail. The
// column stays in the DB, unused, rather than advertising an email that cannot
// exist.
const TOGGLES = [
  { field: 'notify_follow_up_due', label: 'A follow-up or offer deadline is due', fallback: true },
  { field: 'notify_interview_tomorrow', label: 'An interview is tomorrow', fallback: true },
  { field: 'notify_credits_low', label: 'Credits are about to run out', fallback: true },
  { field: 'notify_marketing', label: 'Product news, once a month at most', fallback: false },
] as const;

type ToggleField = (typeof TOGGLES)[number]['field'];

export function NotificationsPane() {
  const { user, profile, updateProfile } = useAuth();
  const open = useSettingsStore((state) => state.open);
  const [error, setError] = useState<string | null>(null);

  // The columns land with the tracker migration. Until it runs, a missing
  // field reads as its default rather than crashing the pane.
  const row = (profile ?? {}) as unknown as Record<string, unknown>;
  const valueOf = (field: ToggleField, fallback: boolean) =>
    typeof row[field] === 'boolean' ? (row[field] as boolean) : fallback;

  const handleChange = async (field: ToggleField, next: boolean) => {
    setError(null);
    const { error: saveError } = await updateProfile({ [field]: next } as never);
    if (saveError) setError('We could not save that. Try again.');
  };

  return (
    <div>
      <PaneHeading>Notifications</PaneHeading>

      <Caption>EMAIL ME WHEN</Caption>
      <RowGroup>
        {TOGGLES.map((toggle) => (
          <Row key={toggle.field} label={toggle.label}>
            <Toggle
              label={toggle.label}
              checked={valueOf(toggle.field, toggle.fallback)}
              onChange={(next) => { void handleChange(toggle.field, next); }}
            />
          </Row>
        ))}
      </RowGroup>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <Caption>SEND TO</Caption>
      <RowGroup>
        <Row label={<ValueText>{user?.email ?? 'Your email'}</ValueText>}>
          <LinkButton onClick={() => open('general')}>Change in General</LinkButton>
        </Row>
      </RowGroup>
    </div>
  );
}
