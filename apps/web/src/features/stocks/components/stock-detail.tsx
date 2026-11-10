'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { fetchStockDetail } from '../api/fetch-stock-detail';
import { StockApiError } from '../api/stock-api';
import { StockPriceChart } from './stock-price-chart';

const number = new Intl.NumberFormat('ko-KR');
const signed = new Intl.NumberFormat('ko-KR', { signDisplay: 'exceptZero' });
const rate = new Intl.NumberFormat('ko-KR', {
  signDisplay: 'exceptZero',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function StockDetail({ code }: { code: string }) {
  const valid = code.length === 6 && /^[0-9]{6}$/.test(code);
  const detail = useQuery({
    queryKey: ['stock-detail', code],
    queryFn: ({ signal }) => fetchStockDetail(code, signal),
    enabled: valid,
    retry: false,
    staleTime: 60_000,
  });

  return (
    <main className="stock-detail">
      <Link href="/" className="stock-link">
        종목 목록으로 돌아가기
      </Link>
      {!valid ? (
        <h1>잘못된 종목코드입니다.</h1>
      ) : detail.isPending || (detail.isError && detail.isFetching) ? (
        <p role="status">종목 상세를 불러오는 중입니다.</p>
      ) : detail.isError ? (
        detail.error instanceof StockApiError && detail.error.status === 404 ? (
          <h1>종목을 찾을 수 없습니다.</h1>
        ) : (
          <section className="stock-dashboard" aria-labelledby="detail-error">
            <h1 id="detail-error">종목 상세</h1>
            <p role="alert">종목 정보를 불러오지 못했습니다.</p>
            <button type="button" onClick={() => void detail.refetch()}>
              다시 시도
            </button>
          </section>
        )
      ) : (
        <>
          <header>
            <p className="eyebrow">국내 주식 · Mock 시세</p>
            <h1>{detail.data.stock.name}</h1>
            <p>
              {detail.data.stock.code} · {detail.data.stock.market} ·{' '}
              {detail.data.stock.sector}
            </p>
            <p>
              테스트용 모의 시세입니다. 실제 거래소 시세는 제공하지 않습니다.
            </p>
          </header>
          <section className="stock-dashboard" aria-labelledby="quote-title">
            <h2 id="quote-title">Mock 현재가</h2>
            <dl className="stock-metrics">
              <div>
                <dt>현재가</dt>
                <dd>{number.format(detail.data.quote.price)}원</dd>
              </div>
              <div>
                <dt>전일 대비</dt>
                <dd>
                  {signed.format(detail.data.quote.change)}원 (
                  {rate.format(detail.data.quote.changeRate)}%)
                </dd>
              </div>
              <div>
                <dt>거래량</dt>
                <dd>{number.format(detail.data.quote.volume)}주</dd>
              </div>
            </dl>
          </section>
          <section className="stock-dashboard" aria-labelledby="chart-heading">
            <h2 id="chart-heading">가격 차트</h2>
            <StockPriceChart candles={detail.data.candles} />
          </section>
        </>
      )}
    </main>
  );
}
