import type { Market } from '@stockflow/shared';
const markets: Market[] = ['KOSPI', 'KOSDAQ'];
export default function Home() {
  return (
    <main>
      <p className="eyebrow">국내 주식 모니터링</p>
      <h1>StockFlow</h1>
      <p>시장의 흐름을 한눈에.</p>
      <section aria-label="개발 현황">
        <h2>개발 환경 준비 완료</h2>
        <p>시장 대시보드, 종목 검색, 실시간 모의 시세를 순서대로 개발합니다.</p>
        <ul>
          {markets.map((market) => (
            <li key={market}>{market}</li>
          ))}
        </ul>
        <small>DAY 2 · 아직 시세를 제공하지 않습니다.</small>
      </section>
    </main>
  );
}
