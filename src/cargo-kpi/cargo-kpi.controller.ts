import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { CargoKpiService } from './cargo-kpi.service';
import { Currency } from '../currency/currency.types';
import {
  LtlCalcDto,
  CreateLtlItemDto,
  UpdateLtlItemDto,
} from './dto/ltl-item.dto';
import { CreateFtlItemDto, UpdateFtlItemDto } from './dto/ftl-item.dto';
import {
  CreateRopWorkerDto,
  CreateRopTruckDto,
  SeoCalcDto,
} from './dto/rop-seo.dto';
import {
  CreateEmployeePlanDto,
  UpdateEmployeePlanDto,
  CreateCargoTransactionDto,
  UpdateCargoTransactionDto,
  QueryCargoTransactionDto,
} from './dto/plans-transactions.dto';

@Controller('cargo-kpi')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CargoKpiController {
  constructor(private readonly cargoKpiService: CargoKpiService) {}

  // ==========================================
  // 1. LTL CALCULATOR & ITEMS
  // ==========================================

  @Post('ltl/calculate')
  @RequirePermission('cargo_kpi', 'read')
  @HttpCode(HttpStatus.OK)
  calculateLtlPrice(@Body() dto: LtlCalcDto) {
    return this.cargoKpiService.calculateLtlPrice(dto);
  }

  @Get('ltl/items')
  @RequirePermission('cargo_kpi', 'read')
  getLtlItemsSummary() {
    return this.cargoKpiService.getLtlItemsSummary();
  }

  @Post('ltl/items')
  @RequirePermission('cargo_kpi', 'create')
  createLtlItem(@Body() dto: CreateLtlItemDto) {
    return this.cargoKpiService.createLtlItem(dto);
  }

  @Put('ltl/items/:id')
  @RequirePermission('cargo_kpi', 'update')
  updateLtlItem(@Param('id') id: string, @Body() dto: UpdateLtlItemDto) {
    return this.cargoKpiService.updateLtlItem(id, dto);
  }

  @Delete('ltl/items/:id')
  @RequirePermission('cargo_kpi', 'delete')
  deleteLtlItem(@Param('id') id: string) {
    return this.cargoKpiService.deleteLtlItem(id);
  }

  @Post('ltl/reset')
  @RequirePermission('cargo_kpi', 'delete')
  @HttpCode(HttpStatus.OK)
  clearLtlItems() {
    return this.cargoKpiService.clearLtlItems();
  }

  // ==========================================
  // 2. FTL KPI MODULE
  // ==========================================

  @Get('ftl/summary')
  @RequirePermission('cargo_kpi', 'read')
  getFtlSummary(
    @Query('manager_id') managerId?: string,
    @Query('month') month?: string,
    @Query('currency') currency?: Currency,
  ) {
    return this.cargoKpiService.getFtlSummary(managerId, month, currency);
  }

  @Post('ftl/items')
  @RequirePermission('cargo_kpi', 'create')
  createFtlItem(@Body() dto: CreateFtlItemDto) {
    return this.cargoKpiService.createFtlItem(dto);
  }

  @Put('ftl/items/:id')
  @RequirePermission('cargo_kpi', 'update')
  updateFtlItem(@Param('id') id: string, @Body() dto: UpdateFtlItemDto) {
    return this.cargoKpiService.updateFtlItem(id, dto);
  }

  @Post('ftl/items/:id/copy')
  @RequirePermission('cargo_kpi', 'create')
  @HttpCode(HttpStatus.OK)
  copyFtlItem(@Param('id') id: string) {
    return this.cargoKpiService.copyFtlItem(id);
  }

  @Patch('ftl/items/:id/toggle-kpi')
  @RequirePermission('cargo_kpi', 'update')
  toggleFtlKpiReceived(@Param('id') id: string) {
    return this.cargoKpiService.toggleFtlKpiReceived(id);
  }

  @Delete('ftl/items/:id')
  @RequirePermission('cargo_kpi', 'delete')
  deleteFtlItem(@Param('id') id: string) {
    return this.cargoKpiService.deleteFtlItem(id);
  }

  @Post('ftl/reset')
  @RequirePermission('cargo_kpi', 'delete')
  @HttpCode(HttpStatus.OK)
  resetFtlData() {
    return this.cargoKpiService.resetFtlData();
  }

  // ==========================================
  // 3. ROP KPI MODULE
  // ==========================================

  @Get('rop/summary')
  @RequirePermission('cargo_kpi', 'read')
  getRopSummary(@Query('currency') currency?: Currency) {
    return this.cargoKpiService.getRopSummary(currency);
  }

  @Post('rop/workers')
  @RequirePermission('cargo_kpi', 'create')
  createRopWorker(@Body() dto: CreateRopWorkerDto) {
    return this.cargoKpiService.createRopWorker(dto);
  }

  @Delete('rop/workers/:id')
  @RequirePermission('cargo_kpi', 'delete')
  deleteRopWorker(@Param('id') id: string) {
    return this.cargoKpiService.deleteRopWorker(id);
  }

  @Post('rop/trucks')
  @RequirePermission('cargo_kpi', 'create')
  createRopTruck(@Body() dto: CreateRopTruckDto) {
    return this.cargoKpiService.createRopTruck(dto);
  }

  @Delete('rop/trucks/:id')
  @RequirePermission('cargo_kpi', 'delete')
  deleteRopTruck(@Param('id') id: string) {
    return this.cargoKpiService.deleteRopTruck(id);
  }

  @Post('rop/reset')
  @RequirePermission('cargo_kpi', 'delete')
  @HttpCode(HttpStatus.OK)
  resetRopData() {
    return this.cargoKpiService.resetRopData();
  }

  // ==========================================
  // 4. SEO KPI MODULE
  // ==========================================

  @Post('seo/calculate')
  @RequirePermission('cargo_kpi', 'read')
  @HttpCode(HttpStatus.OK)
  calculateSeoKpi(@Body() dto: SeoCalcDto) {
    return this.cargoKpiService.calculateSeoKpi(dto);
  }

  // ==========================================
  // 5. EMPLOYEE PLANS & PROGRESS TRACKING
  // ==========================================

  @Get('plans')
  @RequirePermission('cargo_kpi', 'read')
  getEmployeePlansProgress() {
    return this.cargoKpiService.getEmployeePlansProgress();
  }

  @Post('plans')
  @RequirePermission('cargo_kpi', 'create')
  createEmployeePlan(@Body() dto: CreateEmployeePlanDto) {
    return this.cargoKpiService.createEmployeePlan(dto);
  }

  @Put('plans/:id')
  @RequirePermission('cargo_kpi', 'update')
  updateEmployeePlan(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeePlanDto,
  ) {
    return this.cargoKpiService.updateEmployeePlan(id, dto);
  }

  @Delete('plans/:id')
  @RequirePermission('cargo_kpi', 'delete')
  deleteEmployeePlan(@Param('id') id: string) {
    return this.cargoKpiService.deleteEmployeePlan(id);
  }

  // ==========================================
  // 6. CARGO TRANSACTIONS
  // ==========================================

  @Get('transactions')
  @RequirePermission('cargo_kpi', 'read')
  findAllCargoTransactions(@Query() query: QueryCargoTransactionDto) {
    return this.cargoKpiService.findAllCargoTransactions(query);
  }

  @Get('transactions/viewable')
  @RequirePermission('cargo_kpi', 'read')
  findViewableCargoTransactions(@Query() query: QueryCargoTransactionDto) {
    return this.cargoKpiService.findViewableCargoTransactions(query);
  }

  @Get('transactions/:id')
  @RequirePermission('cargo_kpi', 'read')
  findCargoTransactionById(@Param('id') id: string) {
    return this.cargoKpiService.findCargoTransactionById(id);
  }

  @Post('transactions')
  @RequirePermission('cargo_kpi', 'create')
  createCargoTransaction(@Body() dto: CreateCargoTransactionDto) {
    return this.cargoKpiService.createCargoTransaction(dto);
  }

  @Put('transactions/:id')
  @RequirePermission('cargo_kpi', 'update')
  updateCargoTransaction(
    @Param('id') id: string,
    @Body() dto: UpdateCargoTransactionDto,
  ) {
    return this.cargoKpiService.updateCargoTransaction(id, dto);
  }

  @Delete('transactions/:id')
  @RequirePermission('cargo_kpi', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCargoTransaction(@Param('id') id: string) {
    return this.cargoKpiService.deleteCargoTransaction(id);
  }

  // ==========================================
  // 7. GLOBAL RESET
  // ==========================================

  @Post('reset-all')
  @RequirePermission('cargo_kpi', 'delete')
  @HttpCode(HttpStatus.OK)
  resetAllCargoKpi() {
    return this.cargoKpiService.resetAllCargoKpi();
  }
}
