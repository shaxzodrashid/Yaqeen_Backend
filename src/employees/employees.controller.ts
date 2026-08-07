import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(['employees', 'emloyees'])
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get('me')
  async getMe(@CurrentUser() user: any) {
    return this.employeesService.findEmployeeByUserId(user.id);
  }

  @Post('me/picture')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMyPicture(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    const me = await this.employeesService.findEmployeeByUserId(user.id);
    if (!me.id) {
      throw new ForbiddenException({
        message: 'No associated employee profile found for current user.',
        location: 'no_employee_profile',
      });
    }
    return this.employeesService.uploadProfilePicture(me.id, file);
  }

  @Delete('me/picture')
  async deleteMyPicture(@CurrentUser() user: any) {
    const me = await this.employeesService.findEmployeeByUserId(user.id);
    if (!me.id) {
      throw new ForbiddenException({
        message: 'No associated employee profile found for current user.',
        location: 'no_employee_profile',
      });
    }
    return this.employeesService.deleteProfilePicture(me.id);
  }

  @Get()
  @RequirePermission('employees', 'read')
  async findAll(
    @Query('department_id') departmentId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    return this.employeesService.findAllEmployees({
      department_id: departmentId,
      search,
      page: pageNum,
      limit: limitNum,
    });
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const employee = await this.employeesService.findEmployeeById(id);

    // If user is accessing their own employee profile, allow.
    if (employee.user_id === user.id || user.role === 'CEO') {
      return employee;
    }

    // Otherwise require employees.read permission
    const hasReadPerm = await this.employeesService.checkUserPermission(
      user.id,
      'employees',
      'read',
    );
    if (!hasReadPerm) {
      throw new ForbiddenException({
        message:
          'Access denied: Insufficient permissions to view this employee profile.',
        location: 'insufficient_permissions',
      });
    }

    return employee;
  }

  @Post(':id/picture')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPicture(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    const employee = await this.employeesService.findEmployeeById(id);
    if (employee.user_id !== user.id && user.role !== 'CEO') {
      const hasUpdatePerm = await this.employeesService.checkUserPermission(
        user.id,
        'employees',
        'update',
      );
      if (!hasUpdatePerm) {
        throw new ForbiddenException({
          message: 'Access denied: Cannot update other employee pictures.',
          location: 'insufficient_permissions',
        });
      }
    }

    return this.employeesService.uploadProfilePicture(id, file);
  }

  @Delete(':id/picture')
  async deletePicture(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const employee = await this.employeesService.findEmployeeById(id);
    if (employee.user_id !== user.id && user.role !== 'CEO') {
      const hasUpdatePerm = await this.employeesService.checkUserPermission(
        user.id,
        'employees',
        'update',
      );
      if (!hasUpdatePerm) {
        throw new ForbiddenException({
          message: 'Access denied: Cannot delete other employee pictures.',
          location: 'insufficient_permissions',
        });
      }
    }

    return this.employeesService.deleteProfilePicture(id);
  }

  @Post()
  @RequirePermission('employees', 'create')
  async create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.createEmployee(dto);
  }

  @Put(':id')
  @RequirePermission('employees', 'update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.updateEmployee(id, dto);
  }

  @Delete(':id')
  @RequirePermission('employees', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.employeesService.deleteEmployee(id);
  }
}
