import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { CurrencyService } from './currency.service';
import { ConvertCurrencyDto } from './dto/convert-currency.dto';

@Controller('currency')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  /**
   * GET /currency/rates
   * Returns current Central Bank of Uzbekistan (CBU) exchange rates for UZS, USD, and RUB.
   */
  @Get('rates')
  @RequirePermission('currency', 'read')
  async getExchangeRates() {
    const rates = await this.currencyService.getLatestRates();
    return {
      provider: 'Central Bank of Uzbekistan (CBU)',
      base_currency: 'UZS',
      supported_currencies: ['UZS', 'USD', 'RUB', 'RMB', 'CNY'],
      rates,
    };
  }

  /**
   * POST /currency/convert
   * Converts an amount between supported currencies (UZS, USD, RUB).
   */
  @Post('convert')
  @RequirePermission('currency', 'read')
  @HttpCode(HttpStatus.OK)
  async convertCurrency(@Body() dto: ConvertCurrencyDto) {
    return this.currencyService.convert(dto.amount, dto.from, dto.to);
  }

  /**
   * POST /currency/sync
   * Manually trigger a fresh fetch/sync of rates from CBU API.
   */
  @Post('sync')
  @RequirePermission('currency', 'update')
  @HttpCode(HttpStatus.OK)
  async syncRates() {
    const rates = await this.currencyService.syncRatesFromCbu();
    return {
      message: 'Exchange rates successfully synchronized with CBU API',
      rates,
    };
  }
}
