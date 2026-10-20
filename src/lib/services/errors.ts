/**
 * Typed errors for the service layer. Leaf module: no imports, so the repos can
 * throw or return them without a dependency cycle.
 */

/** A revisioned write found the application at a different revision than the writer loaded. */
export class RevisionConflict extends Error {
  readonly code = 'REVISION_CONFLICT' as const;
  constructor(readonly currentRevision: number | null = null) {
    super('The application was updated elsewhere');
    this.name = 'RevisionConflict';
  }
}

/** The row does not exist, or belongs to someone else. The two are deliberately indistinguishable. */
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor(what = 'Application') {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

/** The input failed validation. The message is safe to show to the user. */
export class InvalidInputError extends Error {
  readonly code = 'INVALID_INPUT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}

/** The same idempotency key was reused with different input. */
export class IdempotencyKeyMismatch extends Error {
  readonly code = 'IDEMPOTENCY_KEY_MISMATCH' as const;
  constructor() {
    super('This idempotency key was already used with different input');
    this.name = 'IdempotencyKeyMismatch';
  }
}

/** The user already has the maximum number of pending or running operations. */
export class OperationLimitReached extends Error {
  readonly code = 'OPERATION_LIMIT_REACHED' as const;
  constructor(readonly limit: number) {
    super(`Only ${limit} generations can run at once`);
    this.name = 'OperationLimitReached';
  }
}

/** The balance cannot cover the reservation. */
export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS' as const;
  constructor(readonly required: number, readonly available: number) {
    super('Insufficient credits');
    this.name = 'InsufficientCreditsError';
  }
}

/** The reservation for this request is held or spent by another request. */
export class ReservationConflictError extends Error {
  readonly code: 'REQUEST_IN_PROGRESS' | 'REQUEST_ALREADY_COMPLETED';
  constructor(code: 'REQUEST_IN_PROGRESS' | 'REQUEST_ALREADY_COMPLETED') {
    super(code === 'REQUEST_IN_PROGRESS' ? 'This request is already in progress' : 'This request already completed');
    this.code = code;
    this.name = 'ReservationConflictError';
  }
}

/** The application already has a finished kit and the caller did not ask to regenerate it. */
export class KitAlreadyGeneratedError extends Error {
  readonly code = 'KIT_ALREADY_GENERATED' as const;
  constructor() {
    super('This application already has a kit. Pass regenerate to replace it');
    this.name = 'KitAlreadyGeneratedError';
  }
}

/** A queued operation cannot be retried and has to end now. `code` is stored as the operation's error_code. */
export class PermanentOperationError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'PermanentOperationError';
  }
}
