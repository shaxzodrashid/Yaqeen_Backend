import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import 'multer';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private minioClient: Minio.Client;
  private defaultBucket: string;

  constructor(private readonly configService: ConfigService) {
    const endPoint =
      this.configService.get<string>('minio.endpoint') || '127.0.0.1';
    const port = this.configService.get<number>('minio.port') || 9000;
    const useSSL = this.configService.get<boolean>('minio.useSSL') || false;
    const accessKey = this.configService.get<string>('minio.accessKey') || '';
    const secretKey = this.configService.get<string>('minio.secretKey') || '';
    this.defaultBucket =
      this.configService.get<string>('minio.bucketName') ||
      'yaqeen-attachments';

    this.minioClient = new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });
  }

  async onModuleInit() {
    await this.ensureBucketExists(this.defaultBucket);
  }

  /**
   * Asserts that a bucket exists, creating it if it doesn't.
   */
  async ensureBucketExists(bucketName: string): Promise<void> {
    try {
      const exists = await this.minioClient.bucketExists(bucketName);
      if (!exists) {
        // Create the bucket. Note that 'us-east-1' is the default region
        await this.minioClient.makeBucket(bucketName, 'us-east-1');
        this.logger.log(`MinIO bucket "${bucketName}" created successfully.`);
      } else {
        this.logger.log(`MinIO bucket "${bucketName}" verified.`);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to ensure bucket "${bucketName}" exists: ${errMsg}`,
      );
      throw error;
    }
  }

  /**
   * Upload a file buffer to MinIO at the specified path/key.
   */
  async uploadFile(
    file: Express.Multer.File,
    path: string,
    bucketName: string = this.defaultBucket,
  ): Promise<string> {
    try {
      await this.minioClient.putObject(
        bucketName,
        path,
        file.buffer,
        file.size,
        {
          'Content-Type': file.mimetype,
        },
      );
      this.logger.debug(`File uploaded successfully to path: ${path}`);
      return path;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error uploading file to MinIO at path ${path}: ${errMsg}`,
      );
      throw error;
    }
  }

  /**
   * Generate a secure presigned URL for retrieving/downloading a file.
   */
  async getPresignedUrl(
    path: string,
    expiryInSeconds: number = 3600, // Default 1 hour
    bucketName: string = this.defaultBucket,
  ): Promise<string> {
    try {
      const url = await this.minioClient.presignedGetObject(
        bucketName,
        path,
        expiryInSeconds,
      );

      const publicUrl = this.configService.get<string>('minio.publicUrl');
      if (publicUrl) {
        const endPoint =
          this.configService.get<string>('minio.endpoint') || '127.0.0.1';
        const port = this.configService.get<number>('minio.port') || 9000;
        const useSSL = this.configService.get<boolean>('minio.useSSL') || false;
        const protocol = useSSL ? 'https' : 'http';
        const internalBase = `${protocol}://${endPoint}:${port}`;

        return url.replace(internalBase, publicUrl.replace(/\/$/, ''));
      }

      return url;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error generating presigned URL for path ${path}: ${errMsg}`,
      );
      throw error;
    }
  }

  /**
   * Remove a file from MinIO.
   */
  async deleteFile(
    path: string,
    bucketName: string = this.defaultBucket,
  ): Promise<void> {
    try {
      await this.minioClient.removeObject(bucketName, path);
      this.logger.debug(`File deleted successfully from path: ${path}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error deleting file from MinIO at path ${path}: ${errMsg}`,
      );
      throw error;
    }
  }
}
