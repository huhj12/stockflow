'use client';

import type { StockListItem } from '@stockflow/shared';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import Link from 'next/link';
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { WatchlistButton } from '../../watchlist/watchlist-button';

const columns = [
  ['price', '가격'],
  ['changeRate', '등락률'],
  ['volume', '거래량'],
] as const;
export type StockSort = {
  key: (typeof columns)[number][0];
  direction: 'ascending' | 'descending';
};
const integers = new Intl.NumberFormat('ko-KR');
const percentage = new Intl.NumberFormat('ko-KR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});
const threshold = 100;
const estimateHeight = 72;

function Spacer({ height }: { height: number }) {
  return height > 0 ? (
    <tr aria-hidden="true" className="stock-spacer">
      <td colSpan={8} style={{ height }} />
    </tr>
  ) : null;
}

export function StockTable({
  rows,
  sort,
  onSort,
  showAll,
  onShowAllChange,
}: {
  rows: StockListItem[];
  sort?: StockSort;
  onSort: (key: StockSort['key']) => void;
  showAll: boolean;
  onShowAllChange: (showAll: boolean) => void;
}) {
  'use no memo'; // TanStack Virtual exposes mutable instance methods; do not compiler-memoize this boundary.
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLTableSectionElement>(null);
  const pendingFocus = useRef<{
    index: number;
    control: 'a' | 'button';
  } | null>(null);
  const [headerHeight, setHeaderHeight] = useState(estimateHeight);
  const [focusedCode, setFocusedCode] = useState<string | null>(null);
  const helpId = useId();
  const virtual = rows.length > threshold && !showAll;
  const focusedIndex =
    focusedCode === null
      ? -1
      : rows.findIndex((row) => row.code === focusedCode);
  const getItemKey = useCallback((index: number) => rows[index].code, [rows]);
  // Keep the focused row mounted even if a pointer scrolls it out of the viewport.
  const rangeExtractor = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      const indexes = defaultRangeExtractor(range);
      if (focusedIndex >= 0) indexes.push(focusedIndex);
      return [...new Set(indexes)].sort((a, b) => a - b);
    },
    [focusedIndex],
  );
  // eslint-disable-next-line react-hooks/incompatible-library -- Mutable virtualizer stays inside this explicitly unmemoized boundary.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: virtual ? rows.length : 0,
    enabled: virtual,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: () => estimateHeight,
    overscan: 6,
    initialRect: { width: 0, height: 560 },
    paddingStart: headerHeight,
    scrollPaddingStart: headerHeight,
    rangeExtractor,
    useFlushSync: false,
  });
  const items = virtualizer.getVirtualItems();

  useEffect(() => {
    const header = headerRef.current;
    if (!virtual || !header) return;
    const observer = new ResizeObserver(() =>
      setHeaderHeight(header.getBoundingClientRect().height),
    );
    observer.observe(header);
    return () => observer.disconnect();
  }, [virtual]);

  // Focus only after the requested row exists; no timers or detached DOM handles.
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const control = scrollRef.current?.querySelector<HTMLElement>(
      `tr[data-index="${target.index}"] ${target.control}`,
    );
    if (control) {
      pendingFocus.current = null;
      control.focus({ preventScroll: true });
      // The virtualizer handles vertical position; native scrolling also reveals the control horizontally.
      control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });

  function moveTo(index: number, control: 'a' | 'button') {
    pendingFocus.current = { index, control };
    setFocusedCode(rows[index].code);
    virtualizer.scrollToIndex(index, { align: 'auto' });
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!virtual || event.altKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLTableRowElement>('tr[data-index]');
    if (!row && target !== scrollRef.current) return;
    const current = row ? Number(row.dataset.index) : 0;
    let next: number;
    let control: 'a' | 'button' = target.closest('button') ? 'button' : 'a';
    switch (event.key) {
      case 'ArrowDown':
        next = row ? current + 1 : 0;
        break;
      case 'ArrowUp':
        next = row ? current - 1 : 0;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = rows.length - 1;
        break;
      case 'PageDown':
        next = Math.min(rows.length - 1, current + 6);
        break;
      case 'PageUp':
        next = Math.max(0, current - 6);
        break;
      case 'Tab':
        if (!row || (event.shiftKey ? control !== 'a' : control !== 'button'))
          return;
        next = current + (event.shiftKey ? -1 : 1);
        control = event.shiftKey ? 'button' : 'a';
        break;
      default:
        return;
    }
    // Let Tab leave naturally at both ends instead of trapping keyboard users.
    if (next < 0 || next >= rows.length) return;
    event.preventDefault();
    moveTo(next, control);
  }

  function resetScroll() {
    setFocusedCode(null);
    pendingFocus.current = null;
    scrollRef.current?.scrollTo({ top: 0 });
    if (virtual) virtualizer.scrollToOffset(0);
  }

  function renderRow(index: number) {
    const stock = rows[index];
    return (
      <tr
        key={stock.code}
        data-index={index}
        data-stock-code={stock.code}
        aria-rowindex={virtual ? index + 2 : undefined}
        ref={virtual ? virtualizer.measureElement : undefined}
        onFocusCapture={() => {
          if (virtual) setFocusedCode(stock.code);
        }}
      >
        <td className="stock-code">{stock.code}</td>
        <th scope="row">
          <Link className="stock-link" href={'/stocks/' + stock.code}>
            {stock.name}
          </Link>
        </th>
        <td>{stock.market}</td>
        <td>{stock.sector}</td>
        <td className="stock-code">{integers.format(stock.price)}원</td>
        <td className="stock-code">{percentage.format(stock.changeRate)}%</td>
        <td className="stock-code">{integers.format(stock.volume)}주</td>
        <td>
          <WatchlistButton code={stock.code} name={stock.name} />
        </td>
      </tr>
    );
  }

  return (
    <>
      {rows.length > threshold && (
        <div className="stock-list-controls">
          <button
            type="button"
            aria-pressed={showAll}
            onClick={() => {
              resetScroll();
              onShowAllChange(!showAll);
            }}
          >
            전체 목록 표시
          </button>
          <p id={helpId}>
            {virtual
              ? '목록 안에서 방향키, Home·End, PageUp·PageDown으로 이동할 수 있습니다. 전체 목록을 한 번에 읽으려면 전체 목록 표시를 켜세요.'
              : '전체 종목을 한 번에 표시하고 있습니다.'}
          </p>
        </div>
      )}
      <div
        ref={scrollRef}
        className={
          'stock-table-scroll' + (virtual ? ' stock-table-virtual' : '')
        }
        role="region"
        aria-label="종목 검색 결과"
        aria-describedby={rows.length > threshold ? helpId : undefined}
        data-virtualized-region={virtual}
        tabIndex={0}
        onKeyDown={handleKey}
      >
        <table
          data-stock-count={rows.length}
          data-virtualized={virtual}
          aria-rowcount={virtual ? rows.length + 1 : undefined}
        >
          <caption className="sr-only">국내 주식 모의 종목 목록</caption>
          {virtual && (
            <colgroup>
              {[96, 180, 96, 112, 128, 112, 144, 144].map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
          )}
          <thead ref={headerRef}>
            <tr aria-rowindex={virtual ? 1 : undefined}>
              <th scope="col">종목코드</th>
              <th scope="col">종목명</th>
              <th scope="col">시장</th>
              <th scope="col">업종</th>
              {columns.map(([key, label]) => (
                <th
                  key={key}
                  scope="col"
                  aria-sort={sort?.key === key ? sort.direction : undefined}
                >
                  <button
                    type="button"
                    className="stock-sort-button"
                    onClick={() => {
                      resetScroll();
                      onSort(key);
                    }}
                  >
                    {label}{' '}
                    <span aria-hidden="true">
                      {sort?.key !== key
                        ? '↕'
                        : sort.direction === 'ascending'
                          ? '↑'
                          : '↓'}
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col">관심종목</th>
            </tr>
          </thead>
          <tbody
            onBlurCapture={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                setFocusedCode(null);
            }}
          >
            {virtual
              ? items.map((item, index) => (
                  <Fragment key={rows[item.index].code}>
                    <Spacer
                      height={
                        item.start - (items[index - 1]?.end ?? headerHeight)
                      }
                    />
                    {renderRow(item.index)}
                  </Fragment>
                ))
              : rows.map((_, index) => renderRow(index))}
            {virtual && (
              <Spacer
                height={
                  virtualizer.getTotalSize() -
                  (items.at(-1)?.end ?? headerHeight)
                }
              />
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
