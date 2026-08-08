import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import 'multer';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { MinioService } from '../minio/minio.service';
import * as crypto from 'crypto';

export interface Attachment {
  id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface AttachmentResponse {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const ENTITY_TABLE_MAP: Record<string, string> = {
  tasks: 'tasks',
  commercial_offers: 'commercial_offers',
  employees: 'employees',
  clients: 'clients',
  cargo_transactions: 'cargo_transactions',
  expenses: 'expenses',
  users: 'users',
};

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly minioService: MinioService,
  ) {}

  /**
   * Helper to validate entity types and match to database tables.
   */
  private getEntityTableName(entityType: string): string {
    const tableName = ENTITY_TABLE_MAP[entityType];
    if (!tableName) {
      throw new BadRequestException({
        message: `Invalid entity_type: '${entityType}'. Must be one of: ${Object.keys(ENTITY_TABLE_MAP).join(', ')}`,
        location: 'invalid_entity_type',
      });
    }
    return tableName;
  }

  /**
   * Validate file size and type.
   */
  private validateFile(file: Express.Multer.File) {
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_SIZE) {
      throw new BadRequestException({
        message: 'File size exceeds the limit of 50MB',
        location: 'file_too_large',
      });
    }

    const blacklistedExtensions = [
      '.exe',
      '.dll',
      '.bat',
      '.sh',
      '.cmd',
      '.msi',
      '.com',
    ];
    const originalName = file.originalname || '';
    const lastDotIndex = originalName.lastIndexOf('.');
    if (lastDotIndex !== -1) {
      const ext = originalName.substring(lastDotIndex).toLowerCase();
      if (blacklistedExtensions.includes(ext)) {
        throw new BadRequestException({
          message:
            'Upload of executable or potentially dangerous file types is forbidden',
          location: 'dangerous_file_type',
        });
      }
    }
  }

  /**
   * Helper to format a database row to a clean camelCase object.
   */
  private formatAttachment(
    row: Attachment | undefined,
  ): AttachmentResponse | null {
    if (!row) return null;
    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      fileName: row.file_name,
      filePath: row.file_path,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Upload file to MinIO and save metadata in the database.
   * Cleans up MinIO upload if the database insertion fails.
   */
  async uploadAndCreateAttachment(
    file: Express.Multer.File,
    entityType: string,
    entityId: string,
    uploadedBy: string,
  ): Promise<AttachmentResponse> {
    // Validate file size/type and entity type
    this.validateFile(file);
    const tableName = this.getEntityTableName(entityType);

    // Verify entity exists in the database
    const entityExists = (await this.knex(tableName)
      .where('id', entityId)
      .first()) as Record<string, unknown> | undefined;
    if (!entityExists) {
      throw new BadRequestException({
        message: `Entity of type '${entityType}' with ID '${entityId}' was not found.`,
        location: 'entity_not_found',
      });
    }

    const fileId = crypto.randomUUID();
    const originalName = file.originalname || 'unnamed_file';
    const lastDotIndex = originalName.lastIndexOf('.');
    const extension =
      lastDotIndex !== -1 ? originalName.substring(lastDotIndex) : '';
    const uniquePath = `attachments/${entityType}/${entityId}/${fileId}${extension}`;

    // Upload to MinIO
    await this.minioService.uploadFile(file, uniquePath);

    // Record metadata in database
    try {
      const records = await this.knex<Attachment>('attachments')
        .insert({
          id: fileId,
          entity_type: entityType,
          entity_id: entityId,
          file_name: originalName,
          file_path: uniquePath,
          file_size: file.size,
          mime_type: file.mimetype || 'application/octet-stream',
          uploaded_by: uploadedBy,
        })
        .returning('*');

      const record = records[0];
      return this.formatAttachment(record)!;
    } catch (dbError) {
      const errMsg =
        dbError instanceof Error ? dbError.message : String(dbError);
      this.logger.error(
        `Database insertion failed for attachment ${fileId}: ${errMsg}. Cleaning up MinIO file...`,
      );
      try {
        await this.minioService.deleteFile(uniquePath);
      } catch (cleanupError) {
        const cleanupErrMsg =
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError);
        this.logger.error(
          `Failed to clean up MinIO file ${uniquePath} after database error: ${cleanupErrMsg}`,
        );
      }
      throw dbError;
    }
  }

  /**
   * Retrieve attachment metadata details by ID.
   */
  async getAttachment(id: string): Promise<AttachmentResponse> {
    const record = await this.knex<Attachment>('attachments')
      .where('id', id)
      .first();
    if (!record) {
      throw new NotFoundException({
        message: `Attachment with ID '${id}' not found.`,
        location: 'attachment_not_found',
      });
    }
    return this.formatAttachment(record)!;
  }

  /**
   * Generate secure temporary presigned download link for an attachment.
   */
  async getPresignedUrlForAttachment(
    id: string,
    expiryInSeconds?: number,
  ): Promise<string> {
    const attachment = await this.getAttachment(id);
    const url = await this.minioService.getPresignedUrl(
      attachment.filePath,
      expiryInSeconds,
    );
    return url;
  }

  /**
   * Delete attachment metadata from database and delete file from MinIO.
   */
  async deleteAttachment(id: string): Promise<void> {
    const attachment = await this.knex<Attachment>('attachments')
      .where('id', id)
      .first();
    if (!attachment) {
      throw new NotFoundException({
        message: `Attachment with ID '${id}' not found.`,
        location: 'attachment_not_found',
      });
    }

    // Run DB deletion and MinIO deletion
    await this.knex('attachments').where('id', id).del();

    try {
      await this.minioService.deleteFile(attachment.file_path);
    } catch (minioError) {
      const errMsg =
        minioError instanceof Error ? minioError.message : String(minioError);
      this.logger.warn(
        `MinIO file deletion failed for path ${attachment.file_path}: ${errMsg}. Database record was deleted successfully.`,
      );
    }
  }

  /**
   * List attachments related to a specific entity.
   */
  async listAttachmentsForEntity(
    entityType: string,
    entityId: string,
  ): Promise<AttachmentResponse[]> {
    // Validate table
    this.getEntityTableName(entityType);

    const records = await this.knex<Attachment>('attachments')
      .where('entity_type', entityType)
      .where('entity_id', entityId)
      .orderBy('created_at', 'desc');

    return records.map((row) => this.formatAttachment(row)!);
  }
}
