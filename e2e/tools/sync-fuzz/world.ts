/**
 * The fake world the sync tests run in: a seeded random source, a manual
 * clock, a server with revisions and per-field values, and a request
 * scheduler that decides, step by step, when each request reaches the server
 * and when its answer gets back (or never does).
 */

import { mapSessionRowToStore, type StoredSessionRow } from '@/lib/session-row-mapping';
import { columnFingerprints, type SaveResult } from '@/lib/session-sync-engine';

// ---------------------------------------------------------------------------
// Randomness and time
// ---------------------------------------------------------------------------

export type Rng = () => number;

/** mulberry32: small, seedable, good enough to shuffle interleavings. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class FakeClock {
  t = 0;
  private next = 1;
  private timers = new Map<number, { at: number; fn: () => void }>();

  now(): number { return this.t; }

  setTimeout(fn: () => void, ms: number): number {
    const id = this.next++;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  }

  clearTimeout(handle: unknown): void { this.timers.delete(handle as number); }

  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      let pick = -1;
      let pickAt = Infinity;
      for (const [id, timer] of this.timers) {
        if (timer.at <= end && timer.at < pickAt) { pick = id; pickAt = timer.at; }
      }
      if (pick < 0) break;
      const timer = this.timers.get(pick)!;
      this.timers.delete(pick);
      this.t = Math.max(this.t, timer.at);
      timer.fn();
    }
    this.t = end;
  }
}

// ---------------------------------------------------------------------------
// Fields: what a user (or the server) can change
// ---------------------------------------------------------------------------

/** The names are the engine's field-group keys. */
export const FIELDS = ['jobTitle', 'company', 'jobDescription', 'selectedTemplate', 'coverLetter', 'email', 'followUpEmail'] as const;
export type Field = (typeof FIELDS)[number];

/** Fields that have an editor outside the store. */
export const EDITOR_FIELDS: Field[] = ['coverLetter', 'email', 'followUpEmail'];

export const tokenOf = (id: string, n: number) => `t:${id}${n};`;

export function letterObject(body: string): Record<string, unknown> {
  return {
    applicantAddress: { name: '', street: '', city: '', country: '', phone: '', email: '' },
    date: '',
    companyAddress: { companyName: '', street: '' },
    salutation: '',
    closing: '',
    signatureName: '',
    body,
    updatedAt: 'x',
  };
}

/** The server columns a write of `field` with this token sets. */
export function serverColumns(field: Field, token: string): Record<string, unknown> {
  switch (field) {
    case 'jobTitle': return { job_title: token };
    case 'company': return { company: token };
    case 'jobDescription': return { job_description: token };
    case 'selectedTemplate': return { selected_template: `tpl-${token}` };
    case 'coverLetter': return { cover_letter: letterObject(token) };
    case 'email': return { email: { subject: `s-${token}`, body: token, attachmentNote: '' } };
    case 'followUpEmail': return { follow_up_email: { subject: `f-${token}`, body: token, recommendedDelay: 5 } };
  }
}

// ---------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------

interface ServerApp {
  id: string;
  revision: number;
  cols: Record<string, unknown>;
}

