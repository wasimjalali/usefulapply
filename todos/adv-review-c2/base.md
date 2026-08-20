# Adversarial review brief (cycle 2)

Project: Useful Apply. Next.js 16, Better Auth, D1/Drizzle.
Repo: /Users/wasimjalali/Desktop/Karko_AI
**Tier: T3. Model: grok-4.5.** Cycle 2 after fixing three Highs from cycle 1.

## Intent
Consent-gated free job-feed provisioning, GDPR withdraw endpoint, signup resend email enumeration hardening, and debug-run secret gate.

## Cycle 1 Highs and the fixes to verify:
1. Free path threw unmapped 500 when consented + enabled=false. Now ensureFreeFeedConsent re-enables on explicit consentAccepted instead of throwing paused.
2. getOrProvisionFreeJobFeedSettingsAdmin returned a raced/withdrawn row without re-checking. Now existing and raced rows go through ensureFreeFeedConsent.
3. isUnknownVerificationTarget matched 404 and free-text "user not found". Now only body.code === 'USER_NOT_FOUND' or status === 'NOT_FOUND' (the string code, not HTTP 404).

Also: grantConsent patches only consent_accepted_at + enabled. Withdraw response is { withdrawn: true } only.

Hunt for remaining Critical/High. Do not re-raise the three above unless the fix is incomplete. Quote the line that disproves a stale High.

## Static scan
- No hardcoded secrets / eval / innerHTML / service_role / live keys in added lines.
- Note: debug route now gates on process.env.JOB_FEED_DEBUG_SECRET via timingSafeEqual (env-backed, not hardcoded).
- .dev.vars.example was touched (template only; do not invent secrets from it).
- Better Auth session cookies default sameSite: "lax" (node_modules/better-auth/dist/cookies/index.mjs:35).

## Files in scope
- src/app/api/auth/signup/route.ts
- src/app/api/job-feed/run/route.ts
- src/app/api/job-feed/dev/run/route.ts
- src/app/api/job-feed/consent/withdraw/route.ts (new)
- src/db/repos/jobFeed.ts (grantConsent, withdrawConsent)
- src/lib/job-feed/server.ts (ensureFreeFeedConsent, provision + workflow)
- src/lib/job-feed/auth.ts (requireJobFeedView)
- src/components/job-feed/feed-actions.ts
- src/components/job-feed/FeedConversation.tsx
Also read related changed callers if needed: helpers.ts, constants.ts, career-profile/route.ts, search-strategy/route.ts.

## Checklist focus
- Authn before privileged work; userId from session only
- Consent not invented; explicit assertion required
- Mass assignment: grantConsent only two columns
- Withdraw response must not leak settings row
- Error mapping: tagged errors must not fall through as opaque 500
- Enumeration: signup resend must not reveal account existence via status alone
- Race: provision insert conflict must re-check consent
- CSRF / cookie session on state-changing POST
- Fail loud; no swallowed security errors
- Better Auth cookie session: same-origin fetch with credentials; no CSRF token library assumed. Flag only if state-changing endpoint is callable cross-site without SameSite protection evidence.

## Required output format
## Adversarial review - Useful Apply group 2 cycle 2
**Tier:** T3
**Model:** grok-4.5
**Safe to ship?** YES | NO
### Critical
### High
### Low
### Checked - OK
### Merge blockers (if NO)

Severity:
- Critical: auth bypass, RCE, secret leak, account takeover, payment fraud, data wipe
- High: privilege gain, IDOR, wrong-user session, broken recovery, CSRF on state change, serious logic bug, incomplete fix of a prior High
- Low: defence in depth, soft rate limits, error style, non-exploitable smells

Read the live files under the repo if a line number is needed. The scoped diff follows.

