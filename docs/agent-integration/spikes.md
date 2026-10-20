# Spikes

Findings that gate the build. Each section is dated and says what was run.

## 0b Browser Run

**Run:** 2026-10-20, wrangler 4.123.0 with a remote `browser` binding (`wrangler dev`, compatibility date 2026-08-17), against the real Browser Run service on the Karko AI account. Chrome reports `HeadlessChrome/128`, PDFs come back as `Skia/PDF m128`. Spike code: `evals/ats-export/render-worker/` (the Worker) and `evals/ats-export/spike-render.ts`. The full renderer now lives in `src/lib/services/export/`.

**Verdict: it works, and it is faster and cheaper than the plan assumed.** `env.BROWSER.quickAction("pdf", { html, ... })` renders a server-built page to a tagged PDF with real text, embedded fonts and a Unicode map. No render token, no public print route.

### Exact request

```ts
await env.BROWSER.quickAction('pdf', {
  html,                                   // standalone page, everything inlined
  gotoOptions: { waitUntil: 'load', timeout: 20_000 },
  pdfOptions: {
    format: 'a4' | 'letter',              // repeats the @page size as a fallback
    preferCSSPageSize: true,              // @page owns size and margins
    printBackground: true,
    tagged: true,
    displayHeaderFooter: false,
    timeout: 30_000,
  },
});
```

The page carries `@page { size; margin }` (the single margin owner, the template root has no padding in print mode), self-hosted Arimo and Gelasio as base64 `@font-face`, the photo as a `data:` URI, and a CSP of `default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:` so a hostile string in a CV can never make the render fetch anything. `pdf-lib` then sets Title, Author, Subject, Producer, Creator and `/Lang`, and `DisplayDocTitle`.

### What came back (Premium ATS, German ATS with photo, both cover letters, 24 CV renders in the eval)

| Check | Result |
|---|---|
| Tagged PDF (`pdfinfo`) | yes, before and after the `pdf-lib` rewrite (the structure tree survives) |
| Fonts | `Arimo-Regular`, `Arimo-Bold`, `Gelasio-Regular`, `Gelasio-Bold`: CID TrueType, embedded, subset, Unicode map present. No Type 3 |
| Umlauts, ß, bullets | extract correctly with `pdftotext` and pdf.js |
| Page size | Letter 612 x 792 pt exactly. A4 comes back 595.92 x 842.88 pt (Chrome rounds to CSS pixels), within 1 pt of 595.28 x 841.89 |
| Margins | `@page` margins honoured on every page. A different first-page margin (`@page :first`) works, which the DIN 5008 letter relies on |
| Page-break rules | `break-inside: avoid`, `break-after: avoid`, orphans and widows all honoured. CSS grid fragments across pages, so a sidebar column continues on page 2 |
| Producer, title | Chrome writes `about:blank` as the title, `Skia/PDF` as producer and `/Lang (en-US)` always. All three are replaced with `pdf-lib` |
| File size | median 68 KB per PDF (limit we set: 2 MB). The old html2canvas export averaged 1,044 KB |

### Timings and limits

- Wall time per render: median **0.97 s**, max 1.7 s over 31 renders, including one hop through the eval Worker. `X-Browser-Ms-Used` (the billed number): median **224 ms**. The plan assumed 3 s.
- Cost at that figure and $0.09 per browser hour: about **$0.000006 per PDF**. The included 10 hours a month cover roughly 160,000 PDFs.
- Request size: 0.5, 0.9, 1.5, 5 and 20 MB of HTML all rendered (3.1 s for 20 MB). The docs give 50 MB. A real CV page with fonts is about 200 KB, with a photo about 250 KB.
- The Quick Actions limit on Workers Paid is 30 requests per second.
- **`quickAction` does not run in plain local dev.** It needs `wrangler dev --remote` or `"remote": true` on the binding, which must not be committed. The installed workerd supports compatibility dates up to 2026-08-18 only, so the eval Worker uses 2026-08-17.
- **Transient failures:** the service answered `Error: internal error` 3 times in about 70 renders during the eval (a Worker exception, no body). `renderHtmlToPdf` retries a render up to 3 times with a short backoff before it fails. A render has no side effects.
- Fonts: Browser Run lists Liberation Sans, Arial, Georgia and Noto (CJK, emoji) as installed. Arimo and Gelasio are not, so they are embedded. Cyrillic, Greek and other scripts fall back to the installed families and are not covered by the shipped Latin subsets.

### Things the spike turned up that the plan did not have

1. **`react-dom/server` cannot be imported in a Next route handler.** Route handlers compile in the React Server Components layer, where every `react-dom/server` entry resolves to a module that throws (`You're importing a component that imports react-dom/server`). The export therefore uses `src/lib/services/export/static-markup.ts`, a 100-line tree walker for the templates' plain function components. `evals/ats-export/markup-parity.ts` renders every template and fixture with both and compares the HTML: 0 differences in 50 renders.
2. **Letter-spaced headings break pdf.js extraction.** With `letter-spacing: 2px` on an uppercase heading, pdf.js returned `P R O F I L`, while `pdftotext` returned `PROFIL`. Heading letter-spacing is now 0.5 px or less. OpenResume, which is built on pdf.js, depends on this.
3. **A positioned element paints late.** `position: relative` on the Premium experience entries put all of them after the Certifications section in the content stream, so the text layer read Summary, Skills, Education, Certifications, then every job. The headings were in order, the content was not. The attribute is gone and the eval now asserts that experience entries sit between their heading and the next one.
4. **An all-caps bold skill label reads as a section title** to a simple parser (OpenResume split Skills into empty sections). Skill group labels are now bold mixed case with a colon.
5. **`pdftotext` drops the hyphen when a compound word breaks across lines** (`zero-downtime` becomes `zerodowntime`). pdf.js keeps it. The eval's text match ignores spaces and hyphens for that reason.
6. **Page-wise reading order for two-column templates.** A page is fragmented into a main-column part and a sidebar part, in that order, so the stream reads main, sidebar, main, sidebar across pages. The eval asserts that per page.
