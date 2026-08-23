# Flow 7: the marketing site. Locked 19 August 2026.

Variant round (Option A one-button hero, Option B drop-zone hero, a pricing-page draft) then Wasim's picks; locked the same day.

## Canvas and visuals

- **Locked canvas (2 artboards):** https://claude.ai/code/artifact/90ffec97-9dbc-4520-875d-69f1684a6fe9 (variants in version history)
- **Rendered artboards (PNG):** `flow-7-artboards/png/` (M1 Landing 1440x4432, M2 Header states).
- Sources: `flow-7-artboards/gen9.mjs` (images beside it are downsampled PNGs from flows 1 to 3 and the founder photo). `../shoot.mjs <dir> <out> full` renders tall artboards whole.

## The decision

**One landing page, about 4,400 px instead of 9,200.** Option A: the hero sells, the guided line starts. The hero keeps today's aurora background and headline, with one gold **Try it free** into the guided line and the kit screen as proof. Below it, three product moments built from the new screens, a two-line founder note, the plan cards, and then the page as it is today: the navy final band and the footer are unchanged.

Wasim's steers, applied: keep the current hero background and the current pricing section's place on the page; from the pricing section down, don't redesign; /pricing keeps its layout; first sections take the new layout.

**Plan cards on the landing: the new ones.** Compared with today's tiles (white / gold-border / navy-fill, two gold buttons, bold sans prices), the new cards are the same three as the in-app settings modal (flow 5), so what a visitor sees before signing up matches what they see after. One gold action (Plus), the other two outlined, serif price anchors like every other heading, a tinted highlight instead of a navy block that competed with the navy band under it. Kept from today: the **Compare all plans and features** link to /pricing.

## Pages

| Route | What happens |
|---|---|
| `/` | The locked landing (M1). Sections: header, hero, three moments, founder note, plan cards, final band (unchanged), footer (unchanged). |
| `/pricing` | Layout unchanged. Copy refresh only (see notes). |
| `/features`, `/#how-it-works` | Removed. 301 `/features` to `/#what-you-get` (the moments section). The footer's "Features" and "How It Works" links become one "What you get" link. |
| `/blog`, `/about`, `/contact`, legal | Unchanged, reached from the footer. |

## Screen by screen

**Header (M2).** Wordmark, Pricing, Log in, gold Try it free. Signed in: Log in and Try it free are replaced by one outlined **Open app** (F10; `/dashboard` stays the route, "Open app" is the label). Blog, About and Contact move to the footer. Sticky behaviour stays; `scroll-margin-top` on every anchored section so the bar never covers a heading (F34).

**Hero.** Today's `HeroAurora` background and "Your entire job search, in one app." One line under it: "Upload your CV, paste a job, see your fit. Then a tailored CV, cover letter and emails in 90 seconds. Every word from your real CV, nothing invented." One gold **Try it free**, muted line "Your first fit check is on us, no account needed." The kit screen (flow 1 S1) as the product shot, 1040 wide. No second button. The demo video returns under the shot once it is re-recorded after the build (today's Tella still shows Karko AI, F24).

**Three moments** (`#what-you-get`), text 320 px beside a 680 px screen, alternating sides:
1. See the fit before you spend anything. (flow 1 L3b)
2. A kit you can send, every claim from your CV. (flow 2 K1, ATS what changed)
3. Roles picked for you every morning. (flow 3 J3)

**Founder note.** Photo 120 px, one quote, "Wasim Jalali, founder". Replaces the four-paragraph signed-card block.

**Plan cards.** "Start free. Pay when you're applying every week." Free $0 / Plus $19.99 (MOST POPULAR, tinted, gold Start with Plus) / Max $79.99, three lines each, then Compare all plans and features.

**Final band and footer.** As today.

## Dropped from the landing

ATS logo bar (those aren't customers; the ATS moment carries the claim), platform scroll-stack, time-savings calculator, "How it works" five-step list (its content is the three moments), the long founder block, the second hero button.

## Notes for the spec and build

1. `src/app/page.tsx`: keep `HeroAurora`, the final CTA section and `Footer`; replace everything between with the hero copy above, the three moments, the founder note and the plan cards. Delete `PlatformScrollStack`, `TimeSavingsCalculator`, the trust bar, `PricingAurora` and the `ProductShowcase` component if nothing else imports them (grep first).
2. Moments use real screenshots of the built screens, not mockups: capture them with Playwright after flows 1 to 3 ship, 1440x900, stored under `public/images/moments/`.
3. `Navbar.tsx`: links become Pricing only; signed-in state shows **Open app**. The mobile menu follows the same list.
4. `/features/page.tsx` is deleted and redirected (301) to `/#what-you-get`; update `sitemap.ts`, the footer `productLinks` and any internal links (`grep -rn "/features"`).
5. `/pricing`: keep the page; copy pass only: plan lines match the cards here ("Top-5 daily feed", "20 roles a day, Edit feed", "Priority generation"), credit prices stated once ("Fit check 0.5 · full kit 2, 1.5 after a fit check · rewrite 0.5"), no em dashes.
6. Plan cards are one component shared with the settings modal (flow 5) so the two can't drift.
7. Schema.org `featureList` and the metadata description drop "Smart Job Feed" naming in favour of "daily job feed"; keep the offers.
8. Page height target: under 4,500 px at 1440 wide (F28).

## Out of scope

Blog, About, Contact, legal pages, the comparison pages. The demo re-record (after the build).
