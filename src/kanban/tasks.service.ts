import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { CreateTaskDto, TaskPriority } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import {
  CreateChecklistItemDto,
  UpdateChecklistItemDto,
} from './dto/task-checklist.dto';
import { KanbanColumnsService } from './kanban-columns.service';
import { TelegramBotService } from '../auth/telegram-bot.service';
import { AttachmentsService } from '../attachments/attachments.service';

export interface Task {
  id: string;
  column_id: string;
  title: string;
  description?: string;
  assignee_id?: string;
  priority: string;
  position: number;
  due_date?: Date;
  target_time?: Date;
  started_at?: Date;
  completed_at?: Date;
  target_time_notified: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly columnsService: KanbanColumnsService,
    private readonly telegramBotService: TelegramBotService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  /**
   * Helper to fetch active assignees for a task.
   */
  private async getTaskAssignees(taskId: string): Promise<any[]> {
    return this.knex('task_assignees as ta')
      .join('employees as e', 'ta.employee_id', 'e.id')
      .where('ta.task_id', taskId)
      .select('e.id', 'e.first_name', 'e.last_name', 'e.phone', 'e.color');
  }

  /**
   * Helper to sync assignee_ids into task_assignees table.
   */
  private async syncAssignees(
    taskId: string,
    primaryAssigneeId?: string,
    assigneeIds?: string[],
  ): Promise<string[]> {
    const idsToAssign = new Set<string>();
    if (primaryAssigneeId) idsToAssign.add(primaryAssigneeId);
    if (assigneeIds && Array.isArray(assigneeIds)) {
      assigneeIds.forEach((id) => idsToAssign.add(id));
    }

    const finalIds = Array.from(idsToAssign);

    // Verify all employee IDs exist
    if (finalIds.length > 0) {
      const existing = await this.knex('employees')
        .whereIn('id', finalIds)
        .select('id');
      if (existing.length !== finalIds.length) {
        throw new BadRequestException({
          message: 'One or more specified assignee employee IDs do not exist.',
          location: 'invalid_assignee_ids',
        });
      }
    }

    // Replace current assignees
    await this.knex('task_assignees').where('task_id', taskId).del();
    for (const empId of finalIds) {
      await this.knex('task_assignees').insert({
        task_id: taskId,
        employee_id: empId,
      });
    }

    return finalIds;
  }

  /**
   * Log an action in task_activity_logs.
   */
  private async logActivity(
    taskId: string,
    userId: string | undefined,
    action: string,
    details?: string,
  ): Promise<void> {
    await this.knex('task_activity_logs').insert({
      task_id: taskId,
      user_id: userId || null,
      action,
      details: details || null,
    });
  }

  /**
   * Create a new task.
   */
  async createTask(dto: CreateTaskDto, currentUser?: any): Promise<any> {
    // Check dynamic column status permission
    const column = await this.columnsService.validateStatusPermission(
      dto.column_id,
      currentUser?.role,
    );

    let pos = dto.position;
    if (pos === undefined || pos === null) {
      const maxTask = await this.knex('tasks')
        .where('column_id', dto.column_id)
        .max('position as maxPos')
        .first();
      pos =
        maxTask && maxTask.maxPos !== null ? (maxTask.maxPos as number) + 1 : 0;
    }

    const primaryAssignee =
      dto.assignee_id ||
      (dto.assignee_ids && dto.assignee_ids.length > 0
        ? dto.assignee_ids[0]
        : undefined);

    const isCompletedStatus = Boolean(column.is_done_status);
    const now = new Date();

    const [task] = await this.knex<Task>('tasks')
      .insert({
        column_id: dto.column_id,
        title: dto.title,
        description: dto.description || undefined,
        assignee_id: primaryAssignee || undefined,
        priority: dto.priority || TaskPriority.MEDIUM,
        position: pos,
        due_date: dto.due_date ? new Date(dto.due_date) : undefined,
        target_time: dto.target_time ? new Date(dto.target_time) : undefined,
        started_at: now,
        completed_at: isCompletedStatus ? now : undefined,
      })
      .returning('*');

    // Sync task assignees
    const assignedEmpIds = await this.syncAssignees(
      task.id,
      dto.assignee_id,
      dto.assignee_ids,
    );

    // Create initial checklists if provided
    if (dto.checklists && dto.checklists.length > 0) {
      for (let i = 0; i < dto.checklists.length; i++) {
        const chk = dto.checklists[i];
        await this.knex('task_checklists').insert({
          task_id: task.id,
          title: chk.title,
          is_completed: chk.is_completed || false,
          position: chk.position !== undefined ? chk.position : i,
        });
      }
    }

    // Log activity
    await this.logActivity(
      task.id,
      currentUser?.id,
      'TASK_CREATED',
      `Task "${task.title}" created in column "${column.name}".`,
    );

    // Trigger Telegram Edition notification asynchronously
    if (assignedEmpIds.length > 0) {
      this.telegramBotService.sendTaskEditionNotification({
        taskTitle: task.title,
        columnName: column.name,
        dueDate: task.due_date,
        targetTime: task.target_time,
        changesSummary: `New task assigned to you in "${column.name}".`,
        assigneeEmployeeIds: assignedEmpIds,
      });
    }

    return this.getTaskById(task.id);
  }

