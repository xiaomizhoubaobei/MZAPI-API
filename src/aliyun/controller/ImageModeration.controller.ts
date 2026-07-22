import { Controller, All, Body, Headers, Res } from '@nestjs/common';
import { Response } from 'express';
import { Logger } from '@nestjs/common';
import { ImageModerationService } from '../service';
import { ImageModerationDto } from '../DTO';
import { UnauthorizedException } from '@nestjs/common';

@Controller('aliyun')
/**
 * 阿里云图片内容审核控制器
 */
export class ImageModerationController {
  private readonly logger = new Logger(ImageModerationController.name);

  /**
   * 构造函数
   * @param imageModerationService - 图片审核服务实例
   */
  constructor(
    private readonly imageModerationService: ImageModerationService,
  ) {}

  /**
   * 处理图片内容审核请求
   * @param imageModerationDto - 包含图片审核参数的数据传输对象
   * @param headers - 请求头信息
   * @returns 返回图片审核结果
   */
  @All('image-moderation')
  async imageModeration(
    @Body() imageModerationDto: ImageModerationDto,
    @Headers() headers: Record<string, string>,
    @Res({ passthrough: true }) res?: Response,
  ) {
    this.logger.log(
      `收到图片审核请求，服务类型: ${imageModerationDto.service}`,
    );
    this.logger.debug(`请求头信息: ${JSON.stringify(headers)}`);
    try {
      const result =
        await this.imageModerationService.imageModeration(imageModerationDto);
      this.logger.debug(
        `图片审核完成，服务类型: ${imageModerationDto.service}`,
      );
      return result;
    } catch (error) {
      // 鉴权/凭证类失败：以 401 成功响应路径返回，
      // 确保响应侧拦截器（Service/Server-Timing/Content-Digest/gzip 等）仍会执行。
      if (error instanceof UnauthorizedException) {
        this.logger.error(`图片审核失败: ${error.message}`);
        if (res) {
          res.status(401);
        }
        return {
          statusCode: 401,
          message: error.message,
          error: 'Unauthorized',
        };
      }
      this.logger.error(`图片审核失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
