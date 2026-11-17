import { StockDashboard } from '../features/stocks/components/stock-dashboard';

export default function Home() {
  return (
    <main>
      <header>
        <p className="eyebrow">국내 주식 모니터링</p>
        <h1>StockFlow</h1>
        <p>
          테스트용 Mock 종목 30개의 모의 가격과 거래량을 비교할 수 있습니다.
          목록은 고정 스냅샷을 표시합니다.
        </p>
      </header>
      <StockDashboard />
    </main>
  );
}
