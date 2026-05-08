-- Job Feed Intelligence — Milestone C2
-- ----------------------------------------------------------------------------
-- Cache of SerpAPI / Google Jobs filter-chip `uds` tokens, discovered from
-- live response payloads. Tokens are stable per (country, filter_name,
-- option_label) tuple but vary by Google's locale rotations, so we cache
-- them and let them refresh naturally each time we see them.
--
-- Used to apply a "Date posted: Past week" filter on most queries without
-- having to hardcode the (undocumented, locale-specific) `uds` strings.
--
-- This is a tiny, public-ish lookup table — keys are non-sensitive locale
-- metadata, not user data — so we can scope reads broadly. Writes only
-- happen via the service role from background ingestion.
-- ----------------------------------------------------------------------------

create table if not exists public.serpapi_filter_tokens (
  -- ISO 3166-1 alpha-2 country code (lowercase). We use the SerpAPI
  -- normalized form here ("uk" not "gb") so the same token applies
  -- whether the discovery came from `gl=uk` or `gl=gb`.
  country_code text not null,
  -- The filter group name as returned by SerpAPI (e.g. "Date posted",
  -- "Type"). Trimmed and lower-cased for stable keying.
  filter_name text not null,
  -- The option label as returned by SerpAPI (e.g. "Past week",
  -- "Past 3 days"). Trimmed and lower-cased.
  option_label text not null,

  -- The token Google Jobs accepts in its `uds` query parameter to apply
  -- this filter chip.
  uds_token text not null,

  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  primary key (country_code, filter_name, option_label)
);

create index if not exists serpapi_filter_tokens_country_filter_idx
  on public.serpapi_filter_tokens(country_code, filter_name);

-- RLS: this table holds only locale metadata (no user data). We allow
-- authenticated reads so client-side debug surfaces can look them up;
-- writes are still gated to the service role via the existing admin
-- client (RLS does not block service-role writes by default in Supabase
-- because the service role bypasses RLS).
alter table public.serpapi_filter_tokens enable row level security;

drop policy if exists "serpapi_filter_tokens_authenticated_read" on public.serpapi_filter_tokens;
create policy "serpapi_filter_tokens_authenticated_read"
  on public.serpapi_filter_tokens
  for select
  using (auth.role() = 'authenticated');