  /**
   * Get task details by ID.
   */
  async getTaskById(id: string): Promise<any> {
    const task = await this.knex<Task>('tasks').where('id', id).first();
    if (!task) {
      throw new NotFoundException({
        message: `Task with ID '${id}' not found.`,
        location: 'task_not_found',
      });
    }

    const column = await this.knex('kanban_columns')
      .where('id', task.column_id)
      .first();

    const assignees = await this.getTaskAssignees(id);

    const checklists = await this.knex('task_checklists')
      .where('task_id', id)
      .orderBy('position', 'asc');

    const comments = await this.knex('task_comments as tc')
      .leftJoin('users as u', 'tc.user_id', 'u.id')
      .select(
        'tc.id',
        'tc.content',
        'tc.created_at',
        'tc.updated_at',
        'u.id as user_id',
        'u.username',
      )
      .where('tc.task_id', id)
      .orderBy('tc.created_at', 'asc');

    const attachments = await this.attachmentsService.listAttachmentsForEntity(
      'tasks',
      id,
    );

    const activityLogs = await this.knex('task_activity_logs')
      .where('task_id', id)
      .orderBy('created_at', 'desc');

    return {
      id: task.id,
      columnId: task.column_id,
      columnName: column ? column.name : null,
      columnColor: column ? column.color : null,
      title: task.title,
      description: task.description,
      priority: task.priority,
      position: task.position,
      dueDate: task.due_date,
      targetTime: task.target_time,
      startedAt: task.started_at,
      completedAt: task.completed_at,
      targetTimeNotified: Boolean(task.target_time_notified),
      assigneeId: task.assignee_id,
      assignees: assignees.map((a) => ({
        id: a.id,
        firstName: a.first_name,
        lastName: a.last_name,
        phone: a.phone,
        color: a.color,
      })),
      checklists: checklists.map((c) => ({
        id: c.id,
        title: c.title,
        isCompleted: Boolean(c.is_completed),
        position: c.position,
      })),
      attachments,
      comments: comments.map((c) => ({
        id: c.id,
        content: c.content,
        userId: c.user_id,
        username: c.username,
        createdAt: c.created_at,
      })),
      activityLogs: activityLogs.map((log) => ({
        id: log.id,
        userId: log.user_id,
        action: log.action,
        details: log.details,
        createdAt: log.created_at,
      })),
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    };
  }

