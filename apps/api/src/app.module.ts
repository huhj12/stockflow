import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { StocksModule } from './stocks/stocks.module';

@Module({ imports: [HealthModule, StocksModule] })
export class AppModule {}
