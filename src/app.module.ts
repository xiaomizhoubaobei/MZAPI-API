import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AliyunModule } from './aliyun';
import { AppController } from './app.controller';
import {
  CdnEdgeoneProxyInterceptor,
  CorsInterceptor,
  PostOnlyInterceptor,
  NoCacheInterceptor,
  ContentDigestInterceptor,
  ContentLanguageInterceptor,
  SecurityHeadersInterceptor,
  ServerTimingInterceptor,
  TimeoutInterceptor,
  BodySizeLimitInterceptor,
  RequestIdInterceptor,
  LoggingInterceptor,
  SensitiveDataInterceptor,
} from './interceptors';

@Module({
  imports: [AliyunModule],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: CorsInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SecurityHeadersInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CdnEdgeoneProxyInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: PostOnlyInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: NoCacheInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ContentDigestInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ContentLanguageInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ServerTimingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: BodySizeLimitInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestIdInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SensitiveDataInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
