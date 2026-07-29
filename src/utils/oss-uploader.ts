import * as fs from 'fs';
import * as path from 'path';

const BASE_DIR = process.env.OSS_BASE_DIR || 'data/oss';

// 确保基础目录存在
try {
  fs.mkdirSync(BASE_DIR, { recursive: true });
} catch {
  // 静默忽略，子目录会按需创建
}

/**
 * 将日志内容写入 OSS 挂载目录
 * @param key - 文件相对路径（如 YYYY/MM/DD/requestId.json）
 * @param body - JSON 字符串内容
 */
export async function saveLog(key: string, body: string): Promise<void> {
  const filePath = path.join(BASE_DIR, key);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, body, 'utf-8');
}
