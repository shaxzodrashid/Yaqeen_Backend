import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').default(''),
  DB_NAME: Joi.string().required(),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),

  TELEGRAM_BOT_TOKEN: Joi.string().allow('').default(''),
  JWT_SECRET: Joi.string().default('super_secret_key_change_me_in_production'),
  JWT_EXPIRES_IN: Joi.string().default('30m'),
  REFRESH_TOKEN_EXPIRES_IN: Joi.string().default('30d'),

  MINIO_ENDPOINT: Joi.string().default('127.0.0.1'),
  MINIO_PORT: Joi.number().default(9000),
  MINIO_USE_SSL: Joi.boolean().default(false),
  MINIO_ACCESS_KEY: Joi.string().required(),
  MINIO_SECRET_KEY: Joi.string().required(),
  MINIO_BUCKET_NAME: Joi.string().default('yaqeen-attachments'),
});
