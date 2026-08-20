// default open-next.config.ts file created by @opennextjs/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";

export default defineCloudflareConfig({
	incrementalCache: r2IncrementalCache,
	// Without a queue this resolves to "dummy", whose send() throws, so every
	// stale page logged "Failed to revalidate stale page". Nothing was broken,
	// Next revalidates through its own background path, but the log was noise
	// from the moment pages got a real revalidate. This is what the
	// WORKER_SELF_REFERENCE binding in wrangler.jsonc was added for.
	queue: memoryQueue,
});
