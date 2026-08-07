import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { EmployeesService } from './employees.service';
import { CreateDepartmentDto } from './dto/create-department.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermission('departments', 'read')
  async findAll() {
    return this.employeesService.findAllDepartments();
  }

  @Get(':id')
  @RequirePermission('departments', 'read')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.findDepartmentById(id);
  }

  @Post()
  @RequirePermission('departments', 'create')
  async create(@Body() dto: CreateDepartmentDto) {
    return this.employeesService.createDepartment(dto);
  }

  @Put(':id')
  @RequirePermission('departments', 'update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.employeesService.updateDepartment(id, dto);
  }

  @Delete(':id')
  @RequirePermission('departments', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.employeesService.deleteDepartment(id);
  }
}
