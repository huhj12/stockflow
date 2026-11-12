'use client';

import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { StockCandle } from '@stockflow/shared';
import { DOWN_COLOR, toChartCandles, UP_COLOR } from '../utils/chart-candles';

const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
type ChartData = ReturnType<typeof toChartCandles>;

type ChartSeries = {
  chart: IChartApi;
  price: ISeriesApi<'Candlestick'>;
  volume: ISeriesApi<'Histogram'>;
};

function CandleCanvas({ data }: { data: ChartData }) {
  const host = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  const [series, setSeries] = useState<ChartSeries>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false;
    let chart: IChartApi | undefined;

    async function mount() {
      const { createChart, CandlestickSeries, HistogramSeries, ColorType } =
        await import('lightweight-charts');
      if (disposed || !container) return;

      chart = createChart(container, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: '#111d30' },
          textColor: '#b2c0d6',
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: '#263650' },
          horzLines: { color: '#263650' },
        },
        localization: { locale: 'ko-KR', dateFormat: 'yyyy-MM-dd' },
        timeScale: { timeVisible: false, rightOffset: 2 },
      });
      const price = chart.addSeries(CandlestickSeries, {
        upColor: UP_COLOR,
        downColor: DOWN_COLOR,
        borderVisible: false,
        wickUpColor: UP_COLOR,
        wickDownColor: DOWN_COLOR,
        priceFormat: {
          type: 'custom',
          minMove: 1,
          formatter: (value: number) => `${won.format(value)}원`,
        },
      });
      const volume = chart.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: 'volume' },
          priceLineVisible: false,
          lastValueVisible: false,
        },
        1,
      );
      volume.getPane().setStretchFactor(0.32);
      setSeries({ chart, price, volume });
    }

    void mount().catch(() => {
      chart?.remove();
      chart = undefined;
      if (!disposed) setFailed(true);
    });
    return () => {
      disposed = true;
      chart?.remove();
    };
  }, []);

  // Replace historical snapshots independently of chart creation. Live bars
  // can use price.update() and volume.update() on these same series in DAY 5.
  useEffect(() => {
    if (!series) return;
    series.price.setData(data.prices);
    series.volume.setData(data.volumes);
    series.chart.timeScale().fitContent();
  }, [data, series]);

  return (
    <>
      {failed ? <p role="alert">가격 차트를 초기화하지 못했습니다.</p> : null}
      {!failed && !series ? (
        <p role="status">가격 차트를 불러오는 중입니다.</p>
      ) : null}
      <div
        ref={host}
        className="stock-chart-canvas"
        role="img"
        aria-label="일봉 캔들 및 거래량 차트"
        aria-describedby={descriptionId}
        aria-busy={!failed && !series}
        hidden={failed}
      />
      {data.latest ? (
        <p id={descriptionId}>
          {data.latest.time} 마지막 모의 종가 {won.format(data.latest.close)}원
          · 거래량 {won.format(data.latest.volume)}주
        </p>
      ) : null}
    </>
  );
}

export function StockChart({
  candles,
  code,
}: {
  candles: StockCandle[];
  code: string;
}) {
  const data = useMemo(() => {
    try {
      return toChartCandles(candles);
    } catch {
      return null;
    }
  }, [candles]);

  return (
    <figure className="stock-chart">
      {!data ? (
        <p role="alert">가격 데이터 형식이 올바르지 않습니다.</p>
      ) : data.prices.length === 0 ? (
        <p>표시할 가격 데이터가 없습니다.</p>
      ) : (
        <CandleCanvas key={code} data={data} />
      )}
      <figcaption>
        Mock 일봉 · 가격 원(KRW) · 거래량 주 · 상승 빨강 / 하락 파랑
        <br />
        TradingView Lightweight Charts™ · Copyright (с) 2025{' '}
        <a className="stock-link" href="https://www.tradingview.com/">
          TradingView, Inc.
        </a>
        {' · '}
        <a className="stock-link" href="/licenses/lightweight-charts.txt">
          Apache 2.0
        </a>
      </figcaption>
    </figure>
  );
}
