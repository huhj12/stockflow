'use client';

import { useWatchlist } from './watchlist-store';

export function WatchlistButton({
  code,
  name,
}: {
  code: string;
  name: string;
}) {
  const ready = useWatchlist((state) => state.ready);
  const saved = useWatchlist((state) => state.stockCodes.includes(code));
  const toggle = useWatchlist((state) => state.toggle);

  return (
    <button
      className="watchlist-button"
      type="button"
      aria-label={name + ' 관심종목'}
      aria-pressed={saved}
      disabled={!ready}
      onClick={() => void toggle(code)}
    >
      {saved ? '관심 해제' : '관심 등록'}
    </button>
  );
}

export function WatchlistStorageNotice() {
  const error = useWatchlist((state) => state.storageError);
  return error ? (
    <p role="alert">
      브라우저 저장소를 사용할 수 없거나 저장 데이터를 읽지 못했습니다. 변경
      사항이 새로고침 후 사라질 수 있습니다.
    </p>
  ) : null;
}
