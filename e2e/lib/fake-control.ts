import { FAKE_ANTHROPIC_URL } from './env';

export interface FakeMarker { unit: number; where: 'tools' | 'system' | 'message' | 'automatic'; ttl: '5m' | '1h'; prefixHash: string }

export interface FakeCall {
  kind: 'messages' | 'count_tokens';
  /** The endpoint that served the request: the Anthropic API, or the Bedrock mantle path (`/bedrock`). */
  provider: 'anthropic' | 'bedrock';
  /** How the request authenticated. SDK 1.x sends `Authorization: Bearer`. */
  auth: 'bearer' | 'x-api-key' | 'none';
  /** The site or kit writer that asked, read off its system prompt. */
  writer: string;
  at: string;
  stream: boolean;
  /** primaryStreamCut cut this streaming request: the socket was reset after half of the text. */
  streamCut: boolean;
  /** The first message of the request. */
  user: string;
  /** The newest user text and every user text the model was shown. */
  lastUser: string;
  allUserText: string;
  /** The tool_result contents the request carries. */
  toolResults: string[];
  model: string | null;
  /** output_config.effort, and the thinking type ("disabled" or null for adaptive). */
  effort: string | null;
  thinking: string | null;
  toolChoice: string | null;
  tools: string[];
  structuredOutput: boolean;
  maxTokens: number | null;
  messageCount: number;
  /** The role of every message, in order, mid-conversation system messages included. */
  roles: string[];
  /** The text of the mid-conversation system messages (the per-request state), joined by newlines. */
  state: string;
  /** The cache_control markers of the request, in prefix order, each with the hash of the prefix up to it. */
  markers: FakeMarker[];
  /** Hash of everything up to the first marker. Identical across users when the static prefix is. */
  staticPrefixHash: string | null;
  status: number;
  stopReason: string | null;
  usage: { input: number; output: number; cacheCreation: number; cacheRead: number; creation5m: number; creation1h: number; total: number } | null;
  countedTokens: number | null;
  /** The user profile the request named: the header on the Anthropic API, the body field on Bedrock. */
  userProfileId: string | null;
}

/** `url` picks the scripted model: the data lane's by default, the MCP lane's when given MCP_FAKE_URL. */
export async function fakeCalls(url: string = FAKE_ANTHROPIC_URL): Promise<FakeCall[]> {
  const response = await fetch(`${url}/__calls`);
  return (await response.json()) as FakeCall[];
}

export async function fakeReset(url: string = FAKE_ANTHROPIC_URL): Promise<void> {
  await fetch(`${url}/__reset`);
}

export interface FakeControl {
  failWriter?: string | string[] | null;
  delayMs?: number;
  /** Force the input size: count_tokens returns it and so does the usage of a messages call. null clears it. */
  inputTokens?: number | null;
  /** Limit the override to one writer. */
  inputTokensFor?: string | null;
  /** Answer this many messages calls of the writer with their real size before the override applies. */
  skipCalls?: number;
  /**
   * Make the Anthropic endpoint (never Bedrock) answer `status` (529 overloaded; 400 invalid_request; 503 and 500 api_error) to the next
   * `count` messages requests, after letting `skip` through, for one writer or all. The SDK retries once, so one
   * logical call is two requests: count 2 fails one call, count 4 fails two. null clears it.
   */
  primaryFail?: { status: 529 | 503 | 500 | 400; count: number; skip?: number; writer?: string } | null;
  /**
   * Cut the next `count` STREAMING requests to the Anthropic endpoint (never Bedrock) after the headers: 200,
   * message_start, half of the text, then the socket is reset. `skip` lets that many streaming requests through first,
   * `writer` limits it to one writer. The SDK does not retry after the headers, so count 1 cuts one logical call.
   */
  primaryStreamCut?: { count: number; skip?: number; writer?: string } | null;
  /** POST /v1/user_profiles answers `status` to the next `count` creates. null clears it. */
  profileCreateFail?: { status: 500 | 529 | 400; count: number } | null;
  /** Hold every profile create this long before answering. */
  profileCreateHoldMs?: number;
  /** DELETE /v1/user_profiles/{id} answers `status` to the next `count` deletes. null clears it. */
  profileDeleteFail?: { status: 500 | 503; count: number } | null;
}

export async function fakeControl(body: FakeControl, url: string = FAKE_ANTHROPIC_URL): Promise<void> {
  const response = await fetch(`${url}/__control`, { method: 'POST', body: JSON.stringify(body) });
  if (!response.ok) throw new Error('fake model control call failed');
}

export interface FakeProfile { id: string; referenceId: string | null; accessType: string; createdAt: string; deletedAt: string | null; enforcement: 'unrestricted' | 'banned' }
export interface FakeProfileEvent { kind: 'create' | 'delete' | 'retrieve'; id: string | null; referenceId: string | null; status: number; at: string }

/** Every user profile the fake holds (they outlive /__reset) and every create, delete and retrieve it answered. */
export async function fakeProfiles(url: string = FAKE_ANTHROPIC_URL): Promise<{ profiles: FakeProfile[]; events: FakeProfileEvent[] }> {
  const response = await fetch(`${url}/__profiles`);
  return (await response.json()) as { profiles: FakeProfile[]; events: FakeProfileEvent[] };
}

/** Add a profile created elsewhere, so the fake accepts its id (a race's winner from another isolate). */
export async function fakeAddProfile(id: string, referenceId: string, url: string = FAKE_ANTHROPIC_URL): Promise<void> {
  const response = await fetch(`${url}/__profiles`, { method: 'POST', body: JSON.stringify({ id, referenceId }) });
  if (!response.ok) throw new Error(`fake profile add failed: ${await response.text()}`);
}

/** Ban a profile the fake holds: a request naming it then gets a 400 that names the id, and a retrieve shows the ban. */
export async function fakeBanProfile(id: string, url: string = FAKE_ANTHROPIC_URL): Promise<void> {
  const response = await fetch(`${url}/__profiles`, { method: 'POST', body: JSON.stringify({ id, enforcement: 'banned' }) });
  if (!response.ok) throw new Error(`fake profile ban failed: ${await response.text()}`);
}
