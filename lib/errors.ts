// Domain errors. No Next.js imports here so lib/family.ts stays testable
// outside a request; lib/api.ts maps these to HTTP statuses.
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("not signed in");
    this.name = "UnauthenticatedError";
  }
}
