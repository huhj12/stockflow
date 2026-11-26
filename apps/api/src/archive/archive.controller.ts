import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ArchiveRepository } from './archive.repository';
import { ArchiveGuard } from './archive-auth';
import { closedDate, dateWindows, shiftDate, validDate } from './config';
function source(value: unknown): 'kis' | 'fixture' {
  if (value === undefined) return 'kis';
  if (value === 'kis' || value === 'fixture') return value;
  throw new BadRequestException('source must be kis or fixture');
}
function code(value: string) {
  if (!/^[0-9]{6}$/.test(value))
    throw new BadRequestException('code must contain six digits');
  return value;
}
const candleSchema = {
  type: 'object' as const,
  properties: {
    date: { type: 'string', format: 'date' },
    open: { type: 'integer' },
    high: { type: 'integer' },
    low: { type: 'integer' },
    close: { type: 'integer' },
    volume: { type: 'integer' },
    collectedAt: { type: 'string', format: 'date-time' },
  },
};
@ApiTags('Private database archive')
@ApiBasicAuth()
@ApiResponse({
  status: 401,
  description: 'Private archive authentication required',
})
@ApiResponse({
  status: 400,
  description: 'Invalid code, query, source or date range',
})
@UseGuards(ArchiveGuard)
@Controller('archive')
export class ArchiveController {
  constructor(
    @Inject(ArchiveRepository) private readonly repo: ArchiveRepository,
  ) {}
  @Get('stocks')
  @ApiOperation({ summary: 'DB 종목 검색 (초기 curated 30종목 카탈로그)' })
  @ApiQuery({ name: 'query', required: false, type: String, maxLength: 100 })
  @ApiQuery({ name: 'market', required: false, enum: ['KOSPI', 'KOSDAQ'] })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string', example: '005930' },
              name: { type: 'string' },
              market: { type: 'string', enum: ['KOSPI', 'KOSDAQ'] },
              sector: { type: 'string' },
              metadataSource: { type: 'string' },
            },
          },
        },
        total: { type: 'integer' },
      },
    },
  })
  stocks(@Query('query') query: unknown, @Query('market') market: unknown) {
    if (
      query !== undefined &&
      (typeof query !== 'string' || query.length > 100)
    )
      throw new BadRequestException('query must be at most 100 characters');
    if (market !== undefined && market !== 'KOSPI' && market !== 'KOSDAQ')
      throw new BadRequestException('Invalid market');
    return this.repo.stocks(
      typeof query === 'string' ? query.trim() : '',
      market,
    );
  }
  @Get('stocks/:code/candles')
  @ApiOperation({
    summary: 'DB 일봉 조회 (KRX·원주가·날짜 오름차순)',
    description:
      'source=kis와 source=fixture는 섞지 않습니다. 최대 366일 구간입니다.',
  })
  @ApiParam({
    name: 'code',
    example: '005930',
    schema: { type: 'string', pattern: '^[0-9]{6}$' },
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2026-11-01',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2026-11-24',
  })
  @ApiQuery({ name: 'source', required: false, enum: ['kis', 'fixture'] })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        source: { type: 'string' },
        exchange: { type: 'string', example: 'KRX' },
        adjusted: { type: 'boolean' },
        items: { type: 'array', items: candleSchema },
        total: { type: 'integer' },
      },
    },
  })
  async candles(
    @Param('code') input: string,
    @Query('from') from: unknown,
    @Query('to') to: unknown,
    @Query('source') inputSource: unknown,
  ) {
    const stockCode = code(input);
    const end = to === undefined ? closedDate() : to;
    if (!validDate(end)) throw new BadRequestException('Invalid to date');
    const start = from === undefined ? shiftDate(end, -89) : from;
    if (!validDate(start)) throw new BadRequestException('Invalid from date');
    try {
      dateWindows(start, end);
    } catch {
      throw new BadRequestException('Invalid date range (maximum 366 days)');
    }
    const provider = source(inputSource);
    const items = await this.repo.candles(stockCode, start, end, provider);
    return {
      code: stockCode,
      source: provider,
      exchange: 'KRX',
      adjusted: false,
      items,
      total: items.length,
    };
  }
  @Get('stocks/:code/quote')
  @ApiOperation({ summary: '최신 저장 일봉 종가 조회 (실시간 현재가 아님)' })
  @ApiParam({
    name: 'code',
    example: '005930',
    schema: { type: 'string', pattern: '^[0-9]{6}$' },
  })
  @ApiQuery({ name: 'source', required: false, enum: ['kis', 'fixture'] })
  @ApiResponse({ status: 404, description: 'No stored daily close' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        source: { type: 'string' },
        exchange: { type: 'string' },
        kind: { type: 'string', example: 'daily-close' },
        date: { type: 'string', format: 'date' },
        close: { type: 'integer' },
        volume: { type: 'integer' },
        collectedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async quote(
    @Param('code') input: string,
    @Query('source') inputSource: unknown,
  ) {
    const stockCode = code(input);
    const provider = source(inputSource);
    const row = await this.repo.latest(stockCode, provider);
    if (!row) throw new NotFoundException('No stored daily close');
    return {
      code: stockCode,
      source: provider,
      exchange: 'KRX',
      kind: 'daily-close',
      ...row,
    };
  }
  @Get('collection-runs')
  @ApiOperation({ summary: '최근 수집 실행 50건 확인 (개인 관리자)' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          source: { type: 'string' },
          status: { type: 'string' },
          date_from: { type: 'string', format: 'date' },
          date_to: { type: 'string', format: 'date' },
          attempted: { type: 'integer' },
          succeeded: { type: 'integer' },
          rows_written: { type: 'integer' },
          failure_codes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  })
  runs() {
    return this.repo.runs();
  }
}
