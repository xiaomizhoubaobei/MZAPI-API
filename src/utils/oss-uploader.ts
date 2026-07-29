import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';

/**
 * 本地 OSS 上传器
 *
 * 将文件写入 OSS 桶挂载的本地目录（默认 data/oss）
 * 单例模式，启动时从环境变量读取配置
 */
export class OssUploader {
  private static instance: OssUploader;
  private readonly logger = new Logger(OssUploader.name);
  private baseDir: string;
  private enabled: boolean;

  private constructor() {
    this.baseDir = process.env.OSS_BASE_DIR || 'data/oss';
    this.enabled = true;

    // 确保基础目录存在
    try {
      fs.mkdirSync(this.baseDir, { recursive: true });
      this.logger.log(
        `OSS uploader initialized, baseDir=${path.resolve(this.baseDir)}`,
      );
    } catch (error) {
      this.enabled = false;
      this.logger.error(
        `Failed to create OSS base directory ${this.baseDir}: ${(error as Error).message}`,
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
   * 写入 JSON 内容到本地 OSS 目录
   * @param key - 文件相对路径（如 YYYY/MM/DD/requestId.json）
   * @param body - JSON 字符串内容
   */
  async upload(key: string, body: string): Promise<void> {
    if (!this.enabled) return;

    try {
      const filePath = path.join(this.baseDir, key);
      const dir = path.dirname(filePath);

      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(filePath, body, 'utf-8');

      this.logger.debug(`Log saved to: ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to save log: ${(error as Error).message}`);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
