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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { QueryAgentDto } from './dto/query-agent.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get('dropdown')
  @RequirePermission('agents', 'read')
  async getDropdown(@Query('search') search?: string, @Query('q') q?: string) {
    return this.agentsService.getDropdownAgents(search || q);
  }

  @Get()
  @RequirePermission('agents', 'read')
  async findAll(@Query() query: QueryAgentDto) {
    return this.agentsService.findAllAgents(query);
  }

  @Get(':id')
  @RequirePermission('agents', 'read')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.agentsService.findAgentById(id);
  }

  @Post()
  @RequirePermission('agents', 'create')
  async create(@Body() dto: CreateAgentDto, @CurrentUser() user: any) {
    return this.agentsService.createAgent(dto, user);
  }

  @Put(':id')
  @RequirePermission('agents', 'update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgentDto,
    @CurrentUser() user: any,
  ) {
    return this.agentsService.updateAgent(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('agents', 'delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.agentsService.deleteAgent(id, user);
  }
}
