'use client';

import type { Holding, StockListItem } from '@stockflow/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { MAX_AVERAGE_PRICE, MAX_QUANTITY } from './portfolio-model';

type Draft = { stockCode: string; quantity: string; averagePrice: string };
type Errors = Partial<Record<keyof Draft, string>>;
export function PortfolioForm({
  stocks,
  holdings,
  initial,
  focusOnMount,
  busy,
  onSave,
  onCancel,
}: {
  stocks: StockListItem[];
  holdings: Holding[];
  initial?: Holding;
  focusOnMount: boolean;
  busy: boolean;
  onSave: (holding: Holding) => Promise<boolean>;
  onCancel: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<Draft>(() => ({
    stockCode: initial?.stockCode ?? '',
    quantity: initial ? String(initial.quantity) : '',
    averagePrice: initial ? String(initial.averagePrice) : '',
  }));
  const [errors, setErrors] = useState<Errors>({});
  const stockRef = useRef<HTMLSelectElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  // Move focus only after an explicit edit/save/cancel remount, never on the first page load.
  useEffect(() => {
    if (focusOnMount)
      (initial ? quantityRef.current : stockRef.current)?.focus();
  }, [focusOnMount, initial]);
  const unknown = holdings.filter(
    (holding) => !stocks.some((stock) => stock.code === holding.stockCode),
  );

  function change(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(draft.quantity);
    const averagePrice = Number(draft.averagePrice);
    const next: Errors = {};
    if (
      !stocks.some((stock) => stock.code === draft.stockCode) &&
      !holdings.some((holding) => holding.stockCode === draft.stockCode)
    )
      next.stockCode = '목록에서 종목을 선택해 주세요.';
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY
    )
      next.quantity = '수량은 1~1,000,000주의 정수로 입력해 주세요.';
    if (
      !Number.isSafeInteger(averagePrice) ||
      averagePrice < 1 ||
      averagePrice > MAX_AVERAGE_PRICE
    )
      next.averagePrice =
        '평균 매수가는 1~100,000,000원의 정수로 입력해 주세요.';
    setErrors(next);
    if (Object.keys(next).length) {
      (next.stockCode
        ? stockRef.current
        : next.quantity
          ? quantityRef.current
          : priceRef.current
      )?.focus();
      return;
    }
    await onSave({ stockCode: draft.stockCode, quantity, averagePrice });
  }

  return (
    <form
      className="portfolio-form"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <fieldset disabled={busy}>
        <legend className="sr-only">
          {initial ? '보유 정보 수정' : '보유 정보 등록'}
        </legend>
        <label htmlFor={id + '-stock'}>
          보유 종목
          <select
            id={id + '-stock'}
            ref={stockRef}
            value={draft.stockCode}
            required
            disabled={busy || Boolean(initial)}
            aria-invalid={Boolean(errors.stockCode)}
            aria-describedby={errors.stockCode ? id + '-errors' : undefined}
            onChange={(event) => change('stockCode', event.currentTarget.value)}
          >
            <option value="">종목을 선택하세요</option>
            {stocks.map((stock) => (
              <option key={stock.code} value={stock.code}>
                {stock.name} ({stock.code})
              </option>
            ))}
            {unknown.map((holding) => (
              <option key={holding.stockCode} value={holding.stockCode}>
                {holding.stockCode} (종목 정보 없음)
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={id + '-quantity'}>
          보유 수량 (주)
          <input
            id={id + '-quantity'}
            ref={quantityRef}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_QUANTITY}
            step={1}
            required
            value={draft.quantity}
            aria-invalid={Boolean(errors.quantity)}
            aria-describedby={errors.quantity ? id + '-errors' : id + '-help'}
            onChange={(event) => change('quantity', event.currentTarget.value)}
          />
        </label>
        <label htmlFor={id + '-price'}>
          평균 매수가 (원)
          <input
            id={id + '-price'}
            ref={priceRef}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_AVERAGE_PRICE}
            step={1}
            required
            value={draft.averagePrice}
            aria-invalid={Boolean(errors.averagePrice)}
            aria-describedby={
              errors.averagePrice ? id + '-errors' : id + '-help'
            }
            onChange={(event) =>
              change('averagePrice', event.currentTarget.value)
            }
          />
        </label>
      </fieldset>
      <p id={id + '-help'}>
        수량은 최대 1,000,000주, 평균 매수가는 최대 100,000,000원입니다. 같은
        종목을 저장하면 기존 보유 정보를 바꿉니다.
      </p>
      {Object.values(errors).some(Boolean) && (
        <p id={id + '-errors'} role="alert">
          {Object.values(errors).filter(Boolean).join(' ')}
        </p>
      )}
      <div className="portfolio-actions">
        <button type="submit" disabled={busy}>
          {busy ? '반영 중…' : '보유 정보 저장'}
        </button>
        {initial && (
          <button type="button" disabled={busy} onClick={onCancel}>
            수정 취소
          </button>
        )}
      </div>
    </form>
  );
}
