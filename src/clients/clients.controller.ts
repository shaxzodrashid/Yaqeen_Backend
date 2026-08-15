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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientDto } from './dto/query-client.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get('stats/color-distribution')
  @RequirePermission('clients', 'read')
  async getColorStats(@CurrentUser() user: any) {
    return this.clientsService.getClientColorStats(user);
  }

  @Get()
  @RequirePermission('clients', 'read')
  async findAll(@Query() query: QueryClientDto, @CurrentUser() user: any) {
    return this.clientsService.findAllClients(query, user);
  }

  @Get(':id')
  @RequirePermission('clients', 'read')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.clientsService.findClientById(id, user);
  }

  @Post()
  @RequirePermission('clients', 'create')
  async create(@Body() dto: CreateClientDto, @CurrentUser() user: any) {
    return this.clientsService.createClient(dto, user);
  }

  @Put(':id')
  @RequirePermission('clients', 'update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: any,
  ) {
    return this.clientsService.updateClient(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('clients', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    await this.clientsService.deleteClient(id, user);
  }
}
