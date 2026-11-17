'use client';

import { useQuery } from '@tanstack/react-query';
import type { Market } from '@stockflow/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  WatchlistButton,
  WatchlistStorageNotice,
} from '../../watchlist/watchlist-button';
import { useLoadWatchlist } from '../../watchlist/watchlist-store';
import { fetchStocks } from '../api/fetch-stocks';

const columns = [
  ['price', '가격'],
  ['changeRate', '등락률'],
  ['volume', '거래량'],
] as const;

type SortKey = (typeof columns)[number][0];
type Sort = { key: SortKey; direction: 'ascending' | 'descending' };
const integers = new Intl.NumberFormat('ko-KR');
const percentage = new Intl.NumberFormat('ko-KR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

export function StockDashboard() {
  useLoadWatchlist();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState<Market | ''>('');
  const [sort, setSort] = useState<Sort>();
  const keyword = input.trim();

  useEffect(() => {
    const timer = setTimeout(() => setQuery(keyword), 275);
    return () => clearTimeout(timer);
  }, [keyword]);

  const waitingForInput = keyword !== query;
  const stocks = useQuery({
    queryKey: ['stocks', query, market],
    queryFn: ({ signal }) => fetchStocks(query, market, signal),
    enabled: !waitingForInput,
    staleTime: 60_000,
    retry: false,
  });
  const rows = stocks.data?.items ?? [];
  const sortedRows = sort
    ? rows.toSorted((a, b) => {
        const difference = a[sort.key] - b[sort.key];
        return (
          (sort.direction === 'ascending' ? difference : -difference) ||
          a.code.localeCompare(b.code)
        );
      })
    : rows;

  function sortBy(key: SortKey) {
    setSort((current) => ({
      key,
      direction:
        current?.key === key && current.direction === 'descending'
          ? 'ascending'
          : 'descending',
    }));
  }

  const loading =
    waitingForInput ||
    stocks.isPending ||
    (stocks.isError && stocks.isFetching);

  return (
    <section className="stock-dashboard" aria-labelledby="stock-heading">
      <h2 id="stock-heading">국내 주식 종목 검색</h2>
      <WatchlistStorageNotice />
      <div className="stock-filters" role="group" aria-label="종목 검색 조건">
        <label htmlFor="stock-query">
          종목명 또는 종목코드
          <input
            id="stock-query"
            type="search"
            value={input}
            maxLength={100}
            placeholder="예: 삼성전자, 005930"
            onChange={(event) => setInput(event.currentTarget.value)}
          />
        </label>
        <label htmlFor="stock-market">
          시장
          <select
            id="stock-market"
            value={market}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setMarket(value === 'KOSPI' || value === 'KOSDAQ' ? value : '');
            }}
          >
            <option value="">전체</option>
            <option value="KOSPI">KOSPI</option>
            <option value="KOSDAQ">KOSDAQ</option>
          </select>
        </label>
      </div>

      <p>
        <Link className="stock-link" href="/watchlist">
          관심종목 보기
        </Link>
      </p>
      <p role="status">
        {loading
          ? '종목을 불러오는 중입니다.'
          : stocks.data && !stocks.isError
            ? stocks.data.total === 0
              ? '검색 결과가 없습니다.'
              : `검색 결과 ${stocks.data.total}건`
            : ''}
      </p>
      {!loading && stocks.isError && (
        <div className="stock-error">
          <p role="alert">종목 목록을 불러오지 못했습니다.</p>
          <button type="button" onClick={() => void stocks.refetch()}>
            다시 시도
          </button>
        </div>
      )}
      {!loading && !stocks.isError && stocks.data && stocks.data.total > 0 && (
        <div
          className="stock-table-scroll"
          role="region"
          aria-label="종목 검색 결과"
          tabIndex={0}
        >
          <table>
            <caption className="sr-only">국내 주식 모의 종목 목록</caption>
            <thead>
              <tr>
                <th scope="col">종목코드</th>
                <th scope="col">종목명</th>
                <th scope="col">시장</th>
                <th scope="col">업종</th>
                {columns.map(([key, label]) => (
                  <th
                    key={key}
                    scope="col"
                    aria-sort={sort?.key === key ? sort.direction : undefined}
                  >
                    <button
                      type="button"
                      className="stock-sort-button"
                      onClick={() => sortBy(key)}
                    >
                      {label}{' '}
                      <span aria-hidden="true">
                        {sort?.key !== key
                          ? '↕'
                          : sort.direction === 'ascending'
                            ? '↑'
                            : '↓'}
                      </span>
                    </button>
                  </th>
                ))}
                <th scope="col">관심종목</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((stock) => (
                <tr key={stock.code}>
                  <td className="stock-code">{stock.code}</td>
                  <th scope="row">
                    <Link className="stock-link" href={'/stocks/' + stock.code}>
                      {stock.name}
                    </Link>
                  </th>
                  <td>{stock.market}</td>
                  <td>{stock.sector}</td>
                  <td className="stock-code">
                    {integers.format(stock.price)}원
                  </td>
                  <td className="stock-code">
                    {percentage.format(stock.changeRate)}%
                  </td>
                  <td className="stock-code">
                    {integers.format(stock.volume)}주
                  </td>
                  <td>
                    <WatchlistButton code={stock.code} name={stock.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
