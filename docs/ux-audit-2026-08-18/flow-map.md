# Flow map, 18 August 2026

Every step of the real journey, in order, with what the user sees and what it costs them. Click counts assume a user who knows where they are going. A first-timer takes more.

---

## 1. Anonymous visitor

**Landing page** `00-anonymous/01-landing-*`

9,197 px tall, roughly ten screens. Hero: "Your entire job search, in one app." with two CTAs, "Start free, no credit card" and "Watch the demo". Below: an ATS logo strip, a five-step "how it works", three scrollytelling product sections, a founder note, a time-savings calculator, a three-plan pricing block, a closing CTA, footer.

The header offers seven destinations (Features, How It Works, Pricing, Blog, About, Contact, plus Log in and Try It Free). "Try It Free" links straight to `/dashboard`, which redirects to signup when logged out.

- The product screenshots throughout still show **Karko AI** branding and a `karkoai.com/dashboard` URL bar.
- Signed in, this page still shows "Log in" and "Try It Free".

**Pricing** `00-anonymous/02-pricing-*`. 5,018 px. Three plans, credit-pack upsell, time-savings calculator, credit-cost table, 12-question FAQ, closing CTA. Lists Smart Job Feed as Plus and Max only, which is not what the product does.

**Signup** `00-anonymous/04-auth-signup.jpg`. one screen. Google button, then Full Name, Email, Password, "Create Account". A small banner promises "Free plan includes 4 credits (~2 applications/month)". No header, no way back to the site. Browser title says "Sign In".

**Login** `00-anonymous/03-auth-login.jpg`. Google button, email, password, "Sign In", "Forgot password?". Lives at `/auth/login`; `/login` is a 404.

**Clicks from landing to a created account: 2.** (Try It Free, Create Account.) That part is genuinely good.

---

## 2. Free user, first run

**Arrival** `02-free-onboarding/01-dashboard-first-run-empty.jpg`

Two-panel layout. Left: "Welcome to Useful Apply", Upload File / Paste Text toggle, a drop zone, three feature icons, and an "Open Documents Library" link. Right: "Upload your CV to get started" and a disabled chat input. Header: three tabs (Application Kit, Job Feed, Tracker), an "Upgrade to Plus" button, a credit chip, a panel toggle, an avatar.

**Upload** `03-free-cv-upload/01-*` through `03-*`

Drop a PDF. The drop zone becomes "Parsing your CV... This may take 30-60 seconds". Measured: **~50 seconds**. Throughout, the right panel still reads "Upload your CV from the left panel" and the chat input still says "Upload your CV first to get started". Nothing in the panel the user is about to work in acknowledges the upload.

**Parsed** `03-free-cv-upload/03-parsed-base-cv-ready.jpg`

Left panel becomes the CV with Templates, Edit, Copy, Download PDF, a banner "This is your base CV. It isn't tailored to a job yet." and a "Tailor for a job" button. Right panel becomes a job-description textarea with two CTAs and a cost line in small grey text.

**Decision point.** Two buttons, presented as equals:
- "Generate application kit", 2 credits
- "Check fit first", 0.5 credits

**Fit analysis** `04-free-fit-analysis/02-*` through `05-*`

Paste the job ad, click Check fit first. The right panel runs a three-stage checklist (Parsing CV and Requirements, Skill Matching, Assessing Job Fit) with a percentage. **~20 seconds.** Result: a verdict badge, match score, strengths, gaps, a recommendation, then "Generate Kit" and "New Search".

Match score on the test job: **76%, Good Fit.**

Credit chip still reads the pre-analysis balance. It only corrects on reload.

**Dead end** `08-free-billing-limits/01-out-of-credits-paywall.jpg`

Click "Generate Kit". Modal: "You're out of credits. This action requires 1.5 credits, but you only have 0.5 credits remaining." Two plan cards. The chat behind it prints "Generating your full application..." and never retracts it.

**A free user's journey ends here.** They have seen a fit score and a pricing modal. They have never seen the product's actual output.

