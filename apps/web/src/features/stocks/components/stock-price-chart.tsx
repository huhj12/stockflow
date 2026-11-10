import type { StockCandle } from '@stockflow/shared';

const date = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  timeZone: 'Asia/Seoul',
});
const number = new Intl.NumberFormat('ko-KR');
const left = 76;
const right = 516;
const top = 24;
const bottom = 188;

export function StockPriceChart({ candles }: { candles: StockCandle[] }) {
  if (candles.length === 0) return <p>표시할 가격 데이터가 없습니다.</p>;

  const closes = candles.map(({ close }) => close);
  const minimum = Math.min(...closes);
  const maximum = Math.max(...closes);
  const lower = minimum === maximum ? minimum - 1 : minimum;
  const upper = minimum === maximum ? maximum + 1 : maximum;
  const first = candles[0];
  const last = candles[candles.length - 1];
  const span = last.timestamp - first.timestamp;
  const x = (timestamp: number) =>
    span === 0
      ? (left + right) / 2
      : left + ((timestamp - first.timestamp) / span) * (right - left);
  const y = (price: number) =>
    bottom - ((price - lower) / (upper - lower)) * (bottom - top);
  const points = candles
    .map(
      ({ timestamp, close }) =>
        `${x(timestamp).toFixed(1)},${y(close).toFixed(1)}`,
    )
    .join(' ');
  const labels = [
    ...new Set([0, Math.floor((candles.length - 1) / 2), candles.length - 1]),
  ];

  return (
    <figure className="stock-chart">
      <svg
        viewBox="0 0 540 224"
        role="img"
        aria-labelledby="price-chart-title"
        aria-describedby="price-chart-desc"
      >
        <title id="price-chart-title">일봉 종가 차트</title>
        <desc id="price-chart-desc">
          {date.format(first.timestamp)}부터 {date.format(last.timestamp)}까지의
          모의 종가입니다. 최저 {number.format(minimum)}원, 최고{' '}
          {number.format(maximum)}원, 마지막 종가 {number.format(last.close)}
          원입니다.
        </desc>
        <g aria-hidden="true">
          <text x="8" y="13">
            가격 (원)
          </text>
          {[upper, (upper + lower) / 2, lower].map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={right}
                y1={y(tick)}
                y2={y(tick)}
                className="chart-grid"
              />
              <text
                x={left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {number.format(Math.round(tick))}
              </text>
            </g>
          ))}
          <polyline points={points} className="chart-line" />
          <circle
            cx={x(last.timestamp)}
            cy={y(last.close)}
            r="3"
            className="chart-dot"
          />
          {labels.map((index) => (
            <text
              key={index}
              x={x(candles[index].timestamp)}
              y="212"
              textAnchor="middle"
            >
              {date.format(candles[index].timestamp)}
            </text>
          ))}
        </g>
      </svg>
      <figcaption>테스트용 일봉 종가 · 원 단위</figcaption>
    </figure>
  );
}
