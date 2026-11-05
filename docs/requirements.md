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

## API 계약 초안

- GET /api/stocks: 검색 및 목록
- GET /api/stocks/:code: 기본 정보
- GET /api/stocks/:code/quote: 현재 시세
- GET /api/stocks/:code/candles: 가격 차트
- WS /ws/quotes: 모의 시세 구독
  DAY 2 구현 API는 GET /api/health뿐이다. 쿼리·페이지네이션·캔들 간격·오류 응답은 기능 개발 시 확정한다.

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
