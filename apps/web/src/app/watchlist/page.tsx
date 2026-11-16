import Link from 'next/link';
import { WatchlistView } from '../../features/watchlist/watchlist-view';

export default function WatchlistPage() {
  return (
    <main>
      <Link className="stock-link" href="/">
        종목 검색으로 돌아가기
      </Link>
      <h1>관심종목</h1>
      <p>관심종목은 이 브라우저에 저장됩니다.</p>
      <section className="stock-dashboard" aria-label="저장된 관심종목">
        <WatchlistView />
      </section>
    </main>
  );
}
