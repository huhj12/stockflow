import { Module } from '@nestjs/common';
import { QuoteStream } from './quote-stream';
import { StocksController } from './stocks.controller';
import { StocksService } from './stocks.service';

@Module({
  controllers: [StocksController],
  providers: [StocksService, QuoteStream],
})
export class StocksModule {}
