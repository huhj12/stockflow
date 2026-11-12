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
- /stocks/[code]: 종목 상세, Mock 현재가, 일봉 캔들·거래량 차트
- /watchlist: 관심종목
- /portfolio: 후속 개발

## 구현된 API

- GET /api/health: 서비스 상태 확인.
- GET /api/stocks: 종목 목록과 검색. 선택 파라미터 query는 단일 문자열이며 최대 100 UTF-16 코드 단위까지 허용한다. 앞뒤 공백을 제거한 뒤 종목명(영문 대소문자 무시) 또는 코드의 일부와 비교한다. 공백뿐인 검색어는 전체를 대상으로 한다.
- market은 선택 파라미터이며 KOSPI 또는 KOSDAQ만 허용한다. 검색어와 시장은 동시에 적용한다. 중복 query/market, 100자 초과 query, 유효하지 않은 market은 400을 반환한다.
- 목록 응답은 종목코드 오름차순의 `{ items: Stock[], total: number }`이다. 결과가 없으면 `{ items: [], total: 0 }`이다.
- GET /api/stocks/:code: 정확히 6개의 ASCII 숫자로 구성된 문자열 코드를 받아 Stock을 반환한다. 형식 오류는 400, 미등록 코드는 404다.

모의 데이터는 테스트용으로 선정한 국내 주식 30종목의 코드, 이름, 시장과 단순화한 업종을 담는다. 거래소 전체 종목 목록이나 최신 상장 현황을 보장하지 않으며 현재가·실시간 시세를 포함하지 않는다.

- GET /api/stocks/:code/quote: StockQuote 정적 스냅샷. price는 마지막 캔들의 종가, previousClose는 직전 캔들의 종가다. change는 두 가격의 차이, changeRate는 change / previousClose × 100이다. volume과 timestamp는 마지막 캔들과 같고 sequence는 0이다.
- GET /api/stocks/:code/candles: 시간 오름차순의 StockCandle 배열 30개. 일봉 기간은 고정이며 페이지네이션 파라미터는 없다.
- 시세·캔들도 6자리 ASCII 종목코드 검증을 적용한다. 형식 오류는 400, 미등록 코드는 404다.

Mock 일봉은 종목코드에 기반한 고정 합성 데이터다. UTC 자정 간격으로 주말을 포함한 달력 날짜 30개를 사용하며 거래소의 거래일이나 실제 시세와 무관하다. 같은 종목 요청은 동일한 결과를 반환한다.

## 모의 시세 WebSocket

- WS /ws/quotes?code=005930: 연결 하나당 종목 하나를 구독한다. 서버는 WEB_ORIGIN과 일치하는 브라우저 Origin을 허용한다.
- 메시지는 type(snapshot 또는 tick), sessionId, quote(StockQuote), candle(StockCandle)로 구성한다. 연결마다 sequence 0의 REST 기준 스냅샷을 보낸 후 1초 간격으로 sequence를 증가시킨다.
- 마지막 Mock 일봉 안에서 가격과 거래량을 갱신한다. tick의 quote.timestamp는 발행 시각이며 candle.timestamp는 모의 일봉 날짜다.
- 화면을 나가면 연결을 닫는다. 끊긴 연결은 지수 백오프와 지터로 재연결하며 새 세션 스냅샷으로 기준을 재설정한다.

## 모델

- Stock: code(string), name, market(KOSPI|KOSDAQ), sector
- StockQuote: code, price, previousClose, change, changeRate, volume, timestamp, sequence
- StockCandle: timestamp, open, high, low, close, volume
- Watchlist: stockCodes(string[]), updatedAt
- Holding: stockCode, quantity, averagePrice
  종목 코드는 앞자리 0을 보존한다. 가격은 원, 거래량은 주, changeRate는 퍼센트(1 = 1%)다. timestamp와 updatedAt은 Unix epoch 밀리초다.

## 실시간 처리 원칙

종목별 sequence로 오래된 메시지와 중복을 제거한다. 재연결 시 스트림 세션 변경을 식별하고 스냅샷을 받은 후 sequence 기준을 재설정한다. 지수 백오프와 지터로 재연결하고, 언마운트·종목 변경 시 구독과 타이머를 정리한다. DAY 5 프로토콜은 위 WebSocket 계약을 따른다.

## DAY 2 완료 기준

모노레포, 시작 화면, 상태 확인 API, 공유 타입, 품질 도구, 문서, 로컬 실행 및 빌드 검증. 실제 시세 기능은 포함하지 않는다.
