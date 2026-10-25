/**
 * A refusal from the feed services with the status and the message the web routes have always
 * returned for it. Routes turn it into `NextResponse.json({ error }, { status })`; the MCP tools
 * turn it into a ToolError. `code` is a short, content-free class for analytics.
 */
export class FeedError extends Error {
  /** For a stale settings save: the revision now saved, so the caller can say what to read again. */
  currentRevision?: number | null;

  constructor(readonly status: number, message: string, readonly code: string) {
    super(message);
    this.name = 'FeedError';
  }
}
