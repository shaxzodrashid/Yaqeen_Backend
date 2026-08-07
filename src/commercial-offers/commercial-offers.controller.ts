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
  Res,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CommercialOffersService } from './commercial-offers.service';
import { CommercialOffersPdfService } from './commercial-offers-pdf.service';
import { Currency } from '../currency/currency.types';
import { CreateCommercialOfferDto } from './dto/create-commercial-offer.dto';
import { UpdateCommercialOfferDto } from './dto/update-commercial-offer.dto';
import { UpdateOfferStatusDto } from './dto/update-offer-status.dto';
import { QueryCommercialOfferDto } from './dto/query-commercial-offer.dto';

@Controller('commercial-offers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommercialOffersController {
  constructor(
    private readonly commercialOffersService: CommercialOffersService,
    private readonly pdfService: CommercialOffersPdfService,
  ) {}

  // ==========================================
  // STATS (must be defined before :id routes)
  // ==========================================

  @Get('stats/summary')
  @RequirePermission('commercial_offers', 'read')
  async getSummary(@Query('currency') currency?: Currency) {
    return this.commercialOffersService.getOffersSummary(currency);
  }

  // ==========================================
  // CRUD OPERATIONS
  // ==========================================

  @Get()
  @RequirePermission('commercial_offers', 'read')
  async findAll(@Query() query: QueryCommercialOfferDto) {
    return this.commercialOffersService.findAllOffers(query);
  }

  @Get(':id')
  @RequirePermission('commercial_offers', 'read')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.commercialOffersService.findOfferById(id);
  }

  @Post()
  @RequirePermission('commercial_offers', 'create')
  async create(
    @Body() dto: CreateCommercialOfferDto,
    @CurrentUser() user: any,
  ) {
    return this.commercialOffersService.createOffer(dto, user.id);
  }

  @Put(':id')
  @RequirePermission('commercial_offers', 'update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommercialOfferDto,
  ) {
    return this.commercialOffersService.updateOffer(id, dto);
  }

  @Delete(':id')
  @RequirePermission('commercial_offers', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.commercialOffersService.deleteOffer(id);
  }

  // ==========================================
  // STATUS MANAGEMENT
  // ==========================================

  @Patch(':id/status')
  @RequirePermission('commercial_offers', 'update')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOfferStatusDto,
  ) {
    return this.commercialOffersService.updateOfferStatus(id, dto.status);
  }

  // ==========================================
  // DUPLICATION
  // ==========================================

  @Post(':id/duplicate')
  @RequirePermission('commercial_offers', 'create')
  @HttpCode(HttpStatus.OK)
  async duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.commercialOffersService.duplicateOffer(id, user.id);
  }

  // ==========================================
  // PDF GENERATION & DOWNLOAD
  // ==========================================

  @Get(':id/pdf')
  @RequirePermission('commercial_offers', 'read')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const offer = await this.commercialOffersService.findOfferById(id);

    const pdfBuffer = await this.pdfService.generatePdf({
      offer_number: offer.offer_number,
      client_name: offer.client_name,
      client_company: offer.client_company,
      origin: offer.origin,
      destination: offer.destination,
      cargo_description: offer.cargo_description,
      cargo_weight: offer.cargo_weight ?? undefined,
      cargo_volume: offer.cargo_volume ?? undefined,
      price_usd: offer.price_usd,
      price_local: offer.price_local,
      inclusions: offer.inclusions,
      exclusions: offer.exclusions,
      terms: offer.terms,
      status: offer.status,
      created_at: offer.created_at,
    });

    const filename = `${offer.offer_number.replace(/\s+/g, '_')}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }
}
