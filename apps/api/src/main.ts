import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { setupPrivateSwagger } from './archive/archive-auth';
import { AppModule } from './app.module';
import { QuoteStream } from './stocks/quote-stream';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  if (process.env.ENABLE_PRIVATE_ARCHIVE === '1') setupPrivateSwagger(app);
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  app.enableCors({ origin });
  app.get(QuoteStream).attach(app.getHttpServer(), origin);
  app.enableShutdownHooks();
  // Containers bind all interfaces; local development stays on loopback.
  await app.listen(
    Number(process.env.PORT ?? 4000),
    process.env.API_HOST ?? '127.0.0.1',
  );
}
void bootstrap();
