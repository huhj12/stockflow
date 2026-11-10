import { StockDetail } from '../../../features/stocks/components/stock-detail';

export default async function StockPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <StockDetail code={code} />;
}
