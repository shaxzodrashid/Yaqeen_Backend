import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { DepartmentsController } from './departments.controller';
import { MinioModule } from '../minio/minio.module';
import { CurrencyModule } from '../currency/currency.module';
import { CargoKpiModule } from '../cargo-kpi/cargo-kpi.module';

@Module({
  imports: [MinioModule, CurrencyModule, CargoKpiModule],
  controllers: [EmployeesController, DepartmentsController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
