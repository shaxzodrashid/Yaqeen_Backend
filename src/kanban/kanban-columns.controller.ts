import {
  Controller,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { KanbanColumnsService } from './kanban-columns.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { ReorderColumnsDto } from './dto/reorder-columns.dto';

@Controller('kanban/columns')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class KanbanColumnsController {
  constructor(private readonly columnsService: KanbanColumnsService) {}

  @Post()
  @RequirePermission('tasks', 'create')
  @HttpCode(HttpStatus.CREATED)
  createColumn(@Body() dto: CreateColumnDto) {
    return this.columnsService.createColumn(dto);
  }

  @Put('reorder/board/:boardId')
  @RequirePermission('tasks', 'update')
  reorderColumns(
    @Param('boardId') boardId: string,
    @Body() dto: ReorderColumnsDto,
  ) {
    return this.columnsService.reorderColumns(boardId, dto);
  }

  @Put(':id')
  @RequirePermission('tasks', 'update')
  updateColumn(@Param('id') id: string, @Body() dto: UpdateColumnDto) {
    return this.columnsService.updateColumn(id, dto);
  }

  @Delete(':id')
  @RequirePermission('tasks', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteColumn(@Param('id') id: string) {
    return this.columnsService.deleteColumn(id);
  }
}
