import { StockDashboard } from '../features/stocks/components/stock-dashboard';

export default function Home() {
  return (
    <main>
      <header>
        <p className="eyebrow">국내 주식 모니터링</p>
        <h1>StockFlow</h1>
        <p>
          테스트용 Mock 종목 30개를 검색할 수 있습니다. 현재가와 실시간 시세는
          제공하지 않습니다.
        </p>
      </header>
      <StockDashboard />
    </main>
  );
}