  /**
   * List tasks with filters (column_id, assignee_id, priority, search, pagination).
   */
  async listTasks(query: {
    column_id?: string;
    assignee_id?: string;
    priority?: string;
    search?: string;
    limit?: string;
    offset?: string;
    page?: string;
    group_by_column?: string;
  }): Promise<{
    meta: {
      total: number;
      limit: number;
      offset: number;
      page: number;
      totalPages: number;
      column_counts?: Record<string, number>;
    };
    data: any;
  }> {
    const page = query.page ? Math.max(1, parseInt(query.page, 10)) : 1;
    const limit = query.limit
      ? Math.min(100, Math.max(1, parseInt(query.limit, 10)))
      : 50;
    const offset = query.offset
      ? parseInt(query.offset, 10)
      : (page - 1) * limit;

    let qb = this.knex('tasks as t')
      .join('kanban_columns as c', 't.column_id', 'c.id')
      .select(
        't.*',
        'c.name as column_name',
        'c.color as column_color',
        'c.position as column_position',
        'c.is_done_status as column_is_done_status',
      );

    let countQb = this.knex('tasks as t');

    if (query.column_id) {
      qb = qb.where('t.column_id', query.column_id);
      countQb = countQb.where('t.column_id', query.column_id);
    }
    if (query.priority) {
      qb = qb.where('t.priority', query.priority);
      countQb = countQb.where('t.priority', query.priority);
    }
    if (query.assignee_id) {
      const subFilter = (sub: any) => {
        sub
          .select('*')
          .from('task_assignees')
          .whereRaw('task_assignees.task_id = t.id')
          .where('task_assignees.employee_id', query.assignee_id);
      };
      qb = qb.whereExists(subFilter);
      countQb = countQb.whereExists(subFilter);
    }
    if (query.search) {
      const searchTerm = `%${query.search.trim()}%`;
      const searchFilter = (builder: any) => {
        builder
          .whereILike('t.title', searchTerm)
          .orWhereILike('t.description', searchTerm);
      };
      qb = qb.where(searchFilter);
      countQb = countQb.where(searchFilter);
    }

    const [{ total }] = await countQb.count('t.id as total');
    const totalCount = parseInt(total as string, 10);
    const totalPages = Math.ceil(totalCount / limit);

    const columnCountsQuery = this.knex('tasks as t')
      .select('t.column_id')
      .count('t.id as total')
      .groupBy('t.column_id');

    if (query.priority) columnCountsQuery.where('t.priority', query.priority);
    if (query.assignee_id) {
      columnCountsQuery.whereExists((sub) => {
        sub
          .select('*')
          .from('task_assignees')
          .whereRaw('task_assignees.task_id = t.id')
          .where('task_assignees.employee_id', query.assignee_id);
      });
    }
    if (query.search) {
      const searchTerm = `%${query.search.trim()}%`;
      columnCountsQuery.where((builder) => {
        builder
          .whereILike('t.title', searchTerm)
          .orWhereILike('t.description', searchTerm);
      });
    }

    const rawColumnCounts = await columnCountsQuery;
    const columnCounts: Record<string, number> = {};
    rawColumnCounts.forEach((cc: any) => {
      if (cc.column_id) {
        columnCounts[cc.column_id] = parseInt(cc.total as string, 10);
      }
    });

    const tasks = await qb
      .orderBy('c.position', 'asc')
      .orderBy('t.position', 'asc')
      .limit(limit)
      .offset(offset);

    const mappedTasks = tasks.map((t) => ({
      id: t.id,
      columnId: t.column_id,
      columnName: t.column_name,
      columnColor: t.column_color || null,
      columnPosition: t.column_position,
      columnIsDoneStatus: Boolean(t.column_is_done_status),
      title: t.title,
      description: t.description,
      priority: t.priority,
      position: t.position,
      dueDate: t.due_date,
      targetTime: t.target_time,
      startedAt: t.started_at,
      completedAt: t.completed_at,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));

    if (query.group_by_column === 'true') {
      const columns = await this.knex('kanban_columns').orderBy(
        'position',
        'asc',
      );

      const groupedData: Record<string, any> = {};
      for (const col of columns) {
        const colTasks = mappedTasks.filter((item) => item.columnId === col.id);
        groupedData[col.id] = {
          column: {
            id: col.id,
            board_id: col.board_id,
            name: col.name,
            position: col.position,
            color: col.color,
            is_done_status: Boolean(col.is_done_status),
          },
          metrics: {
            total_tasks: columnCounts[col.id] || 0,
            loaded_tasks: colTasks.length,
          },
          tasks: colTasks,
        };
      }

      return {
        meta: {
          total: totalCount,
          limit,
          offset,
          page,
          totalPages,
          column_counts: columnCounts,
        },
        data: groupedData,
      };
    }

    return {
      meta: {
        total: totalCount,
        limit,
        offset,
        page,
        totalPages,
        column_counts: columnCounts,
      },
      data: mappedTasks,
    };
  }

  /**
   * Viewable tasks grouped by column status.
   */
  async listTasksViewable(query: {
    column_id?: string;
    assignee_id?: string;
    priority?: string;
    search?: string;
    limit?: string;
    offset?: string;
    page?: string;
  }) {
    return this.listTasks({
      ...query,
      group_by_column: 'true',
    });
  }

  /**
   * Update task details and notify assigned employees.
   */
  async updateTask(
    id: string,
    dto: UpdateTaskDto,
    currentUser?: any,
  ): Promise<any> {
    const existingTask = await this.knex<Task>('tasks').where('id', id).first();
    if (!existingTask) {
      throw new NotFoundException({
        message: `Task with ID '${id}' not found.`,
        location: 'task_not_found',
      });
    }

    const changes: string[] = [];
    const updateData: any = {
      updated_at: this.knex.fn.now(),
    };

    let targetColumn = null;
    if (dto.column_id && dto.column_id !== existingTask.column_id) {
      targetColumn = await this.columnsService.validateStatusPermission(
        dto.column_id,
        currentUser?.role,
      );
      updateData.column_id = dto.column_id;
      changes.push(`Status changed to "${targetColumn.name}"`);

      // Update completed_at if column is a done status
      if (targetColumn.is_done_status) {
        updateData.completed_at = this.knex.fn.now();
      } else if (existingTask.completed_at) {
        updateData.completed_at = null;
      }
    }

    if (dto.title !== undefined && dto.title !== existingTask.title) {
      updateData.title = dto.title;
      changes.push(`Title changed to "${dto.title}"`);
    }

    if (
      dto.description !== undefined &&
      dto.description !== existingTask.description
    ) {
      updateData.description = dto.description;
      changes.push('Description updated');
    }

    if (
      dto.priority !== undefined &&
      (dto.priority as string) !== existingTask.priority
    ) {
      updateData.priority = dto.priority;
      changes.push(`Priority changed to "${dto.priority}"`);
    }

    if (dto.due_date !== undefined) {
      updateData.due_date = dto.due_date ? new Date(dto.due_date) : null;
      changes.push(`Due date updated`);
    }

    if (dto.target_time !== undefined) {
      updateData.target_time = dto.target_time
        ? new Date(dto.target_time)
        : null;
      updateData.target_time_notified = false; // Reset notification flag when target time is modified
      changes.push(`Target completion time updated`);
    }

    if (dto.position !== undefined) {
      updateData.position = dto.position;
    }

    // Save task updates
    await this.knex('tasks').where('id', id).update(updateData);

    // Sync assignees if provided
    let assignedEmpIds: string[] = [];
    if (dto.assignee_ids !== undefined || dto.assignee_id !== undefined) {
      assignedEmpIds = await this.syncAssignees(
        id,
        dto.assignee_id,
        dto.assignee_ids,
      );
      changes.push('Task assignees updated');
    } else {
      const currentAssignees = await this.getTaskAssignees(id);
      assignedEmpIds = currentAssignees.map((a) => a.id);
    }

    const changesText = changes.join(', ');
    await this.logActivity(
      id,
      currentUser?.id,
      'TASK_UPDATED',
      changesText || 'Task updated',
    );

    // Trigger Telegram notification to assigned employees
    if (assignedEmpIds.length > 0 && changes.length > 0) {
      const updatedTask = await this.knex('tasks').where('id', id).first();
      this.telegramBotService.sendTaskEditionNotification({
        taskTitle: updatedTask.title,
        columnName: targetColumn?.name,
        dueDate: updatedTask.due_date,
        targetTime: updatedTask.target_time,
        changesSummary: changesText,
        assigneeEmployeeIds: assignedEmpIds,
      });
    }

    return this.getTaskById(id);
  }

  /**
   * Move task across columns or positions.
   */
  async moveTask(
    id: string,
    dto: MoveTaskDto,
    currentUser?: any,
  ): Promise<any> {
    await this.columnsService.validateStatusPermission(
      dto.column_id,
      currentUser?.role,
    );

    return this.updateTask(
      id,
      {
        column_id: dto.column_id,
        position: dto.position,
      },
      currentUser,
    );
  }

  /**
   * Delete task by ID.
   */
  async deleteTask(id: string, currentUser?: any): Promise<void> {
    const task = await this.knex('tasks').where('id', id).first();
    if (!task) {
      throw new NotFoundException({
        message: `Task with ID '${id}' not found.`,
        location: 'task_not_found',
      });
    }

    await this.logActivity(
      id,
      currentUser?.id,
      'TASK_DELETED',
      `Task "${task.title}" deleted`,
    );

    await this.knex('tasks').where('id', id).del();
  }

  // ==========================================
  // CHECKLIST ITEMS
  // ==========================================

  async addChecklistItem(
    taskId: string,
    dto: CreateChecklistItemDto,
    currentUser?: any,
  ): Promise<any> {
    const task = await this.knex('tasks').where('id', taskId).first();
    if (!task) {
      throw new NotFoundException({
        message: `Task with ID '${taskId}' not found.`,
        location: 'task_not_found',
      });
    }

    let pos = dto.position;
    if (pos === undefined || pos === null) {
      const maxChk = await this.knex('task_checklists')
        .where('task_id', taskId)
        .max('position as maxPos')
        .first();
      pos =
        maxChk && maxChk.maxPos !== null ? (maxChk.maxPos as number) + 1 : 0;
    }

    const [item] = await this.knex('task_checklists')
      .insert({
        task_id: taskId,
        title: dto.title,
        is_completed: dto.is_completed || false,
        position: pos,
      })
      .returning('*');

    await this.logActivity(
      taskId,
      currentUser?.id,
      'CHECKLIST_ITEM_ADDED',
      `Checklist item "${dto.title}" added.`,
    );

    return {
      id: item.id,
      title: item.title,
      isCompleted: Boolean(item.is_completed),
      position: item.position,
    };
  }

  async updateChecklistItem(
    taskId: string,
    itemId: string,
    dto: UpdateChecklistItemDto,
    currentUser?: any,
  ): Promise<any> {
    const item = await this.knex('task_checklists')
      .where('id', itemId)
      .where('task_id', taskId)
      .first();

    if (!item) {
      throw new NotFoundException({
        message: `Checklist item with ID '${itemId}' not found for task '${taskId}'.`,
        location: 'checklist_item_not_found',
      });
    }

    const [updated] = await this.knex('task_checklists')
      .where('id', itemId)
      .update({
        ...dto,
        updated_at: this.knex.fn.now(),
      })
      .returning('*');

    await this.logActivity(
      taskId,
      currentUser?.id,
      'CHECKLIST_ITEM_UPDATED',
      `Checklist item "${updated.title}" updated (completed: ${updated.is_completed}).`,
    );

    return {
      id: updated.id,
      title: updated.title,
      isCompleted: Boolean(updated.is_completed),
      position: updated.position,
    };
  }

  async deleteChecklistItem(
    taskId: string,
    itemId: string,
    currentUser?: any,
  ): Promise<void> {
    const count = await this.knex('task_checklists')
      .where('id', itemId)
      .where('task_id', taskId)
      .del();

    if (count === 0) {
      throw new NotFoundException({
        message: `Checklist item with ID '${itemId}' not found.`,
        location: 'checklist_item_not_found',
      });
    }

    await this.logActivity(
      taskId,
      currentUser?.id,
      'CHECKLIST_ITEM_DELETED',
      `Checklist item removed.`,
    );
  }

  // ==========================================
  // TASK COMMENTS
  // ==========================================

  async addComment(
    taskId: string,
    dto: CreateTaskCommentDto,
    userId: string,
  ): Promise<any> {
    const task = await this.knex('tasks').where('id', taskId).first();
    if (!task) {
      throw new NotFoundException({
        message: `Task with ID '${taskId}' not found.`,
        location: 'task_not_found',
      });
    }

    const [comment] = await this.knex('task_comments')
      .insert({
        task_id: taskId,
        user_id: userId,
        content: dto.content,
      })
      .returning('*');

    await this.logActivity(
      taskId,
      userId,
      'COMMENT_ADDED',
      'Comment added to task.',
    );

    const user = await this.knex('users').where('id', userId).first();

    return {
      id: comment.id,
      content: comment.content,
      userId: comment.user_id,
      username: user ? user.username : null,
      createdAt: comment.created_at,
    };
  }

  async deleteComment(commentId: string, userId: string): Promise<void> {
    const comment = await this.knex('task_comments')
      .where('id', commentId)
      .first();
    if (!comment) {
      throw new NotFoundException({
        message: `Comment with ID '${commentId}' not found.`,
        location: 'comment_not_found',
      });
    }

    if (comment.user_id !== userId) {
      throw new ForbiddenException({
        message: 'You can only delete your own comments.',
        location: 'forbidden_comment_deletion',
      });
    }

    await this.knex('task_comments').where('id', commentId).del();
  }
}