diff --git a/.dev.vars.example b/.dev.vars.example
index 2da6ff5b..4f19b2b8 100644
--- a/.dev.vars.example
+++ b/.dev.vars.example
@@ -8,7 +8,6 @@ NEXT_PUBLIC_APP_URL
 NEXT_PUBLIC_SUPABASE_URL
 NEXT_PUBLIC_SUPABASE_ANON_KEY
 NEXT_PUBLIC_POSTHOG_KEY
-NEXT_PUBLIC_ENABLE_JOB_FEED_DEBUG
 
 # Supabase
 SUPABASE_SERVICE_ROLE_KEY
@@ -49,6 +48,9 @@ AZURE_OPENAI_DEPLOYMENT
 # Cron
 CRON_SECRET
 
+# Job feed debug run. Server-only. Header: x-job-feed-debug-secret
+JOB_FEED_DEBUG_SECRET
+
 # PostHog (build-time)
 POSTHOG_PERSONAL_API_KEY
 POSTHOG_PROJECT_ID
diff --git a/src/app/api/auth/signup/route.ts b/src/app/api/auth/signup/route.ts
index fe7db89f..ab2eacd2 100644
--- a/src/app/api/auth/signup/route.ts
+++ b/src/app/api/auth/signup/route.ts
@@ -48,6 +48,15 @@ export async function POST(request: NextRequest) {
         });
       } catch (error) {
         console.error('[/api/auth/signup] sendVerificationEmail error:', error);
+        // Unknown address stays 200 so this endpoint cannot be used to test
+        // whether an account exists. A real send failure is the only 500.
+        if (isUnknownVerificationTarget(error)) {
+          return NextResponse.json({ success: true });
+        }
+        return NextResponse.json(
+          { error: "We couldn't send that email. Try again in a moment." },
+          { status: 500 },
+        );
       }
       return NextResponse.json({ success: true });
     }
@@ -78,3 +87,15 @@ export async function POST(request: NextRequest) {
     );
   }
 }
+
+function isUnknownVerificationTarget(error: unknown): boolean {
+  if (!error || typeof error !== 'object') return false;
+  const record = error as {
+    status?: string | number;
+    statusCode?: number;
+    body?: { code?: string };
+  };
+  if (record.body?.code === 'USER_NOT_FOUND') return true;
+  const status = record.statusCode ?? record.status;
+  return status === 'NOT_FOUND';
+}
diff --git a/src/app/api/job-feed/career-profile/route.ts b/src/app/api/job-feed/career-profile/route.ts
index 539010a8..1c8ce733 100644
--- a/src/app/api/job-feed/career-profile/route.ts
+++ b/src/app/api/job-feed/career-profile/route.ts
@@ -1,7 +1,7 @@
 import { NextRequest, NextResponse } from 'next/server';
 import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
 import { getCurrentUser } from '@/auth/server';
