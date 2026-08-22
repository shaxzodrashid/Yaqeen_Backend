import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LocationsService } from './locations.service';
import { SearchCitiesQueryDto } from './dto/locations.dto';

@Controller('locations')
@UseGuards(JwtAuthGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  /**
   * Search city names using Redis -> Local DB -> GeoNames Web Service.
   * Used for Frontend autocomplete when registering cargo origin/destination.
   * Example: GET /locations/cities?q=Tashk&country=UZ&limit=10
   */
  @Get('cities')
  searchCities(@Query() query: SearchCitiesQueryDto) {
    return this.locationsService.searchCities(query);
  }

  /**
   * Get list of top logistics hubs for instant dropdown suggestions.
   * Example: GET /locations/cities/popular
   */
  @Get('cities/popular')
  getPopularHubs() {
    return this.locationsService.getPopularLogisticsHubs();
  }

  /**
   * Lookup city details by GeoNames ID.
   * Example: GET /locations/cities/1512569
   */
  @Get('cities/:geonameId')
  getCityById(@Param('geonameId', ParseIntPipe) geonameId: number) {
    return this.locationsService.getCityByGeonameId(geonameId);
  }
}
