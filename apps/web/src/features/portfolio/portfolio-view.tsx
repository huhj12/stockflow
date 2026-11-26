'use client';

import type { Holding } from '@stockflow/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { fetchStocks } from '../stocks/api/fetch-stocks';
import { PortfolioForm } from './portfolio-form';
import { valuePortfolio } from './portfolio-model';
import { useLoadPortfolio, usePortfolio } from './portfolio-store';

const number = new Intl.NumberFormat('ko-KR');
const signed = new Intl.NumberFormat('ko-KR', { signDisplay: 'exceptZero' });
const percent = new Intl.NumberFormat('ko-KR', {
  signDisplay: 'exceptZero',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const money = (value: number | null, withSign = false) =>
  value === null ? '—' : (withSign ? signed : number).format(value) + '원';

export function PortfolioView() {
  useLoadPortfolio();
  const holdings = usePortfolio((state) => state.holdings);
  const ready = usePortfolio((state) => state.ready);
  const storageError = usePortfolio((state) => state.storageError);
  const upsert = usePortfolio((state) => state.upsert);
  const remove = usePortfolio((state) => state.remove);
  const retry = usePortfolio((state) => state.retry);
  const [formState, setFormState] = useState<{
    holding?: Holding;
    revision: number;
  }>({ revision: 0 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const catalog = useQuery({
    queryKey: ['stocks', '', ''],
    queryFn: ({ signal }) => fetchStocks('', '', signal),
    enabled: ready,
    staleTime: 60_000,
    retry: false,
  });
  const stocks = catalog.isError ? [] : (catalog.data?.items ?? []);
  const valuation = valuePortfolio(holdings, stocks);

  async function save(holding: Holding) {
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      const error = await upsert(holding);
      if (error) {
        setActionError(error);
        return false;
      }
      setFormState((current) => ({ revision: current.revision + 1 }));
      setNotice(
        usePortfolio.getState().storageError
          ? '현재 세션에 보유 정보를 반영했습니다.'
          : '보유 정보를 저장했습니다.',
      );
      return true;
    } finally {
      setBusy(false);
    }
  }
  async function deleteHolding(code: string) {
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      const error = await remove(code);
      if (error) {
        setActionError(error);
        return;
      }
      if (formState.holding?.stockCode === code)
        setFormState((current) => ({ revision: current.revision + 1 }));
      setNotice(
        usePortfolio.getState().storageError
          ? '현재 세션에서 보유 정보를 삭제했습니다.'
          : '보유 정보를 삭제했습니다.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function retryStorage() {
    setBusy(true);
    setActionError('');
    try {
      const error = await retry();
      if (error) setActionError(error);
      else
        setNotice(
          usePortfolio.getState().storageError
            ? '현재 세션 정보만 유지하고 있습니다.'
            : '브라우저 저장을 확인했습니다.',
        );
    } finally {
      setBusy(false);
    }
  }
  if (!ready) return <p role="status">보유 정보를 불러오는 중입니다.</p>;

  return (
    <>
      {storageError && (
        <div className="portfolio-notice" role="alert">
          <p>
            브라우저 저장 데이터를 읽거나 저장하지 못했습니다. 현재 세션의 보유
            정보는 유지하지만 새로고침하면 미저장 변경이 사라질 수 있습니다.
          </p>
          <button
            className="watchlist-button"
            type="button"
            disabled={busy}
            onClick={() => void retryStorage()}
          >
            브라우저 저장 다시 시도
          </button>
        </div>
      )}
      {catalog.isPending && (
        <p role="status">종목과 Mock 가격을 불러오는 중입니다.</p>
      )}
      {catalog.isError && (
        <div className="stock-dashboard">
          <p role="alert">
            종목 정보를 불러오지 못했습니다. 저장된 보유 정보는 유지되며 평가
            가격은 표시하지 않습니다.
          </p>
          <button type="button" onClick={() => void catalog.refetch()}>
            가격 다시 시도
          </button>
        </div>
      )}
      <section
        className="stock-dashboard"
        aria-labelledby="portfolio-form-heading"
      >
        <h2 id="portfolio-form-heading">보유 정보 입력</h2>
        <PortfolioForm
          key={formState.revision}
          stocks={stocks}
          holdings={holdings}
          initial={formState.holding}
          focusOnMount={formState.revision > 0}
          busy={busy}
          onSave={save}
          onCancel={() =>
            setFormState((current) => ({ revision: current.revision + 1 }))
          }
        />
        {notice && <p role="status">{notice}</p>}
        {actionError && (
          <p className="portfolio-error" role="alert">
            {actionError}
          </p>
        )}
      </section>
      <section
        className="stock-dashboard"
        aria-labelledby="portfolio-summary-heading"
      >
        <h2 id="portfolio-summary-heading">Mock 평가 요약</h2>
        <dl className="stock-metrics">
          <div>
            <dt>총 매입금액</dt>
            <dd>{money(valuation.cost)}</dd>
          </div>
          <div>
            <dt>총 평가금액</dt>
            <dd>{money(valuation.value)}</dd>
          </div>
          <div>
            <dt>총 평가손익</dt>
            <dd>{money(valuation.profit, true)}</dd>
          </div>
          <div>
            <dt>총 수익률</dt>
            <dd>
              {valuation.returnRate === null
                ? '—'
                : percent.format(valuation.returnRate) + '%'}
            </dd>
          </div>
        </dl>
        <p>고정 Mock 가격 기준이며 수수료·세금·배당은 반영하지 않습니다.</p>
        {holdings.length > 0 && catalog.isSuccess && !valuation.complete && (
          <p role="alert">
            가격을 확인할 수 없거나 계산 범위를 초과한 종목이 있어 합계
            평가금액과 손익을 표시하지 않습니다.
          </p>
        )}
      </section>
      <section
        className="stock-dashboard"
        aria-labelledby="portfolio-holdings-heading"
      >
        <h2 id="portfolio-holdings-heading">보유 종목</h2>
        {!holdings.length ? (
          <p role="status">등록된 보유 종목이 없습니다.</p>
        ) : (
          <div
            className="stock-table-scroll"
            role="region"
            aria-label="포트폴리오 보유 목록"
            tabIndex={0}
          >
            <table className="portfolio-table">
              <caption className="sr-only">
                가상 보유 종목과 고정 Mock 가격 평가
              </caption>
              <thead>
                <tr>
                  <th scope="col">종목</th>
                  <th scope="col">수량</th>
                  <th scope="col">평균 매수가</th>
                  <th scope="col">매입금액</th>
                  <th scope="col">Mock 가격</th>
                  <th scope="col">평가금액</th>
                  <th scope="col">평가손익·수익률</th>
                  <th scope="col">관리</th>
                </tr>
              </thead>
              <tbody>
                {valuation.lines.map((line) => {
                  const name = line.stock?.name ?? line.holding.stockCode;
                  const price = line.stock?.price;
                  return (
                    <tr key={line.holding.stockCode}>
                      <th scope="row">
                        <Link
                          className="stock-link"
                          href={'/stocks/' + line.holding.stockCode}
                        >
                          {name}
                        </Link>
                        <p className="stock-code">{line.holding.stockCode}</p>
                      </th>
                      <td>{number.format(line.holding.quantity)}주</td>
                      <td>{money(line.holding.averagePrice)}</td>
                      <td>{money(line.cost)}</td>
                      <td>
                        {typeof price === 'number' &&
                        Number.isSafeInteger(price) &&
                        price > 0
                          ? money(price)
                          : '—'}
                      </td>
                      <td>{money(line.value)}</td>
                      <td>
                        {money(line.profit, true)}
                        <p>
                          {line.returnRate === null
                            ? '—'
                            : percent.format(line.returnRate) + '%'}
                        </p>
                      </td>
                      <td>
                        <div className="portfolio-actions">
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={name + ' 보유 정보 수정'}
                            onClick={() => {
                              setFormState((current) => ({
                                holding: { ...line.holding },
                                revision: current.revision + 1,
                              }));
                              setActionError('');
                              setNotice('');
                            }}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={name + ' 보유 삭제'}
                            onClick={() =>
                              void deleteHolding(line.holding.stockCode)
                            }
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
