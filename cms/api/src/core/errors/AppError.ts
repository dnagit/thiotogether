import type { FieldError } from '@cms/shared';

/** Base class for every expected, HTTP-mappable error. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = 'APP_ERROR',
    public readonly errors?: FieldError[],
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, `${resource} not found`, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(errors: FieldError[], message = 'Validation failed') {
    super(422, message, 'VALIDATION_ERROR', errors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, message, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(409, message, 'CONFLICT');
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(400, message, 'BAD_REQUEST');
  }
}
