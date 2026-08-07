import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { KanbanBoardsController } from './kanban-boards.controller';
import { KanbanBoardsService } from './kanban-boards.service';
import { KanbanColumnsController } from './kanban-columns.controller';
import { KanbanColumnsService } from './kanban-columns.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskTargetTimeSchedulerService } from './task-target-time-scheduler.service';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AttachmentsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [
    KanbanBoardsController,
    KanbanColumnsController,
    TasksController,
  ],
  providers: [
    KanbanBoardsService,
    KanbanColumnsService,
    TasksService,
    TaskTargetTimeSchedulerService,
  ],
  exports: [KanbanBoardsService, KanbanColumnsService, TasksService],
})
export class KanbanModule {}
