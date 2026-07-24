import OSS from 'ali-oss';
import { Logger } from '@nestjs/common';

/**
 * 阿里云 OSS 上传器（基于官方 ali-oss SDK）
 * 单例模式，启动时从环境变量读取配置
 */
export class OssUploader {
  private static instance: OssUploader;
  private readonly logger = new Logger(OssUploader.name);
  private client: OSS | null = null;
  private bucket: string;
  private enabled: boolean;

  private constructor() {
    const region = process.env.OSS_REGION || 'oss-cn-hangzhou';
    const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
    const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
    const endpoint = process.env.OSS_ENDPOINT;
    this.bucket = process.env.OSS_BUCKET || '';

    if (accessKeyId && accessKeySecret && this.bucket) {
      const config: OSS.Options = {
        region,
        accessKeyId,
        accessKeySecret,
        bucket: this.bucket,
        authorizationV4: true,
      };

      // 如果指定了自定义 endpoint（内网/传输加速/自定义域名等），覆盖默认 endpoint
      if (endpoint) {
        config.endpoint = endpoint;
      }

      this.client = new OSS(config);
      this.enabled = true;
      this.logger.log(
        `OSS uploader initialized, region=${region}, bucket=${this.bucket}`,
      );
    } else {
      this.enabled = false;
      this.logger.warn(
        'OSS configuration incomplete (missing OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET/OSS_BUCKET), API log upload disabled',
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
      await this.client.put(key, Buffer.from(body), {
        mime: 'application/json',
      });
      this.logger.debug(`Log uploaded to OSS: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to upload log to OSS: ${error.message}`);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
