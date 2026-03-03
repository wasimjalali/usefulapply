---
description: Auth flow rules for API routes and auth pages
globs: ["src/app/api/auth/**", "src/contexts/AuthContext.tsx", "src/app/auth/**"]
---

# Auth Rules

## Signup Flow (server-side via `/api/auth/signup`)
- Uses `supabase.auth.admin.generateLink({ type: 'signup' })` — bypasses Supabase SMTP (3/hour limit)
- Profile immediately upserted via service role key (does not depend on DB trigger)
- Confirmation email sent via Resend: `from: 'KarKo AI <noreply@karkoai.com>'`
- Rate limited: 3 requests/min per IP
- `redirectTo` uses `NEXT_PUBLIC_SITE_URL` env var (not `request.url`) — Vercel preview URLs may not be in Supabase allowlist

## Email Confirmation Callback (`/auth/callback/page.tsx`)
This is a **client-side page** (not a route handler) — handles both auth flows:
1. **Implicit flow** (from `generateLink`): tokens in URL hash `#access_token=...` → `supabase.auth.setSession()`
2. **PKCE flow** (OAuth): code in query params `?code=...` → `supabase.auth.exchangeCodeForSession()`
Both flows clear localStorage stores before setting session to prevent cross-user data leakage.

## Password Reset Flow
- `sendPasswordResetEmail()` uses `redirectTo: .../auth/callback?next=/auth/reset-password`
- Reset password page: `src/app/auth/reset-password/page.tsx`
- Validates: min 6 chars, passwords must match, auto-redirects to dashboard after 2s

## Cross-User Data Leakage Prevention (3 layers)
1. `AuthContext` — tracks previous user ID; clears both localStorage stores on user change
2. Auth callback — clears stores before `setSession()` / `exchangeCodeForSession()`
3. `useSupabaseSync` — resets load refs on user ID change, forces fresh Supabase reload

## Session Refresh
- `src/proxy.ts` — Next.js 16 session refresh proxy; calls `supabase.auth.getUser()` on every request
- Keeps session tokens alive in cookies for server components

## Admin Client
- `src/lib/supabase/admin.ts` — uses `SUPABASE_SERVICE_ROLE_KEY`
- Server-side only — never import in client components or expose to browser

## Unconfirmed Email Handling
- `signIn()` detects `email_not_confirmed` Supabase error code
- Returns sentinel value → login page shows amber info box + "Resend confirmation email" button
- Resend calls `/api/auth/signup` which regenerates the confirmation link via Resend

## Supabase Dashboard Requirements
- Site URL: `https://karkoai.com`
- Redirect URLs allowlist: `https://karkoai.com/auth/callback`
