import {
  CanActivate,
  Injectable,
  UnauthorizedException,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { archivePassword } from './config';
export function isArchiveAuthorized(header: unknown, password: string) {
  if (
    typeof header !== 'string' ||
    header.length > 4096 ||
    !header.startsWith('Basic ')
  )
    return false;
  const actual = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(actual), digest('stockflow:' + password));
}
@Injectable()
export class ArchiveGuard implements CanActivate {
  private readonly password = archivePassword();
  canActivate(context: ExecutionContext) {
    if (
      !isArchiveAuthorized(
        context.switchToHttp().getRequest().headers.authorization,
        this.password,
      )
    ) {
      context
        .switchToHttp()
        .getResponse()
        .setHeader(
          'WWW-Authenticate',
          'Basic realm="StockFlow private archive"',
        );
      throw new UnauthorizedException();
    }
    return true;
  }
}
export function setupPrivateSwagger(app: INestApplication) {
  const password = archivePassword();
  app.use(
    ['/api/docs', '/api/docs-json'],
    (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!isArchiveAuthorized(req.headers.authorization, password)) {
        res.statusCode = 401;
        res.setHeader(
          'WWW-Authenticate',
          'Basic realm="StockFlow private archive"',
        );
        res.end('Authentication required');
        return;
      }
      next();
    },
  );
  const config = new DocumentBuilder()
    .setTitle('StockFlow private archive')
    .setDescription(
      '본인 분석용 DB 조회. 일봉 종가 데이터이며 실시간 현재가가 아닙니다. KIS 인증정보를 입력하지 마세요.',
    )
    .setVersion('1.0')
    .addBasicAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.paths = Object.fromEntries(
    Object.entries(document.paths).filter(([path]) =>
      path.startsWith('/api/archive/'),
    ),
  );
  SwaggerModule.setup('api/docs', app, document, {
    raw: ['json'],
    swaggerOptions: { persistAuthorization: false, validatorUrl: null },
  });
}
