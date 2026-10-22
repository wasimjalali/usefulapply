/**
 * The two ways to reach Claude, and the one rule for moving between them.
 *
 * Primary: the Anthropic API (`ANTHROPIC_API_KEY`, optional `ANTHROPIC_BASE_URL`), SDK retries 1.
 * Failover: Claude in Amazon Bedrock (the "mantle" endpoint, same Messages API, same models, ids prefixed
 * `anthropic.`), SDK retries 2. It is configured only by explicit credentials in the environment:
 * `AWS_BEARER_TOKEN_BEDROCK`, or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` (+ `AWS_SESSION_TOKEN`).
 * The AWS credential provider chain is never used (a Worker has no AWS config files), and without
 * credentials failover is off: logged once, nothing throws. Region: `BEDROCK_REGION`, then `AWS_REGION`,
 * then us-east-1. `ANTHROPIC_BEDROCK_MANTLE_BASE_URL` overrides the endpoint (the SDK reads it; E2E uses it).
 *
 * `runWithFailover` is the single helper every call path uses. It tries the primary; on a failover error
 * (a network failure or a 5xx, after the SDK's own retries) it sends the SAME request to Bedrock once. It
 * is per call: the next call starts on the primary again, except that a caller can pin a call to one provider
 * (the chat tool loop pins its later rounds to Bedrock once Bedrock answered, so Bedrock-signed thinking blocks
 * never reach the direct API). The caller's `attempt` owns the
 * ledger row, so the failed primary attempt and the Bedrock attempt each get their own.
 *
 * Cost on Bedrock is priced at the direct-API list prices (the global endpoint). Regional endpoints carry a
 * 10% premium over that, which is not modelled.
 */
import Anthropic, { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from '@anthropic-ai/sdk';
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import { getPostHogServer } from '@/lib/posthog-server';

export type ProviderName = 'anthropic' | 'bedrock';

/** The slice of the SDK every call path uses. Both `Anthropic` and `AnthropicBedrockMantle` satisfy it. */
export interface MessagesClient {
  messages: Anthropic['messages'];
  beta: { messages: Anthropic['beta']['messages'] };
}

/** Bedrock ids for the models the app calls. Anything else cannot fail over. */
export const BEDROCK_MODEL_IDS = {
  'claude-sonnet-5-5': 'anthropic.claude-sonnet-5-5',
  'claude-haiku-5-5': 'anthropic.claude-haiku-5-5',
} as const satisfies Record<string, string>;

export function bedrockModelId(model: string): string {
  const id = (BEDROCK_MODEL_IDS as Record<string, string>)[model];
  if (!id) throw new Error(`No Bedrock model id for "${model}": it cannot fail over to Amazon Bedrock`);
  return id;
}

// -------------------------------------------------------------------------------------------------
// Clients (read from the environment at call time, cached by what they were built from)
// -------------------------------------------------------------------------------------------------

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

let primaryCache: { key: string; client: Anthropic } | null = null;
let bedrockCache: { key: string; client: AnthropicBedrockMantle } | null = null;
let bedrockStateLogged = false;

/** Drop cached clients and the log-once flag. For tests that change the environment. */
export function resetProviderCachesForTests(): void {
  primaryCache = null;
  bedrockCache = null;
  bedrockStateLogged = false;
}

/** The Anthropic API client. Throws at call time when ANTHROPIC_API_KEY is missing. */
export function getPrimaryClient(): Anthropic {
  const apiKey = env('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set: the Anthropic API key is required');
  // The base URL comes from ANTHROPIC_BASE_URL, which the SDK reads itself.
  const key = `${apiKey}|${env('ANTHROPIC_BASE_URL') ?? ''}`;
  if (!primaryCache || primaryCache.key !== key) {
    primaryCache = { key, client: new Anthropic({ apiKey, maxRetries: 1 }) };
  }
  return primaryCache.client;
}

type BedrockCredentials =
  | { kind: 'bearer'; token: string }
  | { kind: 'keys'; accessKey: string; secretKey: string; sessionToken: string | undefined };

function bedrockCredentials(): BedrockCredentials | null {
  const token = env('AWS_BEARER_TOKEN_BEDROCK');
  if (token) return { kind: 'bearer', token };
  const accessKey = env('AWS_ACCESS_KEY_ID');
  const secretKey = env('AWS_SECRET_ACCESS_KEY');
  if (accessKey && secretKey) return { kind: 'keys', accessKey, secretKey, sessionToken: env('AWS_SESSION_TOKEN') };
  return null;
}

function bedrockRegion(): string {
  return env('BEDROCK_REGION') ?? env('AWS_REGION') ?? 'us-east-1';
}

/** True when explicit Bedrock credentials are in the environment. */
export function bedrockConfigured(): boolean {
  return bedrockCredentials() !== null;
}

/** Log once whether failover is on, so a missing credential is visible without being an error. */
export function logBedrockStateOnce(): void {
  if (bedrockStateLogged) return;
  bedrockStateLogged = true;
  const credentials = bedrockCredentials();
  console.log(credentials
    ? `[providers] Bedrock failover is on (region ${bedrockRegion()}, ${credentials.kind === 'bearer' ? 'bearer token' : 'AWS keys'})`
    : '[providers] Bedrock failover is off: set AWS_BEARER_TOKEN_BEDROCK, or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, to enable it');
}

/** The Bedrock client, or null when no credentials are configured (failover off). */
export function getBedrockClient(): AnthropicBedrockMantle | null {
  const credentials = bedrockCredentials();
  const region = bedrockRegion();
  if (!credentials) return null;

  const key = JSON.stringify([credentials, region, env('ANTHROPIC_BEDROCK_MANTLE_BASE_URL') ?? '']);
  if (!bedrockCache || bedrockCache.key !== key) {
    bedrockCache = {
      key,
      client: new AnthropicBedrockMantle({
        awsRegion: region,
        maxRetries: 2,
        // Explicit credentials only. The resolver is the one door to the AWS provider chain, so it refuses.
        providerChainResolver: async () => {
          throw new Error('The AWS credential provider chain is not used: set explicit Bedrock credentials');
        },
        ...(credentials.kind === 'bearer'
          ? { apiKey: credentials.token }
          : {
              awsAccessKey: credentials.accessKey,
              awsSecretAccessKey: credentials.secretKey,
              ...(credentials.sessionToken && { awsSessionToken: credentials.sessionToken }),
            }),
      }),
    };
  }
  return bedrockCache.client;
}

// -------------------------------------------------------------------------------------------------
// Which errors fail over
// -------------------------------------------------------------------------------------------------

const notEligible = new WeakSet<object>();

/**
 * Mark an error so it never triggers failover. Used where Bedrock was already tried for a sub-step
 * (the count_tokens budget guard), so the call must not try it a second time.
 */
export function markNotFailoverEligible<E>(error: E): E {
  if (error !== null && typeof error === 'object') notEligible.add(error);
  return error;
}

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && Number.isInteger(status) ? status : null;
}

