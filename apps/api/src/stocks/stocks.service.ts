import { Injectable, NotFoundException } from '@nestjs/common';
import type { Market } from '@stockflow/shared';
import { createMockPrices } from './stock-prices.mock';
import { mockStocks } from './stocks.mock';

@Injectable()
export class StocksService {
  private readonly stocks = [...mockStocks].sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  private readonly prices = new Map(
    this.stocks.map(({ code }) => [code, createMockPrices(code)]),
  );

  getPrices(code: string) {
    const prices = this.prices.get(code);
    if (!prices) throw new NotFoundException('Stock not found');
    return prices;
  }

  list(query: string, market?: Market) {
    const keyword = query.toLowerCase();
    const items = this.stocks.filter(
      (stock) =>
        (!market || stock.market === market) &&
        (stock.code.includes(keyword) ||
          stock.name.toLowerCase().includes(keyword)),
    );

    return {
      items: items.map((stock) => {
        const { price, changeRate, volume } = this.getPrices(stock.code).quote;
        return { ...stock, price, changeRate, volume };
      }),
      total: items.length,
    };
  }

  findByCode(code: string) {
    const stock = this.stocks.find((item) => item.code === code);
    if (!stock) throw new NotFoundException('Stock not found');
    return stock;
  }
}
