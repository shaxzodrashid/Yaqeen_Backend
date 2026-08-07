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
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('modules')
  @RequirePermission('roles', 'read')
  getModules() {
    return this.rolesService.getModulesTaxonomy();
  }

  @Get()
  @RequirePermission('roles', 'read')
  async findAll() {
    return this.rolesService.findAllRoles();
  }

  @Get(':id')
  @RequirePermission('roles', 'read')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findRoleById(id);
  }

  @Post()
  @RequirePermission('roles', 'create')
  async create(@Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(dto);
  }

  @Put(':id')
  @RequirePermission('roles', 'update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.updateRole(id, dto);
  }

  @Delete(':id')
  @RequirePermission('roles', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.rolesService.deleteRole(id);
  }
}