**Clicks from landing to the wall: 7.** Time: about 3 minutes, most of it waiting.

**Free job feed** `06-free-job-feed/*`. one click on "Find jobs now", ~1 minute build with a four-stage checklist, a "Today's feed is ready" modal with found/ranked/duplicates/failures counts, then 5 ranked cards each offering Check Fit, Generate Kit, Employer site, View details. Bottom: "Want more matches? Plus searches more sources... Free shows your top 5."

**Free tracker** `07-free-tracker/01-tracker-list.jpg`. status tabs with counts, search, status filter, one row per application with role, company, date, match score and an editable status.

---

## 3. Max user, full generation

**Generate** `10-max-generation/01-*` through `04-*`

Paste the job ad, click "Generate application kit". Right panel runs a five-stage checklist: Parsing CV and Requirements, Skill Matching, Optimizing CV, Composing Cover Letter, Generating Emails. **~50 seconds.**

During generation the left canvas goes blank white and the active tab switches by itself as each artefact completes. Three stages sit at "Active" simultaneously while the progress bar holds at 45%.

Completion message: "Your full application is ready", with "Answer Screening Questions" and "Skip For Now".

**The kit** `11-max-application-kit/*`

Four tabs across two panels:
- **CV**: Original / Optimized toggle, Templates, Edit, Copy, Download PDF, and an ATS score chip (78% on this run). The ATS chip opens a genuinely good modal with the optimization strategy and a list of every change made.
- **Cover Letter**: Edit, Regenerate, Copy, Download PDF, Download DOCX.
- **Email**: Application Email and Follow-Up Email sub-tabs, each with subject line, body, per-field copy buttons and a sending-tips block. The follow-up carries a "Send after 5-7 business days" chip.
- **Screening questions**: paste a question in the chat, get a STAR-structured answer with a Copy button.

Output quality is high. The cover letter opens with a real metric from the CV rather than a cliché, and the ATS insights explicitly state that no missing skills were invented.

**Max job feed** `12-max-job-feed/*`

Same one-click build, ~90 seconds, 20 jobs instead of 5, plus an "Edit feed" surface the free tier does not get: the inferred AI search profile (discipline, best-fit titles, skill areas, industries, a written candidate summary), the 10 Google Jobs queries it will run with a rationale per query, downweighted titles, and a preferences form (countries, cities, work mode, minimum salary, work authorization, keywords to avoid).

This is the most impressive screen in the product and the hardest to reach: it is behind a small "Edit feed" pill in the feed toolbar, and once open the only way out is a small × at the very top of a 2,798 px panel.

**Max tracker** `13-max-tracker/01-*`. same as free. The Pixellot application appears automatically with status **Applied**, though nothing was applied to.

---

## 4. Settings

Four tabs (Profile, Account, Subscription, Notifications) at top-level routes with a "Back to App" link. The app shell, credit balance and panel state all disappear.

- **Profile**: photo, name, email, phone, location.
- **Account**: Change Password, Enable 2FA, Delete Account.
- **Subscription**: current plan, credits remaining, upgrade or credit-pack CTA, a full plan comparison table, and "Manage Billing" to the Stripe portal on Max.
- **Notifications**: four email toggles.

---

## What the shape of this tells you

The product has three separate front doors and no single spine:

1. **Paste a job ad** in the chat panel.
2. **Pick a job** from the feed and press Generate Kit on the card.
3. **Upload a CV** and be told to come back to the other panel.

Each is a reasonable entry, but the user has to work out which one they are in. The header offers three tabs, the left panel offers three or four more, the right panel offers two CTAs plus a chat, and settings live somewhere else entirely.

Compare the moment that actually works: the fit-analysis and generation progress checklists. One panel, one thing happening, named stages, a clear finish. That is the pattern the rest of the app should be built from.

The single change with the most leverage: **make the first run a guided line rather than a room full of doors.** Upload, see fit, see the kit. One primary action visible at a time, cost stated before commitment, and nothing else competing for the click until the user has finished their first application.
