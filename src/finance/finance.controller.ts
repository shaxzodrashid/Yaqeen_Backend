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
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { FinanceService } from './finance.service';
import { CreateExpenseDto, ExpenseSection } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpenseDto } from './dto/query-expense.dto';
import { BatchUpdateSalariesDto } from './dto/update-salary.dto';
import { QueryFinanceSummaryDto } from './dto/query-finance-summary.dto';

@Controller('finance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ==========================================
  // 1. FINANCIAL SUMMARY & NET PROFIT ENGINE
  // ==========================================

  @Get('summary')
  @RequirePermission('finance', 'read')
  getFinanceSummary(@Query() query: QueryFinanceSummaryDto) {
    return this.financeService.getFinanceSummary(query);
  }

  // ==========================================
  // 2. EXPENSES MANAGEMENT (FTL & LTL)
  // ==========================================

  @Post('expenses')
  @RequirePermission('finance', 'create')
  @HttpCode(HttpStatus.CREATED)
  createExpense(@Body() dto: CreateExpenseDto) {
    return this.financeService.createExpense(dto);
  }

  @Get('expenses')
  @RequirePermission('finance', 'read')
  findAllExpenses(@Query() query: QueryExpenseDto) {
    return this.financeService.findAllExpenses(query);
  }

  @Get('expenses/categories')
  @RequirePermission('finance', 'read')
  getExpenseCategories(
    @Query('section') section?: ExpenseSection,
    @Query('period') period?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    return this.financeService.getExpenseCategories(
      section,
      period,
      startDate,
      endDate,
    );
  }

  @Get('expenses/:id')
  @RequirePermission('finance', 'read')
  findExpenseById(@Param('id', ParseUUIDPipe) id: string) {
    return this.financeService.findExpenseById(id);
  }

  @Patch('expenses/:id')
  @RequirePermission('finance', 'update')
  updateExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.financeService.updateExpense(id, dto);
  }

  @Delete('expenses/:id')
  @RequirePermission('finance', 'delete')
  @HttpCode(HttpStatus.OK)
  deleteExpense(@Param('id', ParseUUIDPipe) id: string) {
    return this.financeService.deleteExpense(id);
  }

  // ==========================================
  // 3. FIXED SALARIES MANAGEMENT
  // ==========================================

  @Get('salaries')
  @RequirePermission('finance', 'read')
  getEmployeeSalaries(@Query('department_id') departmentId?: string) {
    return this.financeService.getEmployeeSalaries(departmentId);
  }

  @Patch('salaries')
  @RequirePermission('finance', 'update')
  batchUpdateEmployeeSalaries(@Body() dto: BatchUpdateSalariesDto) {
    return this.financeService.batchUpdateEmployeeSalaries(dto);
  }

  @Patch('salaries/:employee_id')
  @RequirePermission('finance', 'update')
  updateEmployeeSalary(
    @Param('employee_id', ParseUUIDPipe) employeeId: string,
    @Body('fixed_salary') fixedSalary: number,
    @Body('currency') currency?: string,
  ) {
    return this.financeService.updateEmployeeSalary({
      employee_id: employeeId,
      fixed_salary: fixedSalary,
      currency,
    });
  }
}
