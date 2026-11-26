import Link from 'next/link';
import { PortfolioView } from '../../features/portfolio/portfolio-view';

export default function PortfolioPage() {
  return (
    <main>
      <Link className="stock-link" href="/">
        종목 검색으로 돌아가기
      </Link>
      <h1>가상 포트폴리오</h1>
      <p>
        가상 보유 정보를 이 브라우저에 저장합니다. 실제 계좌·주문과 연결되지
        않으며 실제 주식 시세를 제공하지 않습니다.
      </p>
      <PortfolioView />
    </main>
  );
}
