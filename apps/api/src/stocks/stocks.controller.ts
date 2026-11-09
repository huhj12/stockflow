import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
} from '@nestjs/common';
import { StocksService } from './stocks.service';

@Controller('stocks')
export class StocksController {
  constructor(@Inject(StocksService) private readonly stocks: StocksService) {}

  @Get()
  list(@Query('query') query: unknown, @Query('market') market: unknown) {
    if (
      query !== undefined &&
      (typeof query !== 'string' || query.length > 100)
    ) {
      throw new BadRequestException(
        'query must be a string of at most 100 characters',
      );
    }
    if (market !== undefined && market !== 'KOSPI' && market !== 'KOSDAQ') {
      throw new BadRequestException('market must be KOSPI or KOSDAQ');
    }

    return this.stocks.list(query?.trim() ?? '', market);
  }

  @Get(':code')
  detail(@Param('code') code: string) {
    if (code.length !== 6 || !/^[0-9]{6}$/.test(code)) {
      throw new BadRequestException('code must contain exactly six digits');
    }

    return this.stocks.findByCode(code);
  }
}
