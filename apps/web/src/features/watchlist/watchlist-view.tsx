'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { fetchStocks } from '../stocks/api/fetch-stocks';
import { WatchlistButton, WatchlistStorageNotice } from './watchlist-button';
import { useLoadWatchlist, useWatchlist } from './watchlist-store';

export function WatchlistView() {
  useLoadWatchlist();
  const ready = useWatchlist((state) => state.ready);
  const codes = useWatchlist((state) => state.stockCodes);
  const catalog = useQuery({
    queryKey: ['stocks', '', ''],
    queryFn: ({ signal }) => fetchStocks('', '', signal),
    enabled: ready && codes.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  if (!ready) return <p role="status">관심종목을 불러오는 중입니다.</p>;

  return (
    <>
      <WatchlistStorageNotice />
      {!codes.length ? (
        <p role="status">등록된 관심종목이 없습니다.</p>
      ) : (
        <>
          {catalog.isFetching ? (
            <p role="status">종목 정보를 불러오는 중입니다.</p>
          ) : null}
          {catalog.isError ? (
            <div>
              <p role="alert">종목 정보를 불러오지 못했습니다.</p>
              <button
                className="watchlist-button"
                type="button"
                onClick={() => void catalog.refetch()}
              >
                다시 시도
              </button>
            </div>
          ) : null}
          <ul className="watchlist-items">
            {codes.map((code) => {
              const stock = catalog.data?.items.find(
                (item) => item.code === code,
              );
              return (
                <li key={code}>
                  <div>
                    <Link className="stock-link" href={'/stocks/' + code}>
                      {stock?.name ?? code}
                    </Link>
                    {stock ? (
                      <p>
                        {code} · {stock.market} · {stock.sector}
                      </p>
                    ) : null}
                  </div>
                  <WatchlistButton code={code} name={stock?.name ?? code} />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
