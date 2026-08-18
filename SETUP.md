# Useful Apply setup (Cloudflare)

Local development runs Next.js 16 with OpenNext wrangler bindings. Production is a Cloudflare Worker, not Vercel.

## Prerequisites

- Node.js 18+
- npm
- A filled-in `.dev.vars` (copy from `.dev.vars.example`). Never commit `.dev.vars`. Do not put secrets in `wrangler.jsonc`.

## Bindings

`wrangler.jsonc` is the source of truth. Local `npm run dev` and `npm run preview` both read it.

| Binding | Kind | Resource |
|---|---|---|
| `DB` | D1 | `usefulapply-db` |
| `FILES` | R2 | `usefulapply-files` |
| `NEXT_INC_CACHE_R2_BUCKET` | R2 | `usefulapply-next-cache` |
| `EMAIL` | Email Service | `send_email` name `EMAIL` |
| `CONTEXT_CACHE` | KV | agent context cache |
| `IMAGES` | Images | image binding |
| `RATE_LIMIT_*` | Rate Limiting | one binding per API bucket |
| `ASSETS` | Assets | OpenNext static assets |
| `WORKER_SELF_REFERENCE` | Service | self-call for ISR |

Compatibility flags: `nodejs_compat`, `global_fetch_strictly_public`. Auth secrets (`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are Worker secrets, not wrangler vars.

## First-time local D1

```bash
npx wrangler d1 migrations apply usefulapply-db --local
```

This applies `migrations/d1/*.sql` to the local Miniflare D1 that `npm run dev` and `npm run preview` share.

## Dev loop

```bash
npm install
npm run dev
```

`next.config.ts` calls `initOpenNextCloudflareForDev()` in development, so `getCloudflareContext()` sees the wrangler bindings (D1, R2, EMAIL, rate limits, KV). Open [http://localhost:3000](http://localhost:3000).

Plain Next without that init cannot reach D1.

## Worker preview

```bash
npm run preview
```

Builds with OpenNext, then runs the Worker locally (wrangler). Use this when you need the production bundle, cron (`/__scheduled`), or Email Service behaviour.

## Env names

See `.dev.vars.example` and the env section in `README.md`. They stay in sync. Email sending has no API key: it uses the `EMAIL` binding.

## Typecheck and lint

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
npm run lint
```
