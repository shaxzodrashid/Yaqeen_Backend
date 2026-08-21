import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { CargoConsolidationsService } from './cargo-consolidations.service';
import {
  CreateCargoConsolidationDto,
  UpdateCargoConsolidationDto,
  QueryCargoConsolidationDto,
  AssignCargosDto,
  RemoveCargosDto,
} from './dto/cargo-consolidations.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    phone_number: string;
    role: string;
  };
}

@Controller(['cargo-consolidations', 'consolidations'])
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CargoConsolidationsController {
  constructor(
    private readonly consolidationsService: CargoConsolidationsService,
  ) {}

  @Post()
  @RequirePermission('cargo_consolidations', 'create')
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCargoConsolidationDto,
  ) {
    return this.consolidationsService.createConsolidation(req.user, dto);
  }

  @Get()
  @RequirePermission('cargo_consolidations', 'read')
  findAll(@Query() query: QueryCargoConsolidationDto) {
    return this.consolidationsService.findAllConsolidations(query);
  }

  @Get('active')
  @RequirePermission('cargo_consolidations', 'read')
  getActiveDropdown(@Query('search') search?: string) {
    return this.consolidationsService.getActiveDropdownList(search);
  }

  @Get(':id')
  @RequirePermission('cargo_consolidations', 'read')
  findOne(
    @Param('id') id?: string,
    @Param('consolidation_id') consolidationId?: string,
  ) {
    return this.consolidationsService.findConsolidationDetails(
      (id || consolidationId) as string,
    );
  }

  @Patch(':id')
  @RequirePermission('cargo_consolidations', 'update')
  update(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateCargoConsolidationDto,
  ) {
    return this.consolidationsService.updateConsolidation(id, req.user, dto);
  }

  @Post(':id/assign-cargos')
  @RequirePermission('cargo_consolidations', 'assign_cargo')
  assignCargos(@Param('id') id: string, @Body() dto: AssignCargosDto) {
    return this.consolidationsService.assignCargos(id, dto);
  }

  @Post(':id/remove-cargos')
  @RequirePermission('cargo_consolidations', 'assign_cargo')
  removeCargos(@Param('id') id: string, @Body() dto: RemoveCargosDto) {
    return this.consolidationsService.removeCargos(id, dto);
  }

  @Delete(':id')
  @RequirePermission('cargo_consolidations', 'delete')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.consolidationsService.deleteConsolidation(id);
  }
}
