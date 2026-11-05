import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Environment } from '../config/environment';

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Environment, true>) {
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT'), region: config.get('S3_REGION'),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE'),
      credentials: { accessKeyId: config.get('S3_ACCESS_KEY'), secretAccessKey: config.get('S3_SECRET_KEY') },
      maxAttempts: 1
    });
  }
  async check(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.config.get('S3_BUCKET') }), { abortSignal: AbortSignal.timeout(3000) });
  }
  async put(key: string, body: Buffer, mimeType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.config.get('S3_BUCKET'), Key: key, Body: body, ContentType: mimeType }), { abortSignal: AbortSignal.timeout(10000) });
  }
  async read(key: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.get('S3_BUCKET'), Key: key }), { abortSignal: AbortSignal.timeout(10000) });
    if (!result.Body) throw new Error('Missing object');
    return Buffer.from(await result.Body.transformToByteArray());
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.get('S3_BUCKET'), Key: key }), { abortSignal: AbortSignal.timeout(10000) });
  }
  onModuleDestroy() { this.client.destroy(); }
}
