# StockFlow 요구사항

## 목적

국내 주식 서비스 경험을 바탕으로 프론트엔드 전문성과 풀스택 설계 역량을 보여주는 포트폴리오.

## MVP

1. 시장 대시보드
2. KOSPI/KOSDAQ 종목 검색
3. WebSocket 실시간 모의 시세
4. 종목 상세 및 가격 차트
5. 관심종목 등록·삭제·브라우저 영속화
6. 가격·등락률·거래량 정렬
   후속: 포트폴리오, 가상 스크롤, 로그인, PostgreSQL, 실제 데이터 연동.

## 화면

- /: 시장 대시보드
- /stocks/[code]: 종목 상세
- /watchlist: 관심종목
- /portfolio: 후속 개발

## 구현된 API

- GET /api/health: 서비스 상태 확인.
- GET /api/stocks: 종목 목록과 검색. 선택 파라미터 query는 단일 문자열이며 최대 100 UTF-16 코드 단위까지 허용한다. 앞뒤 공백을 제거한 뒤 종목명(영문 대소문자 무시) 또는 코드의 일부와 비교한다. 공백뿐인 검색어는 전체를 대상으로 한다.
- market은 선택 파라미터이며 KOSPI 또는 KOSDAQ만 허용한다. 검색어와 시장은 동시에 적용한다. 중복 query/market, 100자 초과 query, 유효하지 않은 market은 400을 반환한다.
- 목록 응답은 종목코드 오름차순의 `{ items: Stock[], total: number }`이다. 결과가 없으면 `{ items: [], total: 0 }`이다.
- GET /api/stocks/:code: 정확히 6개의 ASCII 숫자로 구성된 문자열 코드를 받아 Stock을 반환한다. 형식 오류는 400, 미등록 코드는 404다.

모의 데이터는 테스트용으로 선정한 국내 주식 30종목의 코드, 이름, 시장과 단순화한 업종을 담는다. 거래소 전체 종목 목록이나 최신 상장 현황을 보장하지 않으며 현재가·실시간 시세를 포함하지 않는다.

## 후속 API

- GET /api/stocks/:code/quote: 시세
- GET /api/stocks/:code/candles: 가격 차트
- WS /ws/quotes: 모의 시세 구독

## 모델

- Stock: code(string), name, market(KOSPI|KOSDAQ), sector
- StockQuote: code, price, previousClose, change, changeRate, volume, timestamp, sequence
- Watchlist: stockCodes(string[]), updatedAt
- Holding: stockCode, quantity, averagePrice
  종목 코드는 앞자리 0을 보존한다. 가격은 원, 거래량은 주, changeRate는 퍼센트(1 = 1%)다. timestamp와 updatedAt은 Unix epoch 밀리초다.

## 실시간 처리 원칙

종목별 sequence로 오래된 메시지와 중복을 제거한다. 재연결 시 스트림 세션 변경을 식별하고 스냅샷을 받은 후 sequence 기준을 재설정한다. 지수 백오프와 지터로 재연결하고, 언마운트·종목 변경 시 구독과 타이머를 정리한다. 구독 프로토콜은 WebSocket 구현 DAY에 확정한다.

## DAY 2 완료 기준

모노레포, 시작 화면, 상태 확인 API, 공유 타입, 품질 도구, 문서, 로컬 실행 및 빌드 검증. 실제 시세 기능은 포함하지 않는다.