export interface AcceptedWrite {
  app: string;
  revision: number;
  by: string;
  json: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class FakeServer {
  apps = new Map<string, ServerApp>();
  history = new Map<string, Map<number, StoredSessionRow>>();
  accepted: AcceptedWrite[] = [];
  /** Called for each accepted browser write with the server's current fingerprint of every column it overwrites. */
  onAccept?: (by: string, app: string, overwritten: Record<string, string>) => void;
  private counter = 0;
  private truthCache = new Map<string, Record<string, string>>();

  create(by: string): string {
    const id = `app-${++this.counter}`;
    const cols: Record<string, unknown> = {
      job_title: `Title ${id}`,
      company: `Company ${id}`,
      job_description: `Seed description ${id}`,
      selected_template: 'classic',
      cover_letter: letterObject(`seed letter ${id}`),
      email: { subject: `seed subject ${id}`, body: `seed email ${id}`, attachmentNote: '' },
      follow_up_email: { subject: `seed follow-up ${id}`, body: `seed follow-up body ${id}`, recommendedDelay: 5 },
    };
    this.apps.set(id, { id, revision: 0, cols });
    this.snapshot(id);
    this.accepted.push({ app: id, revision: 0, by, json: '{}' });
    return id;
  }

  private snapshot(id: string): void {
    const app = this.apps.get(id)!;
    const row: StoredSessionRow = {
      id,
      revision: app.revision,
      job_title: app.cols.job_title as string,
      company: app.cols.company as string,
      job_description: app.cols.job_description as string,
      selected_template: app.cols.selected_template as string,
      cover_letter: clone(app.cols.cover_letter),
      email: clone(app.cols.email),
      follow_up_email: clone(app.cols.follow_up_email),
      status: 'drafted',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: `2026-01-01T00:00:${String(app.revision % 60).padStart(2, '0')}.000Z`,
    };
    if (!this.history.has(id)) this.history.set(id, new Map());
    this.history.get(id)!.set(app.revision, row);
  }

  revisionOf(id: string): number | null { return this.apps.get(id)?.revision ?? null; }

  rowOf(id: string): StoredSessionRow | null {
    const app = this.apps.get(id);
    return app ? clone(this.history.get(id)!.get(app.revision)!) : null;
  }

  /** A write that is not revision-conditional: the agent, a regenerate route. */
  write(id: string, columns: Record<string, unknown>, by: string): number {
    const app = this.apps.get(id)!;
    app.revision += 1;
    for (const [column, value] of Object.entries(columns)) app.cols[column] = clone(value);
    this.snapshot(id);
    this.accepted.push({ app: id, revision: app.revision, by, json: JSON.stringify(columns) });
    return app.revision;
  }

  /** The browser's write: validated, then conditional on the revision. */
  save(id: string, expected: number, patch: Record<string, unknown>, by: string): SaveResult {
    const app = this.apps.get(id);
    if (!app) return { ok: false, reason: 'not_found' };
    if (typeof patch.job_description === 'string' && patch.job_description.includes('BAD-')) {
      return { ok: false, reason: 'invalid', message: 'job description not accepted', field: 'job_description' };
    }
    if (expected !== app.revision) return { ok: false, reason: 'conflict', currentRevision: app.revision };
    const current = this.truth(id, app.revision) ?? {};
    const overwritten: Record<string, string> = {};
    for (const column of Object.keys(patch)) if (column in current) overwritten[column] = current[column];
    this.onAccept?.(by, id, overwritten);
    return { ok: true, revision: this.write(id, patch, by) };
  }

  acceptedHas(id: string, token: string): boolean {
    return this.accepted.some((write) => write.app === id && write.json.includes(token));
  }

  /** Fingerprints of the application as the store would see the row at a revision. */
  truth(id: string, revision: number): Record<string, string> | null {
    const key = `${id}@${revision}`;
    const cached = this.truthCache.get(key);
    if (cached) return cached;
    const row = this.history.get(id)?.get(revision);
    if (!row) return null;
    const fp = columnFingerprints(mapSessionRowToStore(clone(row)));
    this.truthCache.set(key, fp);
    return fp;
  }
}

// ---------------------------------------------------------------------------
// Requests: when they reach the server and when the answer gets back
// ---------------------------------------------------------------------------

export type RequestKind = 'getRow' | 'getRevision' | 'save' | 'mutate' | 'create';

export interface PendingRequest {
  id: number;
  client: string;
  kind: RequestKind;
  phase: 'sent' | 'arrived';
  /** `drop`: the request never reaches the server. */
  arrive: 'ok' | 'drop';
  /** `fail`: an error comes back. `hang`: nothing ever comes back (the caller's timeout fires). */
  deliver: 'ok' | 'fail' | 'hang';
  run: () => unknown;
  result?: unknown;
  error?: unknown;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export class RequestScheduler {
  pending: PendingRequest[] = [];
  private nextId = 1;
  /** Everything runs to completion at once. */
  reliable = true;
  /** Random failures and delays apply when this is set. */
  chaos = false;
  /** A request that is never answered. The legacy module has no timeout, so it would wait forever. */
  allowHang = true;
  stats = { requests: 0, dropped: 0, lostAnswers: 0, hung: 0 };

  constructor(private rng: Rng) {}

  request<T>(client: string, kind: RequestKind, run: () => T): Promise<T> {
    this.stats.requests += 1;
    if (this.reliable) return Promise.resolve().then(run);
    return new Promise<T>((resolve, reject) => {
      let arrive: PendingRequest['arrive'] = 'ok';
      let deliver: PendingRequest['deliver'] = 'ok';
      if (this.chaos) {
        const r = this.rng();
        if (r < 0.06) { arrive = 'drop'; deliver = 'fail'; }
        else if (r < 0.12) { deliver = 'fail'; }
        else if (r < 0.18) { deliver = 'hang'; }
        else if (r < 0.2) { arrive = 'drop'; deliver = 'hang'; }
      }
      if (deliver === 'hang' && !this.allowHang) deliver = 'fail';
      this.pending.push({
        id: this.nextId++, client, kind, phase: 'sent', arrive, deliver, run,
        resolve: resolve as (value: unknown) => void, reject,
      });
    });
  }

  /** Move one request forward one phase: reach the server, then deliver the answer. */
  advance(req: PendingRequest): void {
    if (req.phase === 'sent') {
      if (req.arrive === 'ok') {
        try { req.result = req.run(); } catch (error) { req.error = error; }
      } else {
        this.stats.dropped += 1;
      }
      req.phase = 'arrived';
      if (req.deliver === 'hang') {
        this.stats.hung += 1;
        this.pending = this.pending.filter((candidate) => candidate !== req);
      }
      return;
    }
    this.pending = this.pending.filter((candidate) => candidate !== req);
    if (req.arrive === 'drop' || req.deliver === 'fail') {
      if (req.arrive === 'ok') this.stats.lostAnswers += 1;
      req.reject(new Error('network error'));
    } else if (req.error) {
      req.reject(req.error);
    } else {
      req.resolve(req.result);
    }
  }

  /** Both phases at once, for a request a case script wants to run now. */
  complete(req: PendingRequest): void {
    while (this.pending.includes(req)) this.advance(req);
  }

  find(client: string, kind: RequestKind): PendingRequest | undefined {
    return this.pending.find((req) => req.client === client && req.kind === kind);
  }

  randomPending(): PendingRequest | undefined {
    if (this.pending.length === 0) return undefined;
    return this.pending[Math.floor(this.rng() * this.pending.length)];
  }
}

export const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Let every promise chain that can make progress without a request being answered do so. */
export async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await tick();
}
