import * as dotenv from 'dotenv';
// Load environment variables before any other imports that might depend on them
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { ensureDatabaseExists } from './database/ensure-db';
import { CustomExceptionFilter } from './common/filters/custom-exception.filter';

async function bootstrap() {
  // 1. Check and create PostgreSQL database if it does not exist
  await ensureDatabaseExists();

  // 2. Create NestJS application buffering startup logs
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // 3. Configure Pino as the global logger
  app.useLogger(app.get(Logger));

  // 4. Set global prefix for all endpoints
  app.setGlobalPrefix('api/v1');

  // 5. Register global CustomExceptionFilter
  app.useGlobalFilters(new CustomExceptionFilter());

  // 6. Register global ValidationPipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 6. Enable CORS
  app.enableCors();

  // 7. Enable NestJS lifecycle shutdown hooks
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  // Use the injected Pino logger to print startup message
  app
    .get(Logger)
    .log(`Application is running on: http://localhost:${port}/api/v1`);
}
bootstrap();
