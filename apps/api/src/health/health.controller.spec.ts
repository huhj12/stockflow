import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../app.module';

describe('health HTTP endpoint', () => {
  let app: INestApplication;
  let baseUrl: string;
  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  it('serves the health contract through the /api prefix', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'stockflow-api',
    });
  });
  it('does not expose the endpoint without its API prefix', async () => {
    expect((await fetch(`${baseUrl}/health`)).status).toBe(404);
  });
});
