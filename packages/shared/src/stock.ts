export type Market = 'KOSPI' | 'KOSDAQ';
// Stock codes remain strings to preserve leading zeroes.
export interface Stock {
  code: string;
  name: string;
  market: Market;
  sector: string;
}
