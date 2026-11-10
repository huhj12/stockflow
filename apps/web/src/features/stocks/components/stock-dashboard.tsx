'use client';

import { useQuery } from '@tanstack/react-query';
import type { Market } from '@stockflow/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchStocks } from '../api/fetch-stocks';

export function StockDashboard() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState<Market | ''>('');
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
  const loading =
    waitingForInput ||
    stocks.isPending ||
    (stocks.isError && stocks.isFetching);

  return (
    <section className="stock-dashboard" aria-labelledby="stock-heading">
      <h2 id="stock-heading">국내 주식 종목 검색</h2>
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
              </tr>
            </thead>
            <tbody>
              {stocks.data.items.map((stock) => (
                <tr key={stock.code}>
                  <td className="stock-code">{stock.code}</td>
                  <th scope="row">
                    <Link className="stock-link" href={'/stocks/' + stock.code}>
                      {stock.name}
                    </Link>
                  </th>
                  <td>{stock.market}</td>
                  <td>{stock.sector}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
