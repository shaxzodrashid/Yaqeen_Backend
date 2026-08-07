import {
  Controller,
  Get,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { KanbanBoardsService } from './kanban-boards.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';

@Controller('kanban/boards')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class KanbanBoardsController {
  constructor(private readonly boardsService: KanbanBoardsService) {}

  @Post()
  @RequirePermission('tasks', 'create')
  @HttpCode(HttpStatus.CREATED)
  createBoard(@Body() dto: CreateBoardDto, @CurrentUser() user: any) {
    return this.boardsService.createBoard(dto, user?.id);
  }

  @Get()
  @RequirePermission('tasks', 'read')
  listBoards() {
    return this.boardsService.listBoards();
  }

  @Get(':id')
  @RequirePermission('tasks', 'read')
  getBoardById(@Param('id') id: string) {
    return this.boardsService.getBoardById(id);
  }

  @Put(':id')
  @RequirePermission('tasks', 'update')
  updateBoard(@Param('id') id: string, @Body() dto: UpdateBoardDto) {
    return this.boardsService.updateBoard(id, dto);
  }

  @Delete(':id')
  @RequirePermission('tasks', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBoard(@Param('id') id: string) {
    return this.boardsService.deleteBoard(id);
  }
}
