/**
 * Error controlado con código HTTP. El mensaje se envía tal cual al cliente,
 * por lo que nunca debe contener información interna.
 */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
