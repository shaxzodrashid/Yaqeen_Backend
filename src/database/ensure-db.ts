import { Client } from 'pg';
import { Logger } from '@nestjs/common';

export async function ensureDatabaseExists(): Promise<void> {
  const logger = new Logger('DatabaseBootstrap');

  const host = process.env.DB_HOST;
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME;

  if (!dbName) {
    logger.error('DB_NAME environment variable is not defined.');
    return;
  }

  const client = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
  });

  try {
    await client.connect();

    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );

    if (result.rowCount === null || result.rowCount === 0) {
      logger.log(`Database "${dbName}" does not exist. Creating it...`);
      // PostgreSQL doesn't support parameterized identifiers for CREATE DATABASE.
      // So we use double quotes to protect the database name from SQL injection/syntax errors.
      // Since dbName comes from trusted environment config, this is safe, but we still wrap it in quotes.
      await client.query(`CREATE DATABASE "${dbName}"`);
      logger.log(`Database "${dbName}" successfully created.`);
    } else {
      logger.log(`Database "${dbName}" already exists.`);
    }
  } catch (error: any) {
    logger.error(`Error checking/creating database: ${error.message}`);
    throw error;
  } finally {
    try {
      await client.end();
    } catch {
      // Ignore errors closing client
    }
  }
}
