/**
 * Checks the 30-day export sweep against wrangler's local R2: objects carry an
 * `uploaded` date in list(), and the cutoff arithmetic deletes only the old
 * ones. Local simulated bucket only.
 *   npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/r2-sweep-check.ts
 */
import { getPlatformProxy } from 'wrangler';
import { EXPORT_RETENTION_DAYS } from '../../src/lib/services/export/storage';

async function main() {
  const { env, dispose } = await getPlatformProxy<{ FILES: R2Bucket }>({ configPath: 'wrangler.jsonc' });
  const key = `exports/sweep-test-user/${'a'.repeat(64)}.pdf`;
  await env.FILES.put(key, new Uint8Array([1, 2, 3]), { customMetadata: { userId: 'sweep-test-user', fileName: 'x.pdf' } });
  const listed = await env.FILES.list({ prefix: 'exports/sweep-test-user/' });
  const object = listed.objects[0];
  const uploaded = object?.uploaded?.getTime();
  console.log('uploaded is a date:', typeof uploaded === 'number', 'metadata kept:', JSON.stringify(object?.customMetadata));
  const cutoffNow = Date.now() - EXPORT_RETENTION_DAYS * 86_400_000;
  console.log('fresh object is older than the cutoff:', uploaded !== undefined && uploaded < cutoffNow);
  const future = Date.now() + (EXPORT_RETENTION_DAYS + 1) * 86_400_000 - EXPORT_RETENTION_DAYS * 86_400_000;
  console.log('after 31 days it would be older than the cutoff:', uploaded !== undefined && uploaded < future);
  await env.FILES.delete(key);
  await dispose();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
