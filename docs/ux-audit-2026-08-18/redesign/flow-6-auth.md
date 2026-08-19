# Flow 6: the auth pages. Locked 19 August 2026.

Drafted and locked in one pass (Wasim: "lock in and go ahead"). Inherits the line header from `flow-1-first-run.md`.

## Canvas and visuals

- **Locked canvas (4 artboards):** https://claude.ai/code/artifact/65f6197c-8e8f-4f0e-a3f5-71bb80cd00f0
- **Rendered artboards (PNG, 1440x900):** `flow-6-artboards/png/` (A1 Log in, A2 Sign up, A3 Forgot password, A4 Check email).
- Sources: `flow-6-artboards/gen8.mjs`.

## The decision

Auth pages use the **same header as the guided line** (wordmark linking back to usefulapply.com, one quiet text link top right) and **one card**: one serif heading, Google first, fields, one gold button, and one line under the card for the other path. No "Welcome back!" subtitles.

First-timers normally never see the standalone sign-up page: they create the account inside the guided line at step 4a. A2 exists for links from the marketing site, from emails, and for `/signup`.

## Pages

| Route | Title tag | Header link | Card | Under the card |
|---|---|---|---|---|
| `/login` (and `/auth/login`) | Log in · Useful Apply | New here? Try it free → guided line | "Log in". Google, Email, Password (show/hide), "Forgot password?" right-aligned, gold **Log in** | Don't have an account? Sign up |
| `/signup` (and `/auth/signup`) | Sign up · Useful Apply | Log in | "Create your free account" + "4 credits a month, no card." Google, Name, Email, Password, gold **Create account**, terms line | Already have an account? Log in |
| `/auth/forgot-password` | Reset password · Useful Apply | Log in | "Reset your password" + "We'll email you a link. It works for 30 minutes." Email, gold **Send the link** | Back to log in |
| after reset request or sign-up verification | Check your email · Useful Apply | Log in | Mail icon, "Check your email", the address, "Open it on this device and you're back in.", "Nothing after a minute? Check spam, or send it again." | Wrong address? Start over |

## Notes for the spec and build

1. Fix the doubled title ("Sign In | Useful Apply | Useful Apply") at the layout level: one `title` template, page-specific first segment.
2. `/login` and `/signup` redirect to the auth routes (B8 already done; keep).
3. Errors appear inline under the field in one sentence, never a toast ("That password doesn't match this email." / "We couldn't find that address.").
4. After login, return to where the user was (`?next=`); a user with no kit lands on the guided line, not an empty spine (flow 1 note 2).
5. Google is first on every page; the email form is the fallback. Magic-link sign-in is not in scope.
6. "Try it free" starts the anonymous guided line (flow 1).

## Out of scope

Marketing pages (flow 7).
