import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    phone_number: string;
    role: string;
  };
}

interface DecodedToken {
  sub: string;
  phone_number: string;
  role: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        message: 'Authorization token is missing or invalid',
        location: 'auth_header_missing',
      });
    }

    const token = authHeader.split(' ')[1];
    try {
      const secret =
        this.configService.get<string>('jwtSecret') ||
        'super_secret_key_change_me_in_production';

      const payload = await new Promise<DecodedToken>((resolve, reject) => {
        jwt.verify(
          token,
          secret,
          (
            err: jwt.VerifyErrors | null,
            decoded: string | jwt.JwtPayload | undefined,
          ) => {
            if (err) {
              reject(err);
            } else if (decoded && typeof decoded === 'object') {
              resolve(decoded as DecodedToken);
            } else {
              reject(new Error('Invalid token payload structure'));
            }
          },
        );
      });

      // Populate user info on request context
      request.user = {
        id: payload.sub,
        phone_number: payload.phone_number,
        role: payload.role,
      };

      return true;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`JWT verification failed: ${err.message}`, err.stack);
      throw new UnauthorizedException({
        message: 'Invalid or expired authorization token',
        location: 'invalid_token',
      });
    }
  }
}
