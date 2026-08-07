import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';

export interface KanbanBoard {
  id: string;
  name: string;
  description?: string;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class KanbanBoardsService {
  private readonly logger = new Logger(KanbanBoardsService.name);

  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  /**
   * Creates a new Kanban board with default columns: To Do, In Progress, Review, Done.
   */
  async createBoard(
    dto: CreateBoardDto,
    userId?: string,
  ): Promise<KanbanBoard> {
    const [board] = await this.knex<KanbanBoard>('kanban_boards')
      .insert({
        name: dto.name,
        description: dto.description || undefined,
        created_by: userId || undefined,
      })
      .returning('*');

    // Automatically seed standard workflow columns for the board
    const defaultColumns = ['To Do', 'In Progress', 'Review', 'Done'];
    for (let i = 0; i < defaultColumns.length; i++) {
      await this.knex('kanban_columns').insert({
        board_id: board.id,
        name: defaultColumns[i],
        position: i,
      });
    }

    return board;
  }

  /**
   * List all Kanban boards.
   */
  async listBoards(): Promise<KanbanBoard[]> {
    return this.knex<KanbanBoard>('kanban_boards').orderBy(
      'created_at',
      'desc',
    );
  }

  /**
   * Get a Kanban board by ID with its columns and nested tasks.
   */
  async getBoardById(id: string): Promise<any> {
    const board = await this.knex<KanbanBoard>('kanban_boards')
      .where('id', id)
      .first();

    if (!board) {
      throw new NotFoundException({
        message: `Kanban board with ID '${id}' not found.`,
        location: 'board_not_found',
      });
    }

    const columns = await this.knex('kanban_columns')
      .where('board_id', id)
      .orderBy('position', 'asc');

    const columnIds = columns.map((c) => c.id);

    let tasks: any[] = [];
    if (columnIds.length > 0) {
      tasks = await this.knex('tasks')
        .whereIn('column_id', columnIds)
        .orderBy('position', 'asc');

      const taskIds = tasks.map((t) => t.id);

      // Fetch task assignees
      let assignees: any[] = [];
      let checklists: any[] = [];
      let attachments: any[] = [];

      if (taskIds.length > 0) {
        assignees = await this.knex('task_assignees as ta')
          .join('employees as e', 'ta.employee_id', 'e.id')
          .select(
            'ta.task_id',
            'e.id as employee_id',
            'e.first_name',
            'e.last_name',
            'e.color as employee_color',
          )
          .whereIn('ta.task_id', taskIds);

        checklists = await this.knex('task_checklists')
          .whereIn('task_id', taskIds)
          .orderBy('position', 'asc');

        attachments = await this.knex('attachments')
          .where('entity_type', 'tasks')
          .whereIn('entity_id', taskIds);
      }

      // Map details to tasks
      tasks = tasks.map((t) => {
        const taskAssignees = assignees
          .filter((a) => a.task_id === t.id)
          .map((a) => ({
            id: a.employee_id,
            firstName: a.first_name,
            lastName: a.last_name,
            color: a.employee_color,
          }));

        const taskChecklists = checklists
          .filter((c) => c.task_id === t.id)
          .map((c) => ({
            id: c.id,
            title: c.title,
            isCompleted: Boolean(c.is_completed),
            position: c.position,
          }));

        const taskAttachments = attachments
          .filter((att) => att.entity_id === t.id)
          .map((att) => ({
            id: att.id,
            fileName: att.file_name,
            filePath: att.file_path,
            fileSize: att.file_size,
            mimeType: att.mime_type,
          }));

        return {
          id: t.id,
          columnId: t.column_id,
          title: t.title,
          description: t.description,
          priority: t.priority || 'MEDIUM',
          assigneeId: t.assignee_id,
          assignees: taskAssignees,
          position: t.position,
          dueDate: t.due_date,
          targetTime: t.target_time,
          startedAt: t.started_at,
          completedAt: t.completed_at,
          checklists: taskChecklists,
          attachments: taskAttachments,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        };
      });
    }

    const columnsWithTasks = columns.map((col) => ({
      id: col.id,
      boardId: col.board_id,
      name: col.name,
      position: col.position,
      color: col.color || null,
      isDoneStatus: Boolean(col.is_done_status),
      allowedRoles: col.allowed_roles
        ? typeof col.allowed_roles === 'string'
          ? JSON.parse(col.allowed_roles)
          : col.allowed_roles
        : null,
      tasks: tasks.filter((t) => t.columnId === col.id),
      createdAt: col.created_at,
      updatedAt: col.updated_at,
    }));

    return {
      id: board.id,
      name: board.name,
      description: board.description,
      createdBy: board.created_by,
      columns: columnsWithTasks,
      createdAt: board.created_at,
      updatedAt: board.updated_at,
    };
  }

  /**
   * Update a board by ID.
   */
  async updateBoard(id: string, dto: UpdateBoardDto): Promise<KanbanBoard> {
    const existing = await this.knex<KanbanBoard>('kanban_boards')
      .where('id', id)
      .first();

    if (!existing) {
      throw new NotFoundException({
        message: `Kanban board with ID '${id}' not found.`,
        location: 'board_not_found',
      });
    }

    const [updated] = await this.knex<KanbanBoard>('kanban_boards')
      .where('id', id)
      .update({
        ...dto,
        updated_at: this.knex.fn.now(),
      })
      .returning('*');

    return updated;
  }

  /**
   * Delete a board by ID.
   */
  async deleteBoard(id: string): Promise<void> {
    const count = await this.knex('kanban_boards').where('id', id).del();
    if (count === 0) {
      throw new NotFoundException({
        message: `Kanban board with ID '${id}' not found.`,
        location: 'board_not_found',
      });
    }
  }
}
