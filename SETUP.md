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
| `BROWSER` | Browser Run | CV and cover letter PDFs (`src/lib/services/export`). `quickAction` does not run in plain local dev: set `"remote": true` on the binding locally, never commit it |
| `RATE_LIMIT_*` | Rate Limiting | one binding per API bucket |
| `ASSETS` | Assets | OpenNext static assets |
| `WORKER_SELF_REFERENCE` | Service | self-call for ISR |

Compatibility flags: `nodejs_compat`, `global_fetch_strictly_public`. Auth secrets (`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are Worker secrets, not wrangler vars. So is `EXPORT_SIGNING_SECRET` (HMAC key for the 15-minute signed download links of exported CVs and letters; `npx wrangler secret put EXPORT_SIGNING_SECRET`).

## First-time local D1

```bash
npx wrangler d1 migrations apply usefulapply-db --local
```

This applies `migrations/d1/*.sql` to the local Miniflare D1 that `npm run dev` and `npm run preview` share.

## Admin dashboard access

The admin dashboard lives at `/admin-dashboard` and validates Cloudflare Access JWTs inside the Worker. In production it is served only at `admin.usefulapply.com` (the Worker redirects `/` to `/admin-dashboard` on that host). A self-hosted Access application ("Useful Apply Admin Dashboard") covers that hostname with a default-deny policy that allows only the administrator email via one-time PIN. On the apex and www the path carries no Access JWT, so the in-app check returns a 404.

Set these Worker secrets:

- `CLOUDFLARE_ACCESS_ISSUER`: the HTTPS team issuer ending in `.cloudflareaccess.com`
- `CLOUDFLARE_ACCESS_AUD`: the Access application audience tag
- `CLOUDFLARE_ACCESS_ADMIN_EMAILS`: comma-separated Access email identities allowed to administer the app
- `CLOUDFLARE_ACCESS_ADMIN_SUBJECTS`: optional comma-separated stable Access JWT subject IDs for additional identities
- `ADMIN_METRICS_HASH_KEY`: a random key used to HMAC pseudonymous metric subjects

Configure the same email identity in the Cloudflare Access policy and require the one-time PIN identity provider. A subject ID is available from the Access identity endpoint after authentication. `CLOUDFLARE_ACCESS_DEV_BYPASS=true` is accepted only in development on `localhost` or `127.0.0.1` when the request also supplies the `CLOUDFLARE_ACCESS_DEV_BYPASS_KEY` value in `x-usefulapply-admin-dev-key`. Never set either bypass variable in production.

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
