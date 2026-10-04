import { STATUS_CODES } from 'node:http';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorCode } from './api-error.js';

/**
 * Errors NestJS throws by itself (an id that is not a UUID, an unknown
 * route, the rate limit) have no code of their own. They get one from
 * their status.
 */
const CODE_BY_STATUS: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'bad_request',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate_limited',
};

/**
 * Writes every error answer in one shape: statusCode, error, code, message.
 * An ApiError brings its own code; any other HTTP error gets one from its
 * status. The sentence is never changed.
 *
 * A crash (500) is not an HttpException and does not pass through here.
 * It has no code, and a client shows its general "something went wrong"
 * sentence, the same one it needs when the network is down.
 */
@Catch(HttpException)
export class ErrorCodeFilter implements ExceptionFilter<HttpException> {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const status = exception.getStatus();
    const body = exception.getResponse();
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({
        statusCode: status,
        error: STATUS_CODES[status],
        code: CODE_BY_STATUS[status],
        // Last, so what the exception says wins over the defaults above.
        ...(typeof body === 'string' ? { message: body } : body),
      });
  }
}
