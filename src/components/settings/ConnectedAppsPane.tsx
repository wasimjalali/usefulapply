'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  getAgentCreditLimitAction,
  listConnectedAppsAction,
  revokeConnectedAppAction,
  setAgentCreditLimitAction,
} from '@/db/actions';
import { SCOPE_LABELS, type McpScope } from '@/lib/mcp/scopes';
import {
  Caption,
  LinkButton,
  OutlineButton,
  PaneHeading,
  Row,
  RowGroup,
  ValueText,
} from '@/components/settings/parts';

interface ConnectedApp {
  clientId: string;
  name: string;
  scopes: string[];
  connectedAt: number | null;
  lastUsedAt: number | null;
}

const MAX_LIMIT = 1000;

function scopeSummary(scopes: string[]): string {
  const labels = scopes
    .filter((s): s is McpScope => s in SCOPE_LABELS)
    .map((s) => SCOPE_LABELS[s].title);
  return labels.length > 0 ? labels.join(', ') : 'No access';
}

function lastUsed(ms: number | null): string {
  if (ms === null) return 'Not used yet';
  return `Last used ${new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function ConnectedAppsPane() {
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const [limit, setLimit] = useState<string>('10');
  const [savedLimit, setSavedLimit] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, current] = await Promise.all([listConnectedAppsAction(), getAgentCreditLimitAction()]);
      setApps(list);
      setLimit(String(current));
      setSavedLimit(current);
    } catch {
      setError("We couldn't load your connected apps. Try again in a moment.");
      setApps([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRevoke = async (clientId: string) => {
    setBusy(clientId);
    setError(null);
    try {
      await revokeConnectedAppAction(clientId);
      setConfirming(null);
      await load();
    } catch {
      setError("We couldn't revoke that app. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const parsedLimit = Number(limit);
  const limitValid =
    limit.trim() !== ''
    && Number.isFinite(parsedLimit)
    && parsedLimit >= 0
    && parsedLimit <= MAX_LIMIT
    && Number.isInteger(parsedLimit * 2);

  const handleSaveLimit = async () => {
    if (!limitValid) return;
    setBusy('limit');
    setLimitMessage(null);
    setError(null);
    try {
      await setAgentCreditLimitAction(parsedLimit);
      setSavedLimit(parsedLimit);
      setLimitMessage('Saved.');
    } catch {
      setError("We couldn't save that limit. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PaneHeading>Connected apps</PaneHeading>

      <Caption>APPS WITH ACCESS</Caption>
      {apps === null ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-warm-gray" aria-label="Loading" />
        </div>
      ) : apps.length === 0 ? (
        <RowGroup>
          <Row label={<ValueText>No apps connected.</ValueText>} />
        </RowGroup>
      ) : (
        <RowGroup>
          {apps.map((app) => (
            <Row
              key={app.clientId}
              label={app.name}
              hint={`${scopeSummary(app.scopes)} · ${lastUsed(app.lastUsedAt)}`}
            >
              {confirming === app.clientId ? (
                <>
                  <LinkButton onClick={() => setConfirming(null)} disabled={busy === app.clientId}>
                    Cancel
                  </LinkButton>
                  <OutlineButton onClick={() => void handleRevoke(app.clientId)} disabled={busy === app.clientId}>
                    {busy === app.clientId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm revoke'}
                  </OutlineButton>
                </>
              ) : (
                <OutlineButton onClick={() => setConfirming(app.clientId)}>Revoke</OutlineButton>
              )}
            </Row>
          ))}
        </RowGroup>
      )}

      <Caption>SPENDING</Caption>
      <RowGroup>
        <Row label="Daily agent credit limit">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={MAX_LIMIT}
            step={0.5}
            aria-label="Daily agent credit limit"
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
              setLimitMessage(null);
            }}
            className="h-9 w-24 rounded-lg border border-cream-200 bg-cream-50 px-3 text-right text-sm text-charcoal shadow-sm focus:border-navy-500 focus:outline-none"
          />
          <OutlineButton
            onClick={() => void handleSaveLimit()}
            disabled={!limitValid || busy === 'limit' || parsedLimit === savedLimit}
          >
            {busy === 'limit' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </OutlineButton>
        </Row>
      </RowGroup>
      {limitMessage && <p className="mt-2 text-xs text-warm-gray">{limitMessage}</p>}
      {!limitValid && <p className="mt-2 text-xs text-red-600">Enter 0 to {MAX_LIMIT}, in steps of 0.5.</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