-import { requireJobFeedAccess } from '@/lib/job-feed/auth';
+import { requireJobFeedAccess, requireJobFeedView } from '@/lib/job-feed/auth';
 import {
   CAREER_PROFILE_SCHEMA_VERSION,
   isCurrentCareerProfile,
@@ -32,7 +32,7 @@ export async function GET(request: NextRequest) {
       return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
     }
 
-    const auth = await authenticatePaidUser(request);
+    const auth = await authenticateFeedViewer(request);
     if (!auth.ok) return auth.response;
     const { userId } = auth;
 
@@ -201,6 +201,20 @@ export async function POST(request: NextRequest) {
 type AuthSuccess = { ok: true; userId: string };
 type AuthFailure = { ok: false; response: NextResponse };
 
+async function authenticateFeedViewer(request: NextRequest): Promise<AuthSuccess | AuthFailure> {
+  const user = await getCurrentUser(request);
+  if (!user) {
+    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
+  }
+
+  const access = await requireJobFeedView(user);
+  if (!access.ok) {
+    return { ok: false, response: NextResponse.json({ error: access.error }, { status: access.status }) };
+  }
+
+  return { ok: true, userId: user.id };
+}
+
 async function authenticatePaidUser(request: NextRequest): Promise<AuthSuccess | AuthFailure> {
   const user = await getCurrentUser(request);
   if (!user) {
diff --git a/src/app/api/job-feed/dev/run/route.ts b/src/app/api/job-feed/dev/run/route.ts
index a3e52c99..7474496d 100644
--- a/src/app/api/job-feed/dev/run/route.ts
+++ b/src/app/api/job-feed/dev/run/route.ts
@@ -1,5 +1,5 @@
 import { NextRequest, NextResponse } from 'next/server';
-import { isJobFeedDebugModeEnabled } from '@/lib/job-feed/constants';
+import { timingSafeEqual } from 'crypto';
 import { canAccessJobFeed } from '@/lib/job-feed/helpers';
 import { runJobFeedFoundationWorkflow } from '@/lib/job-feed/server';
 import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
@@ -9,8 +9,19 @@ import { getProfile } from '@/db/repos/profiles';
 export const runtime = 'nodejs';
 export const maxDuration = 120;
 
+const DEBUG_SECRET_HEADER = 'x-job-feed-debug-secret';
+
+function isJobFeedDebugSecretValid(presented: string | null): boolean {
+  const secret = process.env.JOB_FEED_DEBUG_SECRET;
+  if (!secret || !presented) return false;
+  const expected = Buffer.from(secret);
+  const actual = Buffer.from(presented);
+  if (actual.length !== expected.length) return false;
+  return timingSafeEqual(actual, expected);
+}
+
 export async function POST(request: NextRequest) {
-  if (!isJobFeedDebugModeEnabled()) {
+  if (!isJobFeedDebugSecretValid(request.headers.get(DEBUG_SECRET_HEADER))) {
     return NextResponse.json({ error: 'Not found.' }, { status: 404 });
   }
 
diff --git a/src/app/api/job-feed/run/route.ts b/src/app/api/job-feed/run/route.ts
index e53b7bb6..7a7a1dea 100644
--- a/src/app/api/job-feed/run/route.ts
+++ b/src/app/api/job-feed/run/route.ts
@@ -37,6 +37,14 @@ export async function POST(request: NextRequest) {
       return NextResponse.json({ error: 'Job Feed is not available for this account.' }, { status: 403 });
     }
 
+    let consentAccepted = false;
+    try {
+      const body = await request.json() as { consent_accepted?: unknown };
+      consentAccepted = body?.consent_accepted === true;
+    } catch {
+      // Empty or non-JSON body is a missing assertion, not a parse bug.
+    }
+
     const userTimeZone = await getUserTimeZone(user.id);
     const now = new Date();
     const todayKey = getLocalDateKey(now, userTimeZone);
@@ -82,6 +90,7 @@ export async function POST(request: NextRequest) {
       triggerSource: 'manual_user',
       now,
       orchestrator: 'direct',
+      consentAccepted,
     });
 
     const diagnostics = getJobFeedRunDiagnostics(result.run);
@@ -114,6 +123,11 @@ export async function POST(request: NextRequest) {
       errorMessage: result.run.error_message,
     });
   } catch (error) {
+    if (error instanceof Error && error.message === 'JOB_FEED_CONSENT_REQUIRED') {
+      return NextResponse.json({
+        error: 'Please confirm I can search public job boards for you.',
+      }, { status: 400 });
+    }
     if (error instanceof Error && error.message === 'JOB_FEED_INSUFFICIENT_CV') {
       return NextResponse.json({
         error: "We couldn't find enough roles or experience in your CV to build your feed. Add your recent roles or key skills to your CV, then try again.",
diff --git a/src/app/api/job-feed/search-strategy/route.ts b/src/app/api/job-feed/search-strategy/route.ts
index f715717d..acc6aeef 100644
--- a/src/app/api/job-feed/search-strategy/route.ts
+++ b/src/app/api/job-feed/search-strategy/route.ts
@@ -2,6 +2,7 @@ import { NextRequest, NextResponse } from 'next/server';
 import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
 import { getCurrentUser } from '@/auth/server';
 import { canAccessJobFeed } from '@/lib/job-feed/helpers';
+import { requireJobFeedView } from '@/lib/job-feed/auth';
 import {
   computeSettingsHash,
   isCurrentSearchStrategy,
@@ -42,7 +43,7 @@ export async function GET(request: NextRequest) {
       return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
     }
 
-    const auth = await authenticatePaidUser(request);
+    const auth = await authenticateFeedViewer(request);
     if (!auth.ok) return auth.response;
     const { userId } = auth;
 
@@ -173,6 +174,20 @@ export async function POST(request: NextRequest) {
 type AuthSuccess = { ok: true; userId: string };
 type AuthFailure = { ok: false; response: NextResponse };
 
+async function authenticateFeedViewer(request: NextRequest): Promise<AuthSuccess | AuthFailure> {
+  const user = await getCurrentUser(request);
+  if (!user) {
+    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
+  }
+
+  const access = await requireJobFeedView(user);
+  if (!access.ok) {
+    return { ok: false, response: NextResponse.json({ error: access.error }, { status: access.status }) };
+  }
+
+  return { ok: true, userId: user.id };
+}
+
 async function authenticatePaidUser(request: NextRequest): Promise<AuthSuccess | AuthFailure> {
   const user = await getCurrentUser(request);
   if (!user) {
diff --git a/src/components/job-feed/FeedConversation.tsx b/src/components/job-feed/FeedConversation.tsx
index ac1448f7..c870c324 100644
--- a/src/components/job-feed/FeedConversation.tsx
+++ b/src/components/job-feed/FeedConversation.tsx
@@ -34,6 +34,7 @@ import {
   loadSearchStrategy,
   runFeed,
   saveFeedSettings,
+  withdrawFeedConsent,
 } from './feed-actions';
 import { countryLabel, escapeMarkdown, formatFeedDay, plural } from './feed-format';
 import {
@@ -484,6 +485,38 @@ export function FeedConversation() {
       case 'build-today':
         await triggerRun(false);
         return;
+      case 'withdraw-consent':
+        store.markChipUsed(selectFeedThreadKey(store), chip.id);
+        say({ role: 'user', content: 'Stop searching for me' });
+        say({
+          role: 'assistant',
+          content: "I'll stop searching public job boards and clear that you said yes. You can say yes again later if you want the feed back.",
+          chips: [
+            { id: 'withdraw-consent-yes', label: 'Yes, stop', variant: 'primary' },
+            { id: 'withdraw-consent-keep', label: 'Keep searching', variant: 'secondary' },
+          ],
+        });
+        return;
+      case 'withdraw-consent-keep':
+        store.markChipUsed(selectFeedThreadKey(store), chip.id);
+        say({ role: 'user', content: 'Keep searching' });
+        say({ role: 'assistant', content: "Still on. I'll keep using these settings." });
+        return;
+      case 'withdraw-consent-yes': {
+        store.markChipUsed(selectFeedThreadKey(store), chip.id);
+        say({ role: 'user', content: 'Yes, stop' });
+        const withdrawn = await withdrawFeedConsent();
+        if (!withdrawn.ok) {
+          say({ role: 'assistant', content: withdrawn.error });
+          return;
+        }
+        await loadFeedOverview({ quiet: true });
+        say({
+          role: 'assistant',
+          content: "Stopped. I'm not searching public job boards for you anymore. Say yes again when you want the feed back.",
+        });
+        return;
+      }
       case 'retry-load':
         await loadFeedOverview();
         return;
@@ -781,17 +814,22 @@ function buildOpening(params: {
         [{ id: 'upload-cv', label: 'Upload my CV', variant: 'primary' }],
       )];
 
-    case 'awaiting':
+    case 'awaiting': {
+      const awaitingChips: FeedChip[] = [{
+        id: overview?.state === 'paused' ? 'resume-feed' : 'build-feed',
+        label: overview?.state === 'paused' ? 'Turn it back on' : 'Build my feed',
+        variant: 'primary',
+      }];
+      if (overview?.settings?.consent_accepted_at) {
+        awaitingChips.push({ id: 'withdraw-consent', label: 'Stop searching for me', variant: 'secondary' });
+      }
       return [message(
         overview?.state === 'paused'
           ? 'Your feed is paused. Turn it back on and I\'ll use these settings on the next run.'
           : 'Everything\'s set. I\'ll search public job boards for you and rank what I find against your CV. Run it once a day, whenever you want a new list.',
-        [{
-          id: overview?.state === 'paused' ? 'resume-feed' : 'build-feed',
-          label: overview?.state === 'paused' ? 'Turn it back on' : 'Build my feed',
-          variant: 'primary',
-        }],
+        awaitingChips.filter((chip) => !usedChipIds.includes(chip.id)),
       )];
+    }
 
     case 'building':
       return [message('Building your feed. I\'ll show you what I\'m doing on the right.')];
@@ -918,6 +956,9 @@ function buildOpening(params: {
         chips.push({ id: 'only-remote', label: 'Only remote', variant: 'secondary' });
         chips.push({ id: 'raise-salary', label: 'Raise my salary floor', variant: 'secondary' });
       }
+      if (overview?.settings?.consent_accepted_at) {
+        chips.push({ id: 'withdraw-consent', label: 'Stop searching for me', variant: 'secondary' });
+      }
 
       const body = ranToday
         ? `${
diff --git a/src/components/job-feed/feed-actions.ts b/src/components/job-feed/feed-actions.ts
index dc2fa7ef..e0f4bfbe 100644
--- a/src/components/job-feed/feed-actions.ts
+++ b/src/components/job-feed/feed-actions.ts
@@ -202,7 +202,7 @@ export async function loadSearchStrategy(): Promise<SearchStrategy | null> {
   }
 }
 
-/** What the product read from the CV. Paid plans only; null otherwise. */
+/** What the product read from the CV. Free and paid; null if none is stored yet. */
 export async function loadCareerProfile(): Promise<CareerProfile | null> {
   if (isPreviewing()) return useFeedStore.getState().careerProfile;
   const generation = useFeedStore.getState().fetchGeneration;
@@ -236,10 +236,17 @@ export async function runFeed(): Promise<FeedResult<FeedRunOutcome>> {
   }
   useFeedStore.getState().setIsRunning(true);
   try {
-    const response = await fetch('/api/job-feed/run', { method: 'POST' });
+    const response = await fetch('/api/job-feed/run', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ consent_accepted: true }),
+    });
     const payload = await readJson(response);
     if (!response.ok) {
-      return { ok: false, error: humanError(response.status, "Today's run did not go through.") };
+      const fromServer = typeof payload.error === 'string' && payload.error.trim()
+        ? payload.error
+        : null;
+      return { ok: false, error: fromServer ?? humanError(response.status, "Today's run did not go through.") };
     }
     return {
       ok: true,
@@ -258,6 +265,21 @@ export async function runFeed(): Promise<FeedResult<FeedRunOutcome>> {
   }
 }
 
+export async function withdrawFeedConsent(): Promise<FeedResult<{ withdrawn: true }>> {
+  if (isPreviewing()) {
+    return { ok: true, data: { withdrawn: true } };
+  }
+  try {
+    const response = await fetch('/api/job-feed/consent/withdraw', { method: 'POST' });
+    if (!response.ok) {
+      return { ok: false, error: humanError(response.status, "I couldn't stop the feed. Try again in a moment.") };
+    }
+    return { ok: true, data: { withdrawn: true } };
+  } catch {
+    return { ok: false, error: "I couldn't stop the feed. Try again in a moment." };
+  }
+}
+
 /**
  * Save the feed settings. On a first save the career profile has to exist
  * first, because the settings route mirrors target roles off it and rejects a
diff --git a/src/db/repos/jobFeed.ts b/src/db/repos/jobFeed.ts
index ad671742..a493cce2 100644
--- a/src/db/repos/jobFeed.ts
+++ b/src/db/repos/jobFeed.ts
@@ -55,6 +55,47 @@ export async function upsertSettings(userId: string, values: Record<string, unkn
   return row;
 }
 
+/**
+ * Clears the consent timestamp and pauses the feed. Idempotent: a missing
+ * row or an already-cleared one is still a successful withdraw.
+ */
+export async function withdrawConsent(userId: string): Promise<JobFeedSettings | null> {
+  const existing = await getSettings(userId);
+  if (!existing) return null;
+  if (!existing.consent_accepted_at && !existing.enabled) return existing;
+
+  const db = await getDb();
+  await db
+    .update(jobFeedSettings)
+    .set({
+      consent_accepted_at: null,
+      enabled: false,
+      updated_at: nowIso(),
+    })
+    .where(eq(jobFeedSettings.user_id, userId));
+
+  return getSettings(userId);
+}
+
+/**
+ * Records an explicit consent assertion on an existing settings row and
+ * turns the feed back on. Only those two columns move.
+ */
+export async function grantConsent(userId: string): Promise<JobFeedSettings> {
+  const db = await getDb();
+  await db
+    .update(jobFeedSettings)
+    .set({
+      consent_accepted_at: new Date().toISOString(),
+      enabled: true,
+      updated_at: nowIso(),
+    })
+    .where(eq(jobFeedSettings.user_id, userId));
+  const row = await getSettings(userId);
+  if (!row) throw new Error('Failed to persist job feed consent');
+  return row;
+}
+
 export async function getLatestRun(userId: string): Promise<JobFeedRun | null> {
   const db = await getDb();
   const rows = await db
diff --git a/src/lib/job-feed/auth.ts b/src/lib/job-feed/auth.ts
index ecea0333..11e1b88b 100644
--- a/src/lib/job-feed/auth.ts
+++ b/src/lib/job-feed/auth.ts
@@ -1,4 +1,4 @@
-import { canAccessJobFeed } from '@/lib/job-feed/helpers';
+import { canAccessJobFeed, canViewJobFeed } from '@/lib/job-feed/helpers';
 import { getProfile } from '@/db/repos/profiles';
 
 interface JobFeedAccessOk {
@@ -36,3 +36,21 @@ export async function requireJobFeedAccess(user: { id: string }): Promise<JobFee
 
   return { ok: true, profile };
 }
+
+/**
+ * Discovery access: free, plus or max. Same missing-profile distinction as
+ * requireJobFeedAccess, so a missing row is not reported as a plan gate.
+ */
+export async function requireJobFeedView(user: { id: string }): Promise<JobFeedAccessResult> {
+  const profile = await getProfile(user.id);
+
+  if (!profile) {
+    return { ok: false, status: 500, error: 'Account setup incomplete.' };
+  }
+
+  if (!canViewJobFeed(profile.subscription_tier)) {
+    return { ok: false, status: 403, error: 'Job Feed is not available for this account.' };
+  }
+
+  return { ok: true, profile };
+}
diff --git a/src/lib/job-feed/constants.ts b/src/lib/job-feed/constants.ts
index d5bede55..8cce3904 100644
--- a/src/lib/job-feed/constants.ts
+++ b/src/lib/job-feed/constants.ts
@@ -452,7 +452,3 @@ export const JOB_FEED_DEFAULT_SETTINGS = {
   employment_types: ['full_time'] as string[],
   work_authorization_status: 'open_to_both',
 } as const;
-
-export function isJobFeedDebugModeEnabled(): boolean {
-  return process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_JOB_FEED_DEBUG === 'true';
-}
diff --git a/src/lib/job-feed/helpers.ts b/src/lib/job-feed/helpers.ts
index 43a142ca..87827a66 100644
--- a/src/lib/job-feed/helpers.ts
+++ b/src/lib/job-feed/helpers.ts
@@ -41,9 +41,11 @@ export function canAccessJobFeed(subscriptionTier?: string | null): boolean {
  * which is gated on session identity (a logged-in free user always pays).
  *
  * Truly premium-exclusive actions (settings + settings/suggest, search-strategy
- * editing, and steering the feed) still require canAccessJobFeed (plus/max
- * only). Bookmarking a role (`saved`) and recording that it was opened are
- * available to anyone who can view the feed. Saving is free.
+ * generation, and steering the feed) still require canAccessJobFeed (plus/max
+ * only). Career-profile and search-strategy GETs are viewable: the free feed
+ * is CV-driven and builds that profile during its run. Bookmarking a role
+ * (`saved`) and recording that it was opened are available to anyone who can
+ * view the feed. Saving is free.
  *
  * Returns false for null/undefined/unknown tiers (fail-closed).
  */
diff --git a/src/lib/job-feed/server.ts b/src/lib/job-feed/server.ts
index 14fe5384..afd32770 100644
--- a/src/lib/job-feed/server.ts
+++ b/src/lib/job-feed/server.ts
@@ -131,15 +131,27 @@ function deriveFreeFeedSeedRoles(profile: CareerProfile | null): string[] {
  * row uses safe defaults; the run still resolves search terms from the career
  * profile and search strategy at run time.
  *
+ * Consent is not invented here. The caller must pass `consentAccepted: true`
+ * from an explicit request field before a row is created. A missing assertion
+ * throws JOB_FEED_CONSENT_REQUIRED rather than stamping a timestamp the user
+ * never gave.
+ *
  * Only called for free users. Premium users must configure settings manually
  * through the settings UI (requireJobFeedAccess-gated).
  */
 export async function getOrProvisionFreeJobFeedSettingsAdmin(
   userId: string,
   seedRoles: string[],
+  options: { consentAccepted: boolean },
 ): Promise<JobFeedSettings> {
   const existing = await getJobFeedSettingsAdmin(userId);
-  if (existing) return existing;
+  if (existing) {
+    return ensureFreeFeedConsent(userId, existing, options.consentAccepted);
+  }
+
+  if (!options.consentAccepted) {
+    throw new Error('JOB_FEED_CONSENT_REQUIRED');
+  }
 
   if (seedRoles.length === 0) {
     throw new Error('Cannot provision free-tier job feed settings without at least one seed role from the career profile.');
@@ -169,7 +181,9 @@ export async function getOrProvisionFreeJobFeedSettingsAdmin(
     } as never);
   } catch (error) {
     const raced = await getJobFeedSettingsAdmin(userId);
-    if (raced) return raced;
+    if (raced) {
+      return ensureFreeFeedConsent(userId, raced, options.consentAccepted);
+    }
     throw new Error(`Failed to provision free-tier job feed settings: ${error instanceof Error ? error.message : 'unknown error'}`);
   }
 }
@@ -1162,14 +1176,36 @@ export async function getLatestManualCompletedJobFeedRunAdmin(userId: string): P
   return jobFeedRepo.getLatestManualCompletedRun(userId);
 }
 
+async function ensureFreeFeedConsent(
+  userId: string,
+  settings: JobFeedSettings,
+  consentAccepted: boolean,
+): Promise<JobFeedSettings> {
+  if (settings.consent_accepted_at && settings.enabled) {
+    return settings;
+  }
+  if (!consentAccepted) {
+    throw new Error('JOB_FEED_CONSENT_REQUIRED');
+  }
+  return jobFeedRepo.grantConsent(userId);
+}
+
 export async function runJobFeedFoundationWorkflow(params: {
   userId: string;
   triggerSource?: string;
   now?: Date;
   force?: boolean;
   orchestrator?: JobFeedRunDiagnostics['orchestrator'];
+  consentAccepted?: boolean;
 }): Promise<JobFeedRunWorkflowResult> {
-  const { userId, triggerSource = 'manual_user', now = new Date(), force = false, orchestrator = 'direct' } = params;
+  const {
+    userId,
+    triggerSource = 'manual_user',
+    now = new Date(),
+    force = false,
+    orchestrator = 'direct',
+    consentAccepted = false,
+  } = params;
 
   // Resolve the subscription tier early so we can auto-provision settings for
   // free users who have never gone through the (premium-only) settings UI.
@@ -1184,8 +1220,11 @@ export async function runJobFeedFoundationWorkflow(params: {
     // whose profile no longer matches the current schema version.
     const existingSettings = await getJobFeedSettingsAdmin(userId);
     if (existingSettings) {
-      settings = existingSettings;
+      settings = await ensureFreeFeedConsent(userId, existingSettings, consentAccepted);
     } else {
+      if (!consentAccepted) {
+        throw new Error('JOB_FEED_CONSENT_REQUIRED');
+      }
       // Seed target_roles from the synthesized career profile so the
       // provisioned row satisfies the non-empty target_roles constraint. The
       // profile is reused below for the search strategy
@@ -1198,7 +1237,7 @@ export async function runJobFeedFoundationWorkflow(params: {
         // error the route maps to a clear, user-actionable 422 instead.
         throw new Error('JOB_FEED_INSUFFICIENT_CV');
       }
-      settings = await getOrProvisionFreeJobFeedSettingsAdmin(userId, seedRoles);
+      settings = await getOrProvisionFreeJobFeedSettingsAdmin(userId, seedRoles, { consentAccepted: true });
     }
   } else {
     const loaded = await getJobFeedSettingsAdmin(userId);
diff --git a/src/app/api/job-feed/consent/withdraw/route.ts b/src/app/api/job-feed/consent/withdraw/route.ts
new file mode 100644
index 00000000..c0d53a11
--- /dev/null
+++ b/src/app/api/job-feed/consent/withdraw/route.ts
@@ -0,0 +1,48 @@
+import { NextRequest, NextResponse } from 'next/server';
+import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
+import { getCurrentUser } from '@/auth/server';
+import { canViewJobFeed } from '@/lib/job-feed/helpers';
+import { getProfile } from '@/db/repos/profiles';
+import { withdrawConsent } from '@/db/repos/jobFeed';
+
+export const runtime = 'nodejs';
+
+/**
+ * Tier-agnostic consent withdrawal. GDPR does not care about the plan, so this
+ * cannot live behind the plus/max gate on PUT /api/job-feed/settings.
+ *
+ * Clears consent_accepted_at and sets enabled: false. Idempotent.
+ */
+export async function POST(request: NextRequest) {
+  try {
+    const ipAllowed = await checkJobFeedIpGate(request);
+    if (!ipAllowed) {
+      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
+    }
+
+    const user = await getCurrentUser(request);
+    if (!user) {
+      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
+    }
+
+    const { allowed } = await checkRateLimit(`job-feed-consent-withdraw:${user.id}`, RATE_LIMITS['job-feed-settings']);
+    if (!allowed) {
+      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
+    }
+
+    const profile = await getProfile(user.id);
+    if (!profile) {
+      return NextResponse.json({ error: 'Failed to load profile.' }, { status: 500 });
+    }
+
+    if (!canViewJobFeed(profile.subscription_tier)) {
+      return NextResponse.json({ error: 'Job Feed is not available for this account.' }, { status: 403 });
+    }
+
+    await withdrawConsent(user.id);
+    return NextResponse.json({ withdrawn: true });
+  } catch (error) {
+    console.error('[job-feed/consent/withdraw] unexpected error:', error);
+    return NextResponse.json({ error: 'Failed to withdraw feed consent.' }, { status: 500 });
+  }
+}
