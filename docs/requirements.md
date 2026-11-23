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
- 목록 응답은 종목코드 오름차순의 `{ items: StockListItem[], total: number }`이다. 결과가 없으면 `{ items: [], total: 0 }`이다.
- GET /api/stocks/:code: 정확히 6개의 ASCII 숫자로 구성된 문자열 코드를 받아 Stock을 반환한다. 형식 오류는 400, 미등록 코드는 404다.

모의 데이터는 테스트용으로 선정한 국내 주식 30종목의 코드, 이름, 시장과 단순화한 업종을 담는다. 거래소 전체 종목 목록이나 최신 상장 현황을 보장하지 않으며 목록에 포함된 가격·등락률·거래량은 Mock 고정 스냅샷이다.

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

## 관심종목 저장

DAY 6는 브라우저의 localStorage에 종목코드 배열과 갱신 시각을 저장한다. 검색·상세·관심종목 화면은 하나의 Zustand 스토어를 사용한다. 저장 실패 시 현재 화면 세션에서 목록을 유지하고 알림을 표시한다. 계정 간 동기화는 후속 범위다.

## DAY 8 통합 품질 기준

- 375px 화면에서 검색 → 키보드 상세 진입 → Mock WebSocket 연결·차트 → 관심종목 등록 → 새로고침 후 유지 → 상세에서 삭제 → 검색 복귀가 가능해야 한다.
- 먼저 시작한 검색의 응답이 늦게 도착해도 최신 검색 결과를 덮어쓰지 않는다.
- 관심종목 목록 API 실패 시 저장한 코드를 유지하며 재시도로 종목명을 복구한다.
- 상세 화면을 나가면 진행 중인 WebSocket뿐 아니라 대기 중인 재연결도 취소한다.
- DAY 8은 기존 API 계약을 유지하고 신규 패키지나 실제 시세 연동을 추가하지 않는다.

## DAY 11 성능 측정 기준

- 기존 30종목 Mock API 계약은 유지한다. 대량 목록은 측정 브라우저의 응답 주입으로만 생성한다.
- React Profiler는 NEXT_PUBLIC_ENABLE_PROFILING=1인 별도 production --profile 빌드에서만 활성화한다. 일반 빌드는 Profiler 경계를 마운트하지 않는다.
- 이벤트→결과 프레임, API 왕복+JSON 파싱, React actualDuration 합산, DOM 수, 긴 작업을 구분한다. 샘플·환경·원본 데이터와 통계의 한계를 함께 기록한다.
- 계측 기준과 결과는 docs/performance/day11-baseline.md를 따른다. 이번 DAY에는 최적화를 추가하지 않으며 후속 가상 스크롤 도입 여부와 비교 기준으로 사용한다.
