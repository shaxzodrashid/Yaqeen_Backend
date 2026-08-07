import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class CustomExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(CustomExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerErrorException';
    let location = 'internal_error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      error = exception.name || exception.constructor.name;
      const exceptionResponse: any = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (exceptionResponse && typeof exceptionResponse === 'object') {
        // If message is defined in the response object
        const msg = exceptionResponse.message;
        if (msg) {
          if (Array.isArray(msg)) {
            message = msg.join(', ');
            location = 'validation_failed'; // If validation rules fail, it's an array
          } else {
            message = msg;
          }
        }

        // Extract custom location if provided
        if (exceptionResponse.location) {
          location = exceptionResponse.location;
        } else if (location === 'internal_error') {
          // Infer location based on default NestJS exception type or status code
          if (status === HttpStatus.UNAUTHORIZED) {
            location = 'unauthorized';
          } else if (status === HttpStatus.FORBIDDEN) {
            location = 'forbidden';
          } else if (status === HttpStatus.NOT_FOUND) {
            location = 'not_found';
          } else if (status === HttpStatus.BAD_REQUEST) {
            location = 'bad_request';
          }
        }
      }
    } else {
      // Non-HttpException (e.g. system or database errors)
      message = exception.message || 'Internal server error';
      this.logger.error(
        `Unhandle exception: ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      message: message,
      error: error,
      timestamp: new Date().toISOString(),
      location: location,
      path: request.url,
    });
  }
}
