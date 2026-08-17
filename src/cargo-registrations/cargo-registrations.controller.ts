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
import { CargoRegistrationsService } from './cargo-registrations.service';
import {
  CreateCargoRegistrationDto,
  UpdateCargoRegistrationDto,
  QueryCargoRegistrationDto,
} from './dto/cargo-registrations.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    phone_number: string;
    role: string;
  };
}

@Controller('cargo-registrations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CargoRegistrationsController {
  constructor(
    private readonly cargoRegistrationsService: CargoRegistrationsService,
  ) {}

  @Post()
  @RequirePermission('cargo_registrations', 'create')
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCargoRegistrationDto,
  ) {
    return this.cargoRegistrationsService.createCargoRegistration(
      req.user,
      dto,
    );
  }

  @Get()
  @RequirePermission('cargo_registrations', 'read')
  findAll(@Query() query: QueryCargoRegistrationDto) {
    return this.cargoRegistrationsService.findAllCargoRegistrations(query);
  }

  @Get('stats')
  @RequirePermission('cargo_registrations', 'read')
  getStats(@Query() query: QueryCargoRegistrationDto) {
    return this.cargoRegistrationsService.getCargoRegistrationStats(query);
  }

  @Get('stats/summary')
  @RequirePermission('cargo_registrations', 'read')
  getStatsSummary(@Query() query: QueryCargoRegistrationDto) {
    return this.cargoRegistrationsService.getCargoRegistrationStats(query);
  }

  @Get(':id')
  @RequirePermission('cargo_registrations', 'read')
  findOne(@Param('id') id: string) {
    return this.cargoRegistrationsService.findCargoRegistrationDetails(id);
  }

  @Patch(':id')
  @RequirePermission('cargo_registrations', 'update')
  update(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateCargoRegistrationDto,
  ) {
    return this.cargoRegistrationsService.updateCargoRegistration(
      id,
      req.user,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermission('cargo_registrations', 'delete')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.cargoRegistrationsService.deleteCargoRegistration(id, req.user);
  }
}
