import { Module } from '@nestjs/common';
import { CommercialOffersController } from './commercial-offers.controller';
import { CommercialOffersService } from './commercial-offers.service';
import { CommercialOffersPdfService } from './commercial-offers-pdf.service';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [CurrencyModule],
  controllers: [CommercialOffersController],
  providers: [CommercialOffersService, CommercialOffersPdfService],
  exports: [CommercialOffersService],
})
export class CommercialOffersModule {}
