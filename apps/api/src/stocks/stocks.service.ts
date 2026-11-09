import { Injectable, NotFoundException } from '@nestjs/common';
import type { Market } from '@stockflow/shared';
import { mockStocks } from './stocks.mock';

@Injectable()
export class StocksService {
  private readonly stocks = [...mockStocks].sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  list(query: string, market?: Market) {
    const keyword = query.toLowerCase();
    const items = this.stocks.filter(
      (stock) =>
        (!market || stock.market === market) &&
        (stock.code.includes(keyword) ||
          stock.name.toLowerCase().includes(keyword)),
    );

    return { items, total: items.length };
  }

  findByCode(code: string) {
    const stock = this.stocks.find((item) => item.code === code);
    if (!stock) throw new NotFoundException('Stock not found');
    return stock;
  }
}
