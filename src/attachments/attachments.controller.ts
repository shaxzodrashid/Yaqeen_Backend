import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AttachmentsService } from './attachments.service';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

export interface RequestUser {
  id: string;
  phone_number: string;
  role: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  /**
   * Upload an attachment file and link it to a database entity.
   */
  @Post('upload')
  @RequirePermission('attachments', 'create')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
    @Body() dto: UploadAttachmentDto,
  ) {
    if (!file) {
      throw new BadRequestException({
        message: 'No file uploaded',
        location: 'file_missing',
      });
    }

    return this.attachmentsService.uploadAndCreateAttachment(
      file,
      dto.entity_type,
      dto.entity_id,
      user.id,
    );
  }

  /**
   * Get attachment details by ID.
   */
  @Get(':id')
  @RequirePermission('attachments', 'read')
  async getAttachment(@Param('id', ParseUUIDPipe) id: string) {
    return this.attachmentsService.getAttachment(id);
  }

  /**
   * Get a temporary presigned URL to download the attachment.
   */
  @Get(':id/download')
  @RequirePermission('attachments', 'read')
  async getDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('expiry') expiry?: string,
  ) {
    const expiryInSeconds = expiry ? parseInt(expiry, 10) : undefined;
    const downloadUrl =
      await this.attachmentsService.getPresignedUrlForAttachment(
        id,
        expiryInSeconds,
      );
    return { downloadUrl };
  }

  /**
   * Delete an attachment.
   */
  @Delete(':id')
  @RequirePermission('attachments', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAttachment(@Param('id', ParseUUIDPipe) id: string) {
    await this.attachmentsService.deleteAttachment(id);
  }

  /**
   * List all attachments linked to a specific entity.
   */
  @Get('entity/:entity_type/:entity_id')
  @RequirePermission('attachments', 'read')
  async listEntityAttachments(
    @Param('entity_type') entityType: string,
    @Param('entity_id', ParseUUIDPipe) entityId: string,
  ) {
    return this.attachmentsService.listAttachmentsForEntity(
      entityType,
      entityId,
    );
  }
}
