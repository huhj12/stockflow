import { Module } from '@nestjs/common';
import { ArchiveModule } from './archive/archive.module';
import { HealthModule } from './health/health.module';
import { StocksModule } from './stocks/stocks.module';

@Module({
  imports: [
    HealthModule,
    StocksModule,
    ...(process.env.ENABLE_PRIVATE_ARCHIVE === '1' ? [ArchiveModule] : []),
  ],
})
export class AppModule {}
