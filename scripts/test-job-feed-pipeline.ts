/**
 * Job Feed Pipeline Test Script
 *
 * Runs the full job feed pipeline outside of Next.js:
 *   1. Load env vars from .env.local
 *   2. Read user settings from Supabase
 *   3. Build search plan
 *   4. Fetch jobs from SerpAPI
 *   5. Run prefilter
 *   6. Run LLM ranking (Claude Haiku 5.5 on the Anthropic API; without ANTHROPIC_API_KEY or if the call fails, the deterministic order)
 *   7. Persist results
 *
 * Usage:
 *   npx tsx scripts/test-job-feed-pipeline.ts
 *   npx tsx scripts/test-job-feed-pipeline.ts --dry-run    # skip persist + LLM
 *   npx tsx scripts/test-job-feed-pipeline.ts --force       # re-run even if today already ran
 *   npx tsx scripts/test-job-feed-pipeline.ts --env-check   # just verify env vars
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually (no dotenv dependency)
function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let val = trimmed.slice(eqIndex + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    console.error(`Failed to read ${filePath}`);
  }
}

loadEnvFile(resolve(__dirname, '..', '.env.local'));

// ---------------------------------------------------------------------------
// Env check
// ---------------------------------------------------------------------------
const ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SERPAPI_API_KEY',
] as const;

function printEnvStatus() {
  console.log('\n=== Environment Variables ===');
  for (const key of ENV_KEYS) {
    const val = process.env[key];
    const status = val ? `✅  set (${val.slice(0, 8)}…)` : '❌  MISSING';
    console.log(`  ${key}: ${status}`);
  }
  console.log();
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const envCheckOnly = args.includes('--env-check');

printEnvStatus();

const requiredVars = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SERPAPI_API_KEY'];
const missing = requiredVars.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
  console.error('   Make sure .env.local exists and has these values.');
  process.exit(1);
}

if (envCheckOnly) {
  console.log('✅ All required env vars present. Exiting (--env-check mode).');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Now import the pipeline modules (after env is loaded)
// ---------------------------------------------------------------------------
async function main() {
  // Dynamic imports so env is available at module load time
  const { createClient } = await import('@supabase/supabase-js');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // --- Step 1: Find the user ---
  console.log('=== Step 1: Finding user ===');
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) {
    console.error('❌ Failed to list users:', usersError.message);
    process.exit(1);
  }
  const user = users.users.find((u) => u.email === 'wasim@karkoai.com');
  if (!user) {
    console.error('❌ User wasim@karkoai.com not found');
    process.exit(1);
  }
  console.log(`  ✅ User: ${user.email} (${user.id})`);

  // --- Step 2: Check profile tier ---
  console.log('\n=== Step 2: Checking profile ===');
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single();
  console.log(`  Subscription tier: ${profile?.subscription_tier ?? 'NULL'}`);
  if (!profile?.subscription_tier || !['plus', 'max'].includes(profile.subscription_tier)) {
    console.error('❌ Tier must be plus or max');
    process.exit(1);
  }
  console.log('  ✅ Tier OK');

  // --- Step 3: Load feed settings ---
  console.log('\n=== Step 3: Loading job feed settings ===');
  const { data: settings, error: settingsError } = await supabase
    .from('job_feed_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (settingsError) {
    console.error('❌ Failed to load settings:', settingsError.message);
    process.exit(1);
  }
  if (!settings) {
    console.error('❌ No job_feed_settings row found. Complete the onboarding wizard first.');
    process.exit(1);
  }
  console.log(`  Enabled: ${settings.enabled}`);
  console.log(`  Consent: ${settings.consent_accepted_at ? '✅' : '❌ missing'}`);
  console.log(`  Timezone: ${settings.user_timezone}`);
  console.log(`  Delivery hour: ${settings.delivery_hour_local}:00`);
  console.log(`  Target roles: ${JSON.stringify(settings.target_roles)}`);
  console.log(`  Countries: ${JSON.stringify(settings.target_countries)}`);
  console.log(`  Cities: ${JSON.stringify(settings.target_cities)}`);
  console.log(`  Remote prefs: ${JSON.stringify(settings.remote_preferences)}`);
  console.log(`  Seniority: ${JSON.stringify(settings.seniority_targets)}`);
  console.log(`  Employment: ${JSON.stringify(settings.employment_types)}`);
  console.log(`  Skills: ${(settings.user_skills ?? []).length} skills`);
  console.log(`  Aggressiveness: ${settings.aggressiveness}`);

  if (!settings.enabled) {
    console.error('❌ Feed is disabled');
    process.exit(1);
  }
  if (!settings.consent_accepted_at) {
    console.error('❌ Consent not accepted');
    process.exit(1);
  }
  if (!settings.target_roles?.length) {
    console.error('❌ No target roles configured');
    process.exit(1);
  }

  // --- Step 4: Check existing runs ---
  console.log('\n=== Step 4: Checking existing runs ===');
  const { data: runs } = await supabase
    .from('job_feed_runs')
    .select('id, local_date, status, trigger_source, raw_jobs_fetched, ranked_jobs_count, error_message, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);
  if (runs && runs.length > 0) {
    console.log(`  Found ${runs.length} recent runs:`);
    for (const run of runs) {
      console.log(`    ${run.local_date} | ${run.status} | fetched=${run.raw_jobs_fetched ?? '?'} ranked=${run.ranked_jobs_count ?? '?'} | ${run.trigger_source} | ${run.error_message ?? 'no error'}`);
    }
  } else {
    console.log('  No previous runs found.');
  }

  // --- Step 5: Build search plan ---
  console.log('\n=== Step 5: Building search plan ===');
  const tierLimits = profile.subscription_tier === 'max'
    ? { maxDailyQueries: 4, maxRawJobsPerRun: 40, prefilterHardCap: 15, visibleCount: 10 }
    : { maxDailyQueries: 2, maxRawJobsPerRun: 20, prefilterHardCap: 10, visibleCount: 5 };

  // Build plan manually to avoid import issues with path aliases
  const countries = (settings.target_countries && settings.target_countries.length > 0)
    ? settings.target_countries
    : ['us'];
  const maxRoles = Math.max(1, Math.floor(tierLimits.maxDailyQueries / countries.length));
  const roles = (settings.target_roles as string[]).slice(0, maxRoles);

  const searchPlan = roles.flatMap((role: string) =>
    countries.map((country: string) => ({
      query: role,
      country,
      language: 'en',
      location: null as string | null,
    }))
  ).slice(0, tierLimits.maxDailyQueries);

  console.log(`  Tier: ${profile.subscription_tier} (${tierLimits.maxDailyQueries} queries, ${tierLimits.maxRawJobsPerRun} max jobs)`);
  console.log(`  Search plan (${searchPlan.length} queries):`);
  for (const item of searchPlan) {
    console.log(`    "${item.query}" in ${item.country}${item.location ? ` (${item.location})` : ''}`);
  }

  if (dryRun) {
    console.log('\n=== DRY RUN — skipping SerpAPI calls and LLM ranking ===');
    console.log('✅ Configuration looks good. Run without --dry-run to execute the full pipeline.');
    process.exit(0);
  }

  // --- Step 6: Call SerpAPI ---
  console.log('\n=== Step 6: Fetching jobs from SerpAPI ===');
  const apiKey = process.env.SERPAPI_API_KEY!;
  let totalJobs = 0;
  const allJobs: Array<{ title: string; company: string; location: string; work_mode: string }> = [];

  for (const item of searchPlan) {
    const countryCode = item.country === 'gb' ? 'uk' : item.country;
    const googleDomains: Record<string, string> = {
      us: 'google.com', uk: 'google.co.uk', de: 'google.de', ca: 'google.ca',
      fr: 'google.fr', nl: 'google.nl', au: 'google.com.au', in: 'google.co.in',
      sg: 'google.com.sg', ae: 'google.ae', ch: 'google.ch', ie: 'google.ie',
      es: 'google.es', it: 'google.it', at: 'google.at', be: 'google.be',
      dk: 'google.dk', se: 'google.se', no: 'google.no', fi: 'google.fi',
      pl: 'google.pl', nz: 'google.co.nz',
    };
    const countryNames: Record<string, string> = {
      us: 'United States', uk: 'United Kingdom', de: 'Germany', ca: 'Canada',
      fr: 'France', nl: 'Netherlands', au: 'Australia', in: 'India',
      sg: 'Singapore', ae: 'United Arab Emirates', ch: 'Switzerland', ie: 'Ireland',
      es: 'Spain', it: 'Italy', at: 'Austria', be: 'Belgium',
      dk: 'Denmark', se: 'Sweden', no: 'Norway', fi: 'Finland',
      pl: 'Poland', nz: 'New Zealand',
    };
    const params = new URLSearchParams({
      engine: 'google_jobs',
      q: item.query,
      gl: countryCode,
      hl: item.language,
      google_domain: googleDomains[countryCode] || 'google.com',
      location: item.location || countryNames[countryCode] || 'United States',
      api_key: apiKey,
    });

    try {
      console.log(`  Fetching: "${item.query}" in ${item.country}...`);
      const response = await fetch(`https://serpapi.com/search?${params.toString()}`, { cache: 'no-store' as RequestCache });

      if (!response.ok) {
        const body = await response.text();
        console.error(`    ❌ HTTP ${response.status}: ${body.slice(0, 200)}`);
        continue;
      }

      const data = await response.json();

      if (data.error) {
        console.log(`    ⚠️  SerpAPI message: ${data.error}`);
        continue;
      }

      const jobs = data.jobs_results ?? [];
      console.log(`    ✅ Got ${jobs.length} jobs`);
      totalJobs += jobs.length;

      for (const job of jobs.slice(0, 5)) {
        const workMode = job.detected_extensions?.work_from_home ? 'remote'
          : job.location?.toLowerCase().includes('remote') ? 'remote'
          : 'onsite';
        allJobs.push({
          title: job.title,
          company: job.company_name,
          location: job.location,
          work_mode: workMode,
        });
        console.log(`      • ${job.title} @ ${job.company_name} (${job.location}) [${workMode}]`);
      }
      if (jobs.length > 5) {
        console.log(`      ... and ${jobs.length - 5} more`);
      }
    } catch (err) {
      console.error(`    ❌ Fetch error:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\n  Total jobs fetched: ${totalJobs}`);

  if (totalJobs === 0) {
    console.log('\n❌ No jobs returned from SerpAPI. Check:');
    console.log('   - Is SERPAPI_API_KEY valid? (check serpapi.com dashboard)');
    console.log('   - Are the target roles too specific?');
    console.log('   - Is the country setting correct?');
    process.exit(1);
  }

  // --- Step 7: Check LLM ranking credentials ---
  console.log('\n=== Step 7: LLM Ranking ===');
  console.log('  Ranking calls Claude Haiku 5.5 on the Anthropic API (a paid call) and needs ANTHROPIC_API_KEY.');
  console.log('  Without it, or if the call fails, the run stores the deterministic order (llm_failed_fallback).');

  // --- Step 8: Run the full workflow via the real pipeline ---
  console.log('\n=== Step 8: Running full pipeline ===');
  console.log('  Calling runJobFeedFoundationWorkflow() with force=' + force + '...\n');

  // Use dynamic import with path resolution for tsx
  const serverModule = await import('../src/lib/job-feed/server.js');
  const result = await serverModule.runJobFeedFoundationWorkflow({
    userId: user.id,
    triggerSource: force ? 'manual_debug_force' : 'manual_debug',
    now: new Date(),
    force,
    orchestrator: 'direct',
  });

  console.log('\n=== Pipeline Result ===');
  console.log(`  Run ID: ${result.run.id}`);
  console.log(`  Status: ${result.run.status}`);
  console.log(`  Created: ${result.created}`);
  console.log(`  Skipped: ${result.skipped}`);
  console.log(`  Raw jobs fetched: ${result.run.raw_jobs_fetched ?? 0}`);
  console.log(`  Jobs after prefilter: ${result.run.jobs_after_prefilter ?? 0}`);
  console.log(`  Ranked jobs: ${result.run.ranked_jobs_count ?? 0}`);
  console.log(`  Summary: ${result.run.result_summary ?? 'none'}`);
  if (result.run.error_message) {
    console.log(`  Error: ${result.run.error_message}`);
  }

  // --- Step 9: Verify ranked items in DB ---
  console.log('\n=== Step 9: Verifying ranked items in DB ===');
  const { data: rankedItems } = await supabase
    .from('job_feed_ranked_items')
    .select('rank_position, fit_label, ranking_source, reason, canonical_job_id')
    .eq('run_id', result.run.id)
    .order('rank_position', { ascending: true });

  if (rankedItems && rankedItems.length > 0) {
    console.log(`  ✅ ${rankedItems.length} ranked items persisted:`);
    for (const item of rankedItems) {
      const { data: job } = await supabase
        .from('job_feed_canonical_jobs')
        .select('title, company')
        .eq('id', item.canonical_job_id)
        .single();
      console.log(`    #${item.rank_position} [${item.fit_label}] ${job?.title ?? '?'} @ ${job?.company ?? '?'} (${item.ranking_source}) ${item.reason ?? ''}`);
    }
  } else {
    console.log('  ⚠️  No ranked items found for this run.');
  }

  console.log('\n✅ Pipeline test complete!');
  console.log('   Now refresh the Job Feed tab in the dashboard to see the results.');
}

main().catch((err) => {
  console.error('\n❌ Pipeline failed:', err);
  process.exit(1);
});
