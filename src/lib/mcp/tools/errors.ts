import { CvParseError } from '@/lib/cv-parser/parse-cv-core';
import {
  ExportInputError,
  ExportRateLimitedError,
  ExportRenderError,
  ExportTooLargeError,
  SigningUnavailableError,
} from '@/lib/services/export';
import {
  IdempotencyKeyMismatch,
  InsufficientCreditsError,
  InvalidInputError,
  KitAlreadyGeneratedError,
  NotFoundError,
  OperationFailedEarlierError,
  OperationLimitReached,
  PermanentOperationError,
  ReservationConflictError,
  RevisionConflict,
  SpendLimitReachedError,
} from '@/lib/services/errors';
import { RegenerateRequestError } from '@/lib/services/regenerate';

/** The one place a tool result may mention a plans page: informational, never a checkout. */
export const PLANS_URL = 'https://usefulapply.com/pricing';

/** An expected refusal with a message safe to show. Carries a short code for analytics. */
export class ToolError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export interface ToolFailure {
  message: string;
  /** A short, content-free class for analytics and logs: never a message from an internal error. */
  errorClass: string;
}

const GENERIC = 'Something went wrong. Try again in a moment.';

function credits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Turn anything a tool body threw into a message that is specific about what
 * the caller can do and says nothing about internals: no stack, no SQL, no
 * `error.message` from a library. Unknown errors are the generic line.
 */
export function toToolFailure(error: unknown): ToolFailure {
  if (error instanceof ToolError) return { message: error.message, errorClass: error.code };
  if (error instanceof NotFoundError) {
    return { message: `${error.message}. It may have been deleted, or it belongs to another account.`, errorClass: 'not_found' };
  }
  if (error instanceof InvalidInputError) return { message: error.message, errorClass: 'invalid_input' };
  if (error instanceof RevisionConflict) {
    const now = error.currentRevision !== null ? ` and is now at revision ${error.currentRevision}` : '';
    return {
      message: `The application changed after the revision you sent${now}. Read it again and retry with the current revision.`,
      errorClass: 'revision_conflict',
    };
  }
  if (error instanceof IdempotencyKeyMismatch) {
    return { message: 'This idempotencyKey was already used with different input. Use a new key for a different request.', errorClass: 'idempotency_mismatch' };
  }
  if (error instanceof OperationFailedEarlierError) {
    return { message: 'A request with this idempotencyKey failed earlier and its credits were returned. Send it again with a new idempotencyKey.', errorClass: 'operation_failed_earlier' };
  }
  if (error instanceof OperationLimitReached) {
    return { message: `${error.limit} operations of this kind are already running. Wait for one to finish, or cancel one.`, errorClass: 'operation_limit' };
  }
  if (error instanceof InsufficientCreditsError) {
    return {
      message: `Not enough credits: ${credits(error.required)} needed, ${credits(error.available)} available. Plans are listed at ${PLANS_URL}.`,
      errorClass: 'insufficient_credits',
    };
  }
  if (error instanceof SpendLimitReachedError) {
    return {
      message: `The daily agent credit limit is reached: ${credits(error.spent)} of ${credits(error.limit)} credits used today (UTC day). It resets at 00:00 UTC. The account owner can change the limit under Settings, Connected apps.`,
      errorClass: 'daily_limit',
    };
  }
  if (error instanceof ReservationConflictError) {
    return {
      message: error.code === 'REQUEST_IN_PROGRESS'
        ? 'The same request is already running. Poll get_operation or wait.'
        : 'This idempotencyKey was already used by a request that finished. Use a new key for a new request.',
      errorClass: error.code.toLowerCase(),
    };
  }
  if (error instanceof KitAlreadyGeneratedError) {
    return { message: 'This application already has a kit. Pass regenerate: true to replace it.', errorClass: 'kit_exists' };
  }
  if (error instanceof PermanentOperationError) return { message: 'The operation could not run.', errorClass: error.code };
  if (error instanceof RegenerateRequestError) return { message: error.message, errorClass: (error.code ?? 'bad_request').toLowerCase() };
  if (error instanceof CvParseError) {
    return error.status === 400
      ? { message: error.message, errorClass: 'cv_parse_input' }
      : { message: 'The CV could not be read. Try a different file or paste the text.', errorClass: 'cv_parse_failed' };
  }
  if (error instanceof ExportInputError) {
    const message = error.code === 'NOT_FOUND' ? 'Application not found.' : error.message;
    return { message, errorClass: `export_${error.code.toLowerCase()}` };
  }
  if (error instanceof ExportRateLimitedError) {
    return { message: 'Too many exports. Try again in a minute.', errorClass: 'export_rate_limited' };
  }
  if (error instanceof ExportTooLargeError) return { message: 'The document is too large to export.', errorClass: 'export_too_large' };
  if (error instanceof ExportRenderError || error instanceof SigningUnavailableError) {
    return { message: 'The document renderer is unavailable right now. Try again later.', errorClass: 'export_unavailable' };
  }
  return { message: GENERIC, errorClass: 'internal' };
}
