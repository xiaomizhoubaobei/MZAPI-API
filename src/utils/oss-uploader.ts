import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';

/**
 * 阿里云 OSS 上传器（基于 S3 兼容 API）
 * 单例模式，启动时从环境变量读取配置
 */
export class OssUploader {
  private static instance: OssUploader;
  private readonly logger = new Logger(OssUploader.name);
  private client: S3Client | null = null;
  private bucket: string;
  private enabled: boolean;

  private constructor() {
    const endpoint = process.env.OSS_ENDPOINT;
    const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
    const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
    const region = process.env.OSS_REGION || 'oss-cn-hangzhou';
    this.bucket = process.env.OSS_BUCKET || '';

    if (endpoint && accessKeyId && accessKeySecret && this.bucket) {
      this.client = new S3Client({
        endpoint,
        region,
        credentials: {
          accessKeyId,
          secretAccessKey: accessKeySecret,
        },
        forcePathStyle: true,
      });
      this.enabled = true;
      this.logger.log(
        `OSS uploader initialized, endpoint=${endpoint}, bucket=${this.bucket}`,
      );
    } else {
      this.enabled = false;
      this.logger.warn(
        'OSS configuration incomplete (missing OSS_ENDPOINT/OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET/OSS_BUCKET), API log upload disabled',
      );
    }
  }

  static getInstance(): OssUploader {
    if (!OssUploader.instance) {
      OssUploader.instance = new OssUploader();
    }
    return OssUploader.instance;
  }

  /**
   * 异步上传 JSON 内容到 OSS
   * @param key - OSS 对象 key
   * @param body - JSON 字符串内容
   */
  async upload(key: string, body: string): Promise<void> {
    if (!this.enabled || !this.client) return;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: 'application/json',
        }),
      );
      this.logger.debug(`Log uploaded to OSS: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to upload log to OSS: ${error.message}`);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
