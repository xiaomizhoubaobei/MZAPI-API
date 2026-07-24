import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { OssUploader } from '../utils/oss-uploader';

/**
 * 敏感字段列表（全量掩码：替换为 ***）
 */
const FULL_MASK_FIELDS = new Set([
  'apiKey',
  'accessKeySecret',
  'secret',
  'password',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'privateKey',
  'private_key',
]);

/**
 * 部分掩码字段（保留前 4 后 4 字符）
 */
const PARTIAL_MASK_FIELDS = new Set([
  'accessKeyId',
  'apiKeyId',
  'clientId',
  'client_id',
  'secretId',
  'secret_id',
  'appId',
  'app_id',
]);

/**
 * 敏感 Header 名称（小写）
 */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
  'x-forwarded-for',
  'x-real-ip',
  'x-csrf-token',
]);

/**
 * 敏感 Query 参数名（小写）
 */
const SENSITIVE_QUERY_PARAMS = new Set([
  'apikey',
  'api_key',
  'token',
  'access_token',
  'accesstoken',
  'key',
  'secret',
  'password',
  'apisecret',
]);

/**
 * 对敏感字符串做全量掩码
 */
function fullMask(): string {
  return '***';
}

/**
 * 对敏感字符串做部分掩码（保留前 4 后 4）
 */
function partialMask(value: string): string {
  if (!value || value.length <= 8) return fullMask();
  return value.slice(0, 4) + '***' + value.slice(-4);
}

/**
 * 对 Header 值做脱敏
 */
function maskHeaderValue(headerName: string, value: string): string {
  if (!value) return '';
  const lower = headerName.toLowerCase();
  if (lower === 'authorization' || lower === 'proxy-authorization') {
    // Bearer xxx → Bearer ***
    return value.replace(/^(\S+\s+).+$/, '$1***');
  }
  if (lower === 'cookie' || lower === 'set-cookie') {
    return '***';
  }
  if (lower === 'x-forwarded-for' || lower === 'x-real-ip') {
    // 保留 IP 前三段
    return value.replace(/(\d+\.\d+\.\d+)\.\d+/, '$1.*');
  }
  return fullMask();
}

/**
 * 递归脱敏对象/数组
 */
function sanitizeValue(key: string | undefined, value: any, depth = 0): any {
  if (depth > 20) return '[MAX_DEPTH]';

  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (key && FULL_MASK_FIELDS.has(key)) {
      return fullMask();
    }
    if (key && PARTIAL_MASK_FIELDS.has(key)) {
      return partialMask(value);
    }
    // 检查字符串中是否包含常见的密钥模式
    if (looksLikeSecret(value)) {
      return fullMask();
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(undefined, item, depth + 1));
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      sanitized[k] = sanitizeValue(k, v, depth + 1);
    }
    return sanitized;
  }

  return value;
}

/**
 * 检查字符串是否看起来像密钥/Token
 */
function looksLikeSecret(value: string): boolean {
  if (value.length < 16) return false;
  // sk-xxx 开头的 API Key
  if (/^sk-[A-Za-z0-9]{20,}/.test(value)) return true;
  // 纯 Base64 编码的长字符串（通常是密钥）
  if (/^[A-Za-z0-9+/=]{32,}$/.test(value)) return true;
  return false;
}

/**
 * 脱敏请求头
 */
function sanitizeHeaders(headers: Record<string, any>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(name.toLowerCase())) {
      sanitized[name] = maskHeaderValue(name, String(value));
    } else {
      sanitized[name] = typeof value === 'string' ? value : String(value);
    }
  }
  return sanitized;
}

/**
 * 脱敏 Query 参数
 */
function sanitizeQuery(
  query: Record<string, any>,
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [name, value] of Object.entries(query)) {
    if (SENSITIVE_QUERY_PARAMS.has(name.toLowerCase())) {
      sanitized[name] = fullMask();
    } else {
      sanitized[name] = typeof value === 'string' ? value : String(value);
    }
  }
  return sanitized;
}

/**
 * 判断是否为系统 API（不记录）
 */
function isSystemRoute(method: string, url: string): boolean {
  // GET / 是系统 API 列表，不记录
  if (method.toUpperCase() === 'GET' && (url === '/' || url === '')) {
    return true;
  }
  // 排除健康检查等通用系统端点
  if (/^\/health(check)?$/i.test(url) && method.toUpperCase() === 'GET') {
    return true;
  }
  return false;
}

/**
 * 生成 OSS 存储路径: YYYY/MM/DD/{requestId}.json
 */
function ossKey(requestId: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${d}/${requestId}.json`;
}

export interface RequestLog {
  requestId: string;
  timestamp: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  requestBody: any;
  statusCode?: number;
  responseBody?: any;
  duration?: number;
  streamMode?: boolean;
  error?: string;
}

@Injectable()
export class SensitiveDataInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SensitiveDataInterceptor.name);
  private readonly uploader = OssUploader.getInstance();

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url } = request;
    const requestId = request.requestId || '-';
    const start = Date.now();

    // 系统 API 不记录
    if (isSystemRoute(method, url)) {
      return next.handle();
    }

    // 判断是否为流式（SSE）请求
    const isStream = this.isStreamRequest(request);

    // 构建请求日志
    const log: RequestLog = {
      requestId,
      timestamp: new Date().toISOString(),
      method,
      url,
      headers: sanitizeHeaders(request.headers || {}),
      query: sanitizeQuery(request.query || {}),
      requestBody: sanitizeValue(undefined, request.body || {}),
      streamMode: isStream,
    };

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - start;
          log.statusCode = response.statusCode;
          log.duration = duration;

          if (!isStream) {
            log.responseBody = sanitizeValue(undefined, data);
          }

          // 异步上传，不阻塞响应
          this.asyncUpload(log);
        },
        error: (error) => {
          const duration = Date.now() - start;
          log.statusCode = error.status || 500;
          log.duration = duration;
          log.error = error.message || 'Unknown error';

          // 异步上传，不阻塞
          this.asyncUpload(log);
        },
      }),
    );
  }

  /**
   * 判断请求是否为流式（SSE）请求
   */
  private isStreamRequest(request: any): boolean {
    // 检查 body 中的 stream 标志
    if (request.body && request.body.stream === true) {
      return true;
    }
    // 检查 Accept header
    const accept = request.headers?.accept || '';
    if (accept.includes('text/event-stream')) {
      return true;
    }
    return false;
  }

  /**
   * 异步上传日志到 OSS（fire-and-forget）
   */
  private asyncUpload(log: RequestLog): void {
    const key = ossKey(log.requestId);
    const body = JSON.stringify(log);

    this.uploader.upload(key, body).catch((err) => {
      this.logger.error(
        `Failed to upload request log [${log.requestId}]: ${err.message}`,
      );
    });
  }
}
