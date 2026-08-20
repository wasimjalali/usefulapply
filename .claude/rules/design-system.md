---
paths:
  - "src/components/**"
  - "src/app/**/*.tsx"
  - "src/**/*.css"
---

# Useful Apply Design System (authoritative, overrides any older spec)

The product has three visual layers. Every panel, card, and document must pick a role and stick to it.

### Surface roles
| Layer | Token | Hex | Use for |
|-------|-------|-----|---------|
| **Canvas** | `cream-100` | `#FAF7F2` | Page canvas only: dashboard shell, every panel shell, modal backdrop fallback |
| **Surface** | `cream-50` | `#FEFDFB` | Everything cards live in: cards, grids, pills, inputs, state messages, wizard body, tab tracks, tracker rows, job cards, empty-state tiles |
| **Document** | `white` | `#FFFFFF` | Only printable/sendable documents: CV page, cover letter body, email body, modal inner scroll area when it holds a document |

Rules:
- **No gradients on canvas or surface layers.** No `bg-gradient-to-b from-cream-100 to-cream-50` shells, no custom `bg-[radial-gradient(...)]` canvases. Gradients are reserved for CTAs (gold/navy buttons), nothing else.
- **No translucent whites over cream.** `bg-white/85`, `bg-white/90`, `bg-white/95` on a cream canvas create subtle tint shifts the eye can feel but not name. Use solid `bg-cream-50` or solid `bg-white` — decide which role the surface is playing.
- **Borders on surfaces:** `border-cream-200`. Darker cream borders (`cream-300`, `cream-400`) are for dingy; do not reach for them on new work.
- **Avoid `cream-300` and `cream-400` on large fills.** They read as aged paper / dingy. Keep them for dividers only.
- **Scrollbars are soft white-family, never navy and never gold.** Thumb `#E7E0D2` (between `cream-200` and `cream-300`, not a ramp token), `#C9BDA4` deeper sand on hover, transparent track, 12px wide with a 2px transparent border so the thumb reads as 8px (`globals.css`). The earlier sand-plus-navy-hover pairing read louder than every surface around it; the thumb now stays inside the cream family and only firms up on hover. On dark surfaces the ramp flips, so scrollable navy panels take `.scrollbar-on-dark` (`cream-300` thumb, white on hover) - otherwise hover makes the thumb vanish instead of stand out.

### Typography
- **One family everywhere in the app UI: Inter** (self-hosted via `next/font` in `layout.tsx`, wired to `--font-sans` in `globals.css`). Headings, body, labels, buttons, chips, form fields all use it. The old Georgia/Arial split is retired; do NOT reintroduce `font-serif` anywhere in the app or landing.
- **Hierarchy comes from size and weight, not family.** Page/panel titles: `font-semibold` at the existing size scale. Body and labels: `font-normal` / `font-medium`.
- **`font-semibold` not `font-bold`** on headings.
- **Exemptions:** `src/components/cv-templates/**` and the exported PDF/DOCX keep Arial + Georgia (ATS-safe fonts in the applicant's own document). Email templates keep their inline fonts. The brand wordmark keeps Plus Jakarta Sans.

### Radius scale (3 + 1)
Pick one role per element. Everything else is deprecated.
| Role | Class | Use for |
|------|-------|---------|
| **Pill** | `rounded-full` | Chips, status pills, icon buttons, avatar rings |
| **Control** | `rounded-lg` | Inputs, dropdowns, small buttons, tooltips |
| **Card** | `rounded-2xl` | Cards, panels, grids, wizards, preview tiles |
| **Modal** *(reserved)* | `rounded-[24px]` | Full-screen / centered modals only |

Do NOT use: `rounded-md`, `rounded-xl`, `rounded-3xl`, `rounded-[14px]`, `rounded-[16px]`, `rounded-[18px]`, `rounded-[20px]`, `rounded-[22px]`, `rounded-[28px]`, `rounded-[30px]`, `rounded-[32px]`. Collapse all of those to the nearest role above.

### CTA treatments (one each — no gradients)
| CTA | Class | Use |
|-----|-------|-----|
| **Primary (Gold)** | `bg-gold-400 hover:bg-gold-500 text-white` | Main action per surface ("Apply with Useful Apply", "Start my daily feed", "Upgrade to Plus") |
| **Primary (Navy)** | `bg-navy-600 hover:bg-navy-700 text-white` | Secondary primary ("Sign up", "Save changes", sidebar highlights) |

**Button label colour is always `text-white`** on any solid brand fill, gold or navy. This is a deliberate brand-consistency decision: a screen mixing white-on-navy with dark-on-gold reads as inconsistent. Never use `text-navy-900`, `text-charcoal` or any dark token on `bg-gold-400` / `bg-gold-500`. The same applies to icons inside those buttons.

Known tradeoff: white on `gold-400` (`#D4A853`) measures ~2.2:1, below the WCAG AA 4.5:1 threshold for normal text. Consistency was chosen over the contrast ratio here. If we ever want white labels that also pass AA, the fill has to darken to roughly `gold-700` (`#825E1C`, ~5.9:1) — that's a brand decision, not something to change per-component. Do not "fix" individual buttons back to dark text.

Light gold tints (`bg-gold-50`, `bg-gold-100`, `bg-gold-200`) are a different role: they are badges, chips and status tiles, not CTAs, and they keep dark text (`text-gold-700`, `text-charcoal`). White on a light tint is unreadable.

Do NOT use: `bg-gradient-to-r from-gold-400 to-gold-500`, `bg-gradient-to-r from-navy-600 to-navy-700`, `bg-gold-500` / `bg-navy-700` as default base. Gradients on CTAs read as AI-slop; flat brand colors read as confident.

### Shadow scale (3 values)
| Depth | Class | Use |
|-------|-------|-----|
| **Resting** | `shadow-sm` | Cards, pills, tab tracks — everything that sits on the canvas |
| **Elevated** | `shadow-md` | Hover state on cards, dropdowns, popovers |
| **Floating** | `shadow-lg` | Modals, full-preview overlays, toasts |

Do NOT invent bespoke drop-shadow strings like `shadow-[0_24px_60px_-20px_rgba(30,58,95,0.35)]`. If `shadow-lg` isn't dramatic enough for a modal, use `shadow-xl` (last resort). Never `shadow-2xl`.

### Motion
- `transition-colors duration-200` default.
- Elevation lift (`-translate-y-0.5 hover:shadow-md`) reserved for elevated CTAs only — not on every card.

### Iconography
- Lucide-react only. Sizes: `w-3.5` (chrome), `w-4` (inline text), `w-5` (headers), `w-6` (modal close, empty-state tiles).

**When in doubt, follow this before touching any visual code.**