function isStreamServerFault(error: unknown): boolean {
  // A stream `error` event arrives on a 200 response, so it has no status, only a type.
  if (!(error instanceof APIError) || error.status !== undefined) return false;
  return error.type === 'overloaded_error' || error.type === 'api_error' || error.type === 'timeout_error';
}

/**
 * True only for failures of the route to the model, after the SDK's own retries: network failures
 * (APIConnectionError, APIConnectionTimeoutError), any 5xx including 529 overloaded, and a stream error
 * event that says overloaded_error, api_error or timeout_error. False for every 4xx, refusals and other
 * ModelStopErrors, the input budget guard, JSON or schema failures, and aborts. Unknown things are false.
 */
export function isFailoverError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  if (notEligible.has(error)) return false;
  if (error instanceof APIUserAbortError || (error as { name?: unknown }).name === 'AbortError') return false;
  if (error instanceof APIConnectionError) return true; // includes APIConnectionTimeoutError
  const status = statusOf(error);
  if (status !== null) return status >= 500;
  return isStreamServerFault(error);
}

export type FailoverErrorKind = 'connection_timeout' | 'connection_error' | 'overloaded' | 'server_error';

export function failoverErrorKind(error: unknown): FailoverErrorKind {
  if (error instanceof APIConnectionError) {
    return error instanceof APIConnectionTimeoutError ? 'connection_timeout' : 'connection_error';
  }
  if (statusOf(error) === 529 || (error instanceof APIError && error.type === 'overloaded_error')) return 'overloaded';
  return 'server_error';
}

export function failoverHttpStatus(error: unknown): number | null {
  return statusOf(error);
}

// -------------------------------------------------------------------------------------------------
// The helper
// -------------------------------------------------------------------------------------------------

export interface FailoverInfo {
  /** The call site: a Haiku site, or the operation of a Sonnet call. */
  site: string;
  operation: string | null;
  /** The primary model id the call asked for. */
  model: string;
  bedrockModel: string;
  primaryErrorKind: FailoverErrorKind;
  primaryHttpStatus: number | null;
  context: LlmGenerationContext | null;
}

