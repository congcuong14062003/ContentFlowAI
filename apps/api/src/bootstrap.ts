import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger, PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GlobalExceptionFilter, ResponseInterceptor } from './common/http';
import type { Environment } from './config/environment';
import { requestContext } from './common/request-context';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export async function configureApp(app: INestApplication) {
  const config = app.get(ConfigService<Environment, true>);
  app.useLogger(app.get(Logger));
  app.use((request: Request, response: Response, next: NextFunction) => {
    const supplied = request.headers['x-request-id'];
    request.id = typeof supplied === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(supplied) ? supplied : randomUUID();
    response.setHeader('x-request-id', String(request.id));
    requestContext.run({ requestId: String(request.id) }, next);
  });
  app.use(helmet());
  app.enableCors({ origin: config.get('WEB_ORIGIN'), credentials: true, exposedHeaders: ['x-request-id'] });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false } }));
  app.useGlobalFilters(new GlobalExceptionFilter(await app.resolve(PinoLogger)));
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableShutdownHooks();
  if (config.get('NODE_ENV') !== 'production') {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('ContentFlow AI').setVersion('1').addBearerAuth().build());
    SwaggerModule.setup('api/docs', app, document);
  }
}
