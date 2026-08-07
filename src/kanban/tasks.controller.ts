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
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import {
  CreateChecklistItemDto,
  UpdateChecklistItemDto,
} from './dto/task-checklist.dto';
import { AttachmentsService } from '../attachments/attachments.service';

@Controller('tasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  @Post()
  @RequirePermission('tasks', 'create')
  @HttpCode(HttpStatus.CREATED)
  createTask(@Body() dto: CreateTaskDto, @CurrentUser() user: any) {
    return this.tasksService.createTask(dto, user);
  }

  @Get()
  @RequirePermission('tasks', 'read')
  listTasks(
    @Query('column_id') column_id?: string,
    @Query('assignee_id') assignee_id?: string,
    @Query('priority') priority?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('page') page?: string,
    @Query('group_by_column') group_by_column?: string,
  ) {
    return this.tasksService.listTasks({
      column_id,
      assignee_id,
      priority,
      search,
      limit,
      offset,
      page,
      group_by_column,
    });
  }

  @Get('viewable')
  @RequirePermission('tasks', 'read')
  listTasksViewable(
    @Query('column_id') column_id?: string,
    @Query('assignee_id') assignee_id?: string,
    @Query('priority') priority?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('page') page?: string,
  ) {
    return this.tasksService.listTasksViewable({
      column_id,
      assignee_id,
      priority,
      search,
      limit,
      offset,
      page,
    });
  }

  @Get(':id')
  @RequirePermission('tasks', 'read')
  getTaskById(@Param('id') id: string) {
    return this.tasksService.getTaskById(id);
  }

  @Put(':id')
  @RequirePermission('tasks', 'update')
  updateTask(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: any,
  ) {
    return this.tasksService.updateTask(id, dto, user);
  }

  @Patch(':id/move')
  @RequirePermission('tasks', 'update')
  moveTask(
    @Param('id') id: string,
    @Body() dto: MoveTaskDto,
    @CurrentUser() user: any,
  ) {
    return this.tasksService.moveTask(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('tasks', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTask(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tasksService.deleteTask(id, user);
  }

  // ==========================================
  // CHECKLISTS
  // ==========================================

  @Post(':id/checklists')
  @RequirePermission('tasks', 'update')
  @HttpCode(HttpStatus.CREATED)
  addChecklistItem(
    @Param('id') taskId: string,
    @Body() dto: CreateChecklistItemDto,
    @CurrentUser() user: any,
  ) {
    return this.tasksService.addChecklistItem(taskId, dto, user);
  }

  @Put(':id/checklists/:itemId')
  @RequirePermission('tasks', 'update')
  updateChecklistItem(
    @Param('id') taskId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateChecklistItemDto,
    @CurrentUser() user: any,
  ) {
    return this.tasksService.updateChecklistItem(taskId, itemId, dto, user);
  }

  @Delete(':id/checklists/:itemId')
  @RequirePermission('tasks', 'update')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteChecklistItem(
    @Param('id') taskId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: any,
  ) {
    return this.tasksService.deleteChecklistItem(taskId, itemId, user);
  }

  // ==========================================
  // ATTACHMENTS
  // ==========================================

  @Post(':id/attachments')
  @RequirePermission('tasks', 'update')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  uploadTaskAttachment(
    @Param('id') taskId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.attachmentsService.uploadAndCreateAttachment(
      file,
      'tasks',
      taskId,
      user?.id,
    );
  }

  // ==========================================
  // COMMENTS
  // ==========================================

  @Post(':id/comments')
  @RequirePermission('tasks', 'update')
  @HttpCode(HttpStatus.CREATED)
  addComment(
    @Param('id') taskId: string,
    @Body() dto: CreateTaskCommentDto,
    @CurrentUser() user: any,
  ) {
    return this.tasksService.addComment(taskId, dto, user?.id);
  }

  @Delete('comments/:commentId')
  @RequirePermission('tasks', 'update')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: any,
  ) {
    return this.tasksService.deleteComment(commentId, user?.id);
  }
}