export interface FailoverTarget<C> {
  provider: ProviderName;
  /** The model id to send: the primary id, or its Bedrock id. */
  model: string;
  /** Builds the client for this attempt. Called inside the attempt so a missing key is that attempt's error. */
  getClient: () => C;
}

export interface FailoverArgs<C, T> {
  site: string;
  model: string;
  context?: LlmGenerationContext;
  primary: () => C;
  /** null when Bedrock is not configured. */
  bedrock: () => C | null;
  attempt: (target: FailoverTarget<C>) => Promise<T>;
  /**
   * Skip the choice: 'bedrock' goes straight to Bedrock, 'anthropic' stays on the primary. Either way a failure
   * is a failure: no hop to the other provider. Used inside one request's multi-round loop so assistant content
   * signed by one provider (thinking blocks) is never sent to the other.
   */
  pin?: ProviderName;
  /** Return false once part of the answer reached the caller: a failure after that stays a failure. */
  canFailOver?: () => boolean;
  onFailover?: (info: FailoverInfo) => Promise<void> | void;
}

/** The PostHog `llm_provider_failover` event, captured like `$ai_generation` (counts and labels only). */
export async function captureFailoverEvent(
  info: FailoverInfo,
  capture: (event: { distinctId: string; event: string; properties: Record<string, unknown> }) => Promise<void> = capturePostHog,
): Promise<void> {
  const userId = info.context?.userId ?? null;
  const properties: Record<string, unknown> = {
    site: info.site,
    operation: info.operation,
    model: info.model,
    bedrock_model: info.bedrockModel,
    primary_error_kind: info.primaryErrorKind,
    primary_http_status: info.primaryHttpStatus,
    feature: info.context?.feature ?? null,
    route: info.context?.route ?? null,
    ...(userId ? {} : { $process_person_profile: false }),
  };
  await capture({ distinctId: userId ?? 'unattributed', event: 'llm_provider_failover', properties });
}

async function capturePostHog(event: { distinctId: string; event: string; properties: Record<string, unknown> }): Promise<void> {
  const posthog = getPostHogServer();
  posthog.capture(event);
  await posthog.flush();
}

export async function runWithFailover<C, T>(args: FailoverArgs<C, T>): Promise<T> {
  logBedrockStateOnce();
  if (args.pin === 'bedrock') {
    const bedrock = args.bedrock();
    if (!bedrock) throw new Error('This request is pinned to Amazon Bedrock but Bedrock is not configured');
    return await args.attempt({ provider: 'bedrock', model: bedrockModelId(args.model), getClient: () => bedrock });
  }
  if (args.pin === 'anthropic') {
    return await args.attempt({ provider: 'anthropic', model: args.model, getClient: args.primary });
  }
  try {
    return await args.attempt({ provider: 'anthropic', model: args.model, getClient: args.primary });
  } catch (error) {
    if (!isFailoverError(error)) throw error;
    if (args.canFailOver && !args.canFailOver()) throw error;
    const bedrock = args.bedrock();
    if (!bedrock) throw error; // failover is off: today's failure path

    let bedrockModel: string;
    try {
      bedrockModel = bedrockModelId(args.model);
    } catch (mapError) {
      throw new Error(
        `${mapError instanceof Error ? mapError.message : String(mapError)} (primary failed: ${error instanceof Error ? error.message : String(error)})`,
        { cause: error },
      );
    }

    const info: FailoverInfo = {
      site: args.site,
      operation: args.context?.operation ?? null,
      model: args.model,
      bedrockModel,
      primaryErrorKind: failoverErrorKind(error),
      primaryHttpStatus: failoverHttpStatus(error),
      context: args.context ?? null,
    };
    console.warn(JSON.stringify({
      event: 'llm_provider_failover',
      site: info.site,
      operation: info.operation,
      model: info.model,
      bedrock_model: info.bedrockModel,
      primary_error_kind: info.primaryErrorKind,
      primary_http_status: info.primaryHttpStatus,
    }));
    try {
      await (args.onFailover ?? ((i: FailoverInfo) => captureFailoverEvent(i)))(info);
    } catch (captureError) {
      // Observability must not decide whether the user gets an answer, but a lost event is logged.
      console.error('[providers] llm_provider_failover capture failed', captureError);
    }

    return await args.attempt({ provider: 'bedrock', model: bedrockModel, getClient: () => bedrock });
  }
}
