'use client';

import { useQuery } from '@tanstack/react-query';
import type { Market } from '@stockflow/shared';
import Link from 'next/link';
import { StockTable, type StockSort } from './stock-table';
import { useEffect, useState } from 'react';
import { WatchlistStorageNotice } from '../../watchlist/watchlist-button';
import { useLoadWatchlist } from '../../watchlist/watchlist-store';
import { fetchStocks } from '../api/fetch-stocks';

export function StockDashboard() {
  useLoadWatchlist();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState<Market | ''>('');
  const [sort, setSort] = useState<StockSort>();
  const [showAll, setShowAll] = useState(false);
  const keyword = input.trim();

  useEffect(() => {
    const timer = setTimeout(() => setQuery(keyword), 275);
    return () => clearTimeout(timer);
  }, [keyword]);

  const waitingForInput = keyword !== query;
  // Cached filters skip loading: remount table scroll state while parent preferences survive.
  const resultKey = JSON.stringify([query, market]);
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

  function sortBy(key: StockSort['key']) {
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
        <StockTable
          key={resultKey}
          rows={sortedRows}
          sort={sort}
          onSort={sortBy}
          showAll={showAll}
          onShowAllChange={setShowAll}
        />
      )}
    </section>
  );
}
