import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { MinioModule } from './minio/minio.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { EmployeesModule } from './employees/employees.module';
import { ClientsModule } from './clients/clients.module';
import { CargoKpiModule } from './cargo-kpi/cargo-kpi.module';
import { FinanceModule } from './finance/finance.module';
import { CurrencyModule } from './currency/currency.module';
import { RolesModule } from './roles/roles.module';
import { KanbanModule } from './kanban/kanban.module';
import { CommercialOffersModule } from './commercial-offers/commercial-offers.module';
import { SalesManagerKpiModule } from './sales-manager-kpi/sales-manager-kpi.module';
import { CargoRegistrationsModule } from './cargo-registrations/cargo-registrations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { KpiSummaryModule } from './kpi-summary/kpi-summary.module';

@Module({
  imports: [
    // Configure global ConfigModule with validation
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: true,
      },
    }),

    // Configure logger with pino-pretty in development
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction =
          configService.get<string>('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            level: isProduction ? 'info' : 'debug',
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    colorize: true,
                    translateTime: 'UTC:yyyy-mm-dd HH:MM:ss.l"Z"',
                  },
                },
          },
        };
      },
    }),

    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthModule,
    MinioModule,
    AttachmentsModule,
    EmployeesModule,
    ClientsModule,
    CargoKpiModule,
    CargoRegistrationsModule,
    FinanceModule,
    CurrencyModule,
    RolesModule,
    KanbanModule,
    CommercialOffersModule,
    SalesManagerKpiModule,
    DashboardModule,
    KpiSummaryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
