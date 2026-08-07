import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { DepartmentsController } from './departments.controller';
import { MinioModule } from '../minio/minio.module';

@Module({
  imports: [MinioModule],
  controllers: [EmployeesController, DepartmentsController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
