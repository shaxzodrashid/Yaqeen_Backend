import {
  Module,
  Global,
  Provider,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex, { Knex } from 'knex';

export const KNEX_CONNECTION = 'KNEX_CONNECTION';

const knexProvider: Provider = {
  provide: KNEX_CONNECTION,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const dbConfig: Knex.Config = {
      client: 'postgresql',
      connection: {
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT', 5432),
        user: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASSWORD', ''),
        database: configService.get<string>('DB_NAME'),
      },
      pool: {
        min: 2,
        max: 10,
      },
    };
    return knex(dbConfig);
  },
};

@Global()
@Module({
  providers: [knexProvider],
  exports: [KNEX_CONNECTION],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(KNEX_CONNECTION) private readonly knexConnection: Knex) {}

  async onModuleDestroy() {
    await this.knexConnection.destroy();
  }
}
