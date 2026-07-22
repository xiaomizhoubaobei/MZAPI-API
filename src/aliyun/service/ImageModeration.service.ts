import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
const RPCClient = require('@alicloud/pop-core');
import { ImageModerationDto } from '../DTO';
import { AliyunValidationUtils } from '../../utils';

@Injectable()
/**
 * 阿里云图片内容审核服务
 */
export class ImageModerationService {
  private readonly logger = new Logger(ImageModerationService.name);
  /**
   * 阿里云鉴权失败相关的错误码，用于将其映射为 401 Unauthorized
   */
  private static readonly AUTH_ERROR_CODES = new Set([
    'InvalidAccessKeyId',
    'SignatureDoesNotMatch',
    'Forbidden',
    'Forbidden.RAM',
    'IllegalTimestamp',
    'InvalidSecurityToken',
    'MissingAuthenticationToken',
    'ExpiredToken',
    'UnsupportedSignatureType',
  ]);

  /**
   * 规范化阿里云服务端点：确保以 http:// 或 https:// 开头。
   * @alicloud/pop-core 要求在构造 RPCClient 时 endpoint 必须带协议头，
   * 而调用方可能仅传入裸域名（如 green-cip.cn-shanghai.aliyuncs.com）。
   * @param endpoint - 原始服务端点
   * @returns 带协议头的服务端点
   */
  private static normalizeEndpoint(endpoint: string): string {
    const schemeRegex = new RegExp('^https?://', 'i');
    if (schemeRegex.test(endpoint)) {
      return endpoint;
    }
    return `https://${endpoint}`;
  }

  /**
   * 判断给定的阿里云调用异常是否属于鉴权失败，以便映射为 401。
   * @param error - 捕获到的异常
   * @returns 是否为鉴权类错误
   */
  private static isAuthError(error: any): boolean {
    if (!error) {
      return false;
    }
    const code: string = error.code || '';
    const name: string = error.name || '';
    if (
      ImageModerationService.AUTH_ERROR_CODES.has(code) ||
      [...ImageModerationService.AUTH_ERROR_CODES].some(
        (c) => code.startsWith(c) || name.startsWith(c),
      )
    ) {
      return true;
    }
    const message: string = error.message || '';
    const authRegex = new RegExp(
      '\\b(access ?key|signature|forbidden|unauthor|security ?token|expired ?token|authentication)\\b',
      'i',
    );
    return authRegex.test(message) || authRegex.test(name);
  }

  /**
   * 执行图片内容审核
   * @param params - 包含阿里云认证信息和图片URL的数据传输对象
   * @returns 返回阿里云内容安全API的审核结果
   * @throws {Error} 当API调用失败时抛出错误
   */
  async imageModeration(params: ImageModerationDto) {
    // 规范化 endpoint，确保 @alicloud/pop-core 能够成功构造客户端
    const endpoint = ImageModerationService.normalizeEndpoint(params.endpoint);

    // 每次请求时创建新的客户端实例
    const client = new RPCClient({
      accessKeyId: params.accessKeyId,
      accessKeySecret: params.accessKeySecret,
      endpoint,
      apiVersion: '2022-03-02',
    });

    // 验证service类型
    AliyunValidationUtils.validateServiceType(params.service);

    // 验证必传参数
    AliyunValidationUtils.validateRequiredParams({
      accessKeyId: params.accessKeyId,
      accessKeySecret: params.accessKeySecret,
      endpoint: params.endpoint,
    });

    // 检查imageUrl是否存在
    AliyunValidationUtils.validateImageUrl(params.imageUrl);

    const requestParams = {
      Service: params.service || 'baselineCheck',
      ServiceParameters: JSON.stringify({
        dataId: uuidv4(),
        imageUrl: params.imageUrl,
      }),
    };

    const requestOption = {
      method: 'POST',
      formatParams: false,
    };

    try {
      this.logger.debug(
        `开始调用阿里云内容安全API，服务类型: ${params.service}`,
      );
      this.logger.verbose(`请求参数: ${JSON.stringify(requestParams)}`);

      const result = await client.request(
        'ImageModeration',
        requestParams,
        requestOption,
      );

      this.logger.debug(`阿里云API调用成功，服务类型: ${params.service}`);
      this.logger.verbose(`返回结果: ${JSON.stringify(result)}`);

      return result;
    } catch (error) {
      this.logger.error(
        `阿里云内容安全API调用失败: ${error.message}`,
        error.stack,
      );
      // 鉴权/凭证相关的失败应映射为 401 Unauthorized，
      // 其余异常保持为 500 内部错误。
      if (ImageModerationService.isAuthError(error)) {
        throw new UnauthorizedException('阿里云鉴权失败: ' + error.message);
      }
      throw new Error('阿里云内容安全API调用失败: ' + error.message);
    }
  }
}
