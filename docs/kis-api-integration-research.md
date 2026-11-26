# 한국투자증권 KIS 국내주식 API 상세 조사

확인일: 2026-11-25. 공개 공식 문서·공식 저장소·공식 공지와 FAQ의 공개 본문을 확인했다. 사용자 키·시크릿을 읽거나 토큰 발급·인증 API 호출을 실행하지 않았다. 아래 요청은 구현 전 계약 설명이며 실행 검증 결과가 아니다. StockFlow 적용 항목은 개발 설계 제안이다.

## 1. StockFlow 적용 결론

KIS Developers의 REST와 WebSocket으로 현재가·일봉·종목 검색용 마스터·실시간 평가를 구현할 수 있다. 공식 예제가 Python이어도 HTTP/WS 계약을 NestJS에서 구현할 수 있으므로 Python 서버나 Windows 전용 eFriend Expert를 추가할 필요는 없다.

개인 개발 환경에서 시세 조회만 먼저 검증한다. 공개 Mock 데모는 유지한다. 실전 환경 선택은 실제 시세 서버 선택을 의미하며 주문 기능 구현과 별개다. KIS 모의투자와 현재 StockFlow의 자체 합성 Mock은 서로 다르다. 현재 보유한 키가 실전용인지 모의용인지는 값 자체가 아닌 발급 화면에서 확인한다.

[공식 저장소](https://github.com/koreainvestment/open-trading-api), [환경 설정 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/kis_devlp.yaml).

## 2. 공개 서비스 이용 범위: 확인된 제한

2026-10-06 등록된 공식 FAQ는 시세의 개인 자산운용 목적 이용과 로컬 저장·가공·분석을 설명하고, 제3자 제공 및 불특정 다수가 사용하는 웹·앱이나 콘텐츠 제공은 허용하지 않는다고 안내한다. 원칙적으로 시세정보 이용기관인 코스콤과의 계약이 필요하다고 명시한다. 개인 키 보유·비상업적 포트폴리오라는 이유만으로 공개 재배포가 허용된다고 판단하지 않는다.

공개 StockFlow에 실데이터를 표시하려면 증권사·시세정보 이용기관에 서비스 형태에 맞는 별도 계약·허용 범위를 확인해야 한다. 개인용 개발 환경은 본인 인증과 접근 통제를 전제로 분리하고 화면 캡처·녹화로 공개하는 시세도 정책 확인 대상이다. 키는 채팅·브라우저·Git에 넣지 않는다.

[공식 FAQ: Open API 데이터 이용 범위 및 사용 정책 안내](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000002/post/1f422ddb-7a9c-4279-9ecb-21eb750a4b7a). 동적 본문은 해당 페이지의 공개 게시물 조회 응답으로 확인했다. 제휴 이용기관용 약관을 개인 고객 약관으로 대체해 해석하지 않았다.

## 3. 서버와 인증

| 구분 | REST                                         | WebSocket                          |
| ---- | -------------------------------------------- | ---------------------------------- |
| 실전 | https://openapi.koreainvestment.com:9443     | ws://ops.koreainvestment.com:21000 |
| 모의 | https://openapivts.koreainvestment.com:29443 | ws://ops.koreainvestment.com:31000 |

실전·모의 키와 토큰 캐시를 분리한다. REST는 TLS 1.2/1.3을 지원한다고 안내한다. 공식 설정의 WS 주소를 임의의 wss 주소로 바꾸지 않는다. 브라우저는 StockFlow 서버에 연결하고 서버가 KIS 업스트림에 연결한다.

[공식 API 개요](https://apiportal.koreainvestment.com/apiservice), [환경 설정](https://github.com/koreainvestment/open-trading-api/blob/main/kis_devlp.yaml).

| 인증          | 메서드·경로           | 요청 body                                        | 결과                                                             |
| ------------- | --------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| REST 토큰     | POST /oauth2/tokenP   | grant_type=client_credentials, appkey, appsecret | access_token, token_type, expires_in, access_token_token_expired |
| 실시간 접속키 | POST /oauth2/Approval | grant_type=client_credentials, appkey, secretkey | approval_key                                                     |

Approval 경로의 대문자 A와 secretkey 필드를 REST의 appsecret과 혼동하지 않는다. 개인 시세 요청은 Authorization: Bearer 토큰, appkey, appsecret, tr_id와 custtype=P 헤더를 사용한다. 현재가·일봉 요청 자체에는 계좌번호나 계좌 비밀번호 파라미터가 없다. 계좌 잔고·주문 API와 구분한다.

공식 토큰 안내의 예시는 expires_in=86400이다. 재발급은 항상 새 토큰·새 만료시각이 나온다고 가정하지 않고 응답 만료값을 함께 저장한다. 서버 토큰 매니저가 유효 토큰 재사용, 갱신 요청 병합, 환경별 캐시를 담당하도록 제안한다. 여러 프로세스 운영 시 토큰·업스트림 연결 소유자를 조정해야 한다.

[공식 인증 구현](https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/kis_auth.py), [토큰 재호출 FAQ](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000002/post/f2b74a2b-c63e-496a-81fc-fece1b38a825).

## 4. 필요한 API와 요청 계약

### 현재가

GET /uapi/domestic-stock/v1/quotations/inquire-price, TR FHKST01010100.

쿼리는 FID_COND_MRKT_DIV_CODE=J와 FID_INPUT_ISCD=005930으로 시작한다. J는 KRX, NX는 NXT, UN은 통합 시세를 뜻한다. Stock의 market=KOSPI/KOSDAQ는 상장시장 구분이며 이 거래소 선택과 별개다. 초기 연동은 KRX로 통일한다.

[공식 현재가 함수](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_price/inquire_price.py).

### 일봉

GET /uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice, TR FHKST03010100.

| 파라미터                            | 초기 선택                                     |
| ----------------------------------- | --------------------------------------------- |
| FID_COND_MRKT_DIV_CODE              | J                                             |
| FID_INPUT_ISCD                      | 005930                                        |
| FID_INPUT_DATE_1 / FID_INPUT_DATE_2 | 시작일/종료일 YYYYMMDD                        |
| FID_PERIOD_DIV_CODE                 | D: 일봉; W/M/Y는 후속                         |
| FID_ORG_ADJ_PRC                     | 0: 수정주가, 1: 원주가; UI·계약에서 기준 명시 |

공식 함수는 한 호출 최대 100건을 안내하며 output1 요약과 output2 봉 목록을 반환한다. 100개 초과는 날짜 구간을 나누고 중복 제거 후 합친다. 달력 30일과 거래일 30봉을 동일시하지 않는다. 반환 순서를 가정하지 않고 날짜 오름차순·중복·OHLC·안전 정수·결측값을 검증한다. 처음에는 원주가로 REST/실시간 가격 기준을 맞추고 수정주가 선택은 별도 정책으로 다루는 것을 제안한다.

[공식 일봉 함수](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_itemchartprice/inquire_daily_itemchartprice.py).

### 다종목 초기 가격

GET /uapi/domestic-stock/v1/quotations/intstock-multprice는 최대 30종목을 조회한다. 공식 FAQ는 HTS 관심종목 그룹 API를 선행 호출하지 않고 종목코드를 직접 넣을 수 있다고 설명한다. 따라서 StockFlow 관심종목·가상 보유 목록을 한투 HTS 그룹과 동기화할 필요가 없다. 모의 환경 지원 여부와 필요한 필드 충족은 실제 읽기 전용 호출에서 검증한다.

[멀티 시세 함수](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/intstock_multprice/intstock_multprice.py), [그룹 선행 호출 불필요 FAQ](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000002/post/1f841520-e052-4dcc-ab8c-fd80633aafd8).

### 분봉: 후속 범위

당일 분봉 inquire-time-itemchartprice, TR FHKST03010200은 공식 함수 기준 최대 30건이며 이 함수 자체는 당일 데이터용이다. 과거 일자 분봉은 별도 API를 구분한다. 첫 실데이터 DAY에는 일봉만 도입해 범위를 제한한다.

[공식 당일 분봉 함수](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_time_itemchartprice/inquire_time_itemchartprice.py).

## 5. StockQuote·StockCandle 변환

| StockFlow           | KIS 후보 필드·처리                                             |
| ------------------- | -------------------------------------------------------------- |
| code                | 요청 종목코드 또는 stck_shrn_iscd; 문자열 유지                 |
| price               | stck_prpr                                                      |
| change              | prdy_vrss와 prdy_vrss_sign의 의미를 함께 검증                  |
| changeRate          | prdy_ctrt는 퍼센트 단위                                        |
| volume              | acml_vol 누적 거래량                                           |
| previousClose       | 기간별 시세 output1의 stck_prdy_clpr 등 실제 필드 확인         |
| timestamp           | REST 수신 시각과 거래소 체결 시각을 구분해 정책 확정           |
| sequence            | StockFlow 서버가 세션별 발행                                   |
| candle timestamp    | stck_bsop_date YYYYMMDD를 일봉 날짜용 UTC 자정 밀리초로 정규화 |
| open/high/low/close | stck_oprc / stck_hgpr / stck_lwpr / stck_clpr                  |
| candle volume       | acml_vol                                                       |

stck_sdpr는 기준가이므로 무조건 전일 종가로 이름을 바꾸지 않는다. 기업행사·권리락 때 전일 종가와 등락 계산 기준 차이가 생길 수 있는지 검증하고 기존 change=price-previousClose 계약을 조용히 위반하지 않는다. 기존 계약과 충돌하면 기준가 메타데이터·명칭을 명시적으로 설계한다.

빈 문자열을 Number('')로 0으로 바꾸거나 문자열 필드 전체에 임의 절댓값을 적용하지 않는다. 날짜 유효성·숫자 형식·안전 정수 범위를 검사한다. REST 응답의 HTTP 상태뿐 아니라 rt_cd/msg_cd/msg1와 필수 output을 확인한다. 원본 오류 전체·인증 헤더는 로그에 남기지 않는다.

[현재가 응답 필드](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_price/chk_inquire_price.py), [일봉 응답 필드](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_itemchartprice/chk_inquire_daily_itemchartprice.py). 위 정규화·오류 처리 정책은 StockFlow 설계 제안이다.

## 6. WebSocket: 현재 Mock과 다른 부분

KRX 체결 TR은 H0STCNT0, KRX 호가 TR은 H0STASP0이며 통합 체결은 H0UNCNT0이다. 초기에는 체결만 구독한다. 같은 종목의 체결과 호가를 등록하면 두 구독으로 예산을 계산한다.

구독 메시지는 header에 approval_key, custtype=P, tr_type=1, content-type=utf-8, body.input에 tr_id와 tr_key=005930을 넣는 형태다. 해제는 tr_type=2다. 승인 응답과 데이터 수신을 구분하며 등록 요청 송신만으로 연결됨을 표시하지 않는다.

시세는 0|TR_ID|건수|필드들 형태와 ^ 구분 필드를 사용하고 제어 응답은 JSON이다. 한 프레임에 체결 여러 건이 올 수 있으므로 헤더 건수만큼 레코드를 처리한다. 마지막 레코드 하나만 파싱해도 된다고 가정하지 않는다. 실시간 누적 거래량 ACML_VOL과 단건 체결량 CNTG_VOL을 혼동하지 않는다. 날짜 BSOP_DATE와 체결시간 STCK_CNTG_HOUR를 서울 시간으로 해석하고 수신 시각도 별도 기록한다.

[KRX 체결 함수](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/ccnl_krx/ccnl_krx.py), [호가 함수](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/asking_price_krx/asking_price_krx.py), [통합 체결 함수](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/ccnl_total/ccnl_total.py), [복수 체결 데이터 FAQ](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000002/post/b56cee10-77f9-4697-a0cc-08740d5293c6).

StockFlow 어댑터 제안:

1. 한투 연결을 서버에서 공유하고 (거래소, TR, 종목코드)별 참조 수로 등록·해제한다.
2. REST 초기 기준값을 확보하고 WS 수신 중 도착한 tick을 버퍼링해 초기 REST 응답이 최신 tick을 덮어쓰지 않게 한다.
3. 외부의 등록 승인·체결을 기존 snapshot/tick JSON으로 변환한다. 한투 데이터에 Mock의 sequence가 있다고 가정하지 않는다.
4. 재연결 후 새 서버 sessionId, sequence=0 스냅샷을 발행하고 이후 sequence를 증가시킨다. 서버 sequence는 도착 순서를 표시하며 거래소 원본의 완전한 순서·무손실을 보증하지 않는다.
5. REST 일봉이 과거 거래일로 끝나면 새 거래일 봉을 생성한다. 기존 Mock의 마지막 고정 일봉 timestamp만 갱신하는 조건을 실데이터에 그대로 쓰지 않는다.
6. 장 마감·거래정지·저유동성 무체결과 통신 장애를 구분한다. Mock의 8초 tick watchdog을 외부 시세의 생존 조건으로 재사용하지 않는다.

공식 Heartbeat FAQ는 PINGPONG과 datetime 응답을 설명하며 10초 단위 총 100초 동안 응답이 없으면 종료한다고 안내한다. Node WS 구현은 공식 샘플의 pong 처리와 실제 프로토콜을 대조해 검증한다. 브라우저에도 장 상태·기준 시각·가격 출처를 전달하는 계약 확장이 필요하다.

[Heartbeat FAQ](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000002/post/72e8ed5d-a36e-4fab-8e09-538a76e995c3).

## 7. 유량과 비용

직접 확인한 공식 공지 제목은 API 호출 유량 안내 (REST, 웹소켓) (2026.04.20 기준)이다.

| 대상               | 공지 기준                               |
| ------------------ | --------------------------------------- |
| REST 실전          | 계좌당 초당 18건; 기존 20건에서 변경    |
| REST 모의          | 초당 1건; 기존 2건에서 변경             |
| REST 접근토큰 발급 | 초당 1건                                |
| WS 접속키 발급     | 초당 1건                                |
| WS 동시 세션       | 계좌/앱키당 1세션                       |
| 실시간 등록        | 국내외 주식·파생 등 전체 상품 합산 41건 |

동시 호출은 100~150ms 간격을 권장한다. 서버 분산 정책으로 제한 이내 요청도 거부될 수 있다고 안내한다. 공식 샘플의 sleep 값이나 오래된 FAQ의 10/20 TPS를 운영 한도로 사용하지 않는다.

개발 제안은 계좌별 공통 큐·요청 병합·짧은 시세 캐시·백오프·재시도 상한·구독 예산이다. 30종목 체결만 보면 등록 30건이지만 30종목 체결+호가는 60건으로 공지 한도를 넘는다. 화면마다 업스트림을 새로 열지 않는다. 여러 서버 인스턴스도 같은 키를 사용하면 연결 소유권 조정이 필요하다. 실제 계정에 별도 약정이나 최신 변경 공지가 있는지 운영 전 확인한다.

[공식 유량 공지](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000001/post/d0d1a83f-6f8d-4437-9700-6d26702fd989).

공식 FAQ는 기본 API 이용의 별도 사용료가 없다고 안내하지만 일부 본문은 오래된 유량 수치를 포함한다. API 이용료, 실제 매매 수수료·세금, 공개 시세 계약 비용을 분리한다. 매매 수수료는 등록 계좌의 요율을 따르며 공개 배포 계약 비용은 이번 조사로 확정하지 않았다.

[사용 수수료 FAQ](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000002/post/beb2459a-f6b4-432e-928a-d3462dd0daef), [매매 수수료 FAQ](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000002/post/7bd5d350-4987-45e1-915b-4c63049cd85a).

## 8. 종목 검색과 마스터

KOSPI/KOSDAQ 마스터 파일을 서버에서 갱신하고 로컬 카탈로그로 검색한다. 사용자 입력마다 한투의 전체 종목 현재가를 요청하지 않는다. 종목 이름·코드·시장·업종 코드 매핑과 주식/ETF/ETN 포함 범위를 정한다. 갱신 실패 시 마지막 정상 버전을 유지한다.

공식 정제 예시는 ZIP, CP949, 고정 폭 레코드를 사용한다. 단축코드를 숫자로 읽지 않으며 레이아웃 변경·압축 해제·인코딩 검증이 필요하다. 샘플의 인증서 검증 해제나 검증 없는 압축 해제는 그대로 복사하지 않는다. Stock.sector 문자열에는 업종 코드 표를 사용하거나 미분류를 명시하고 임의 업종을 만들지 않는다.

[공식 마스터 정제 코드](https://github.com/koreainvestment/open-trading-api/blob/main/stocks_info/kis_kospi_code_mst.py), [전체 종목 파일 예제](https://github.com/koreainvestment/open-trading-api/tree/main/stocks_info).

## 9. 권장 구현 단계와 검증

| 단계 | 범위                              | 통과 기준                                             |
| ---- | --------------------------------- | ----------------------------------------------------- |
| 15A  | 서버 설정·토큰·005930 현재가 읽기 | 비밀값 미노출, 토큰 재사용, 숫자·오류 검증, 출처 표시 |
| 15B  | 일봉·전일 종가·마스터             | 날짜·수정주가·거래소 기준 일치, 검색 코드 보존        |
| 16   | KRX 실시간 1종목                  | 복수 체결 파싱, 승인·heartbeat·재연결·세션 정합성     |
| 17   | 관심종목·포트폴리오 확장          | 공유 구독·41건 예산·동시 사용자·장 전환·부분 실패     |

파일 구성 제안은 apps/api/src/market-data/kis/ 아래 config, token-manager, rest-client, normalizer, stream과 공급자 인터페이스다. 실제 구현 전 Mock 공급자와 기존 StocksService 경계를 확인한다. 환경 변수 이름 후보는 MARKET_DATA_PROVIDER, KIS_ENV, KIS_APP_KEY, KIS_APP_SECRET이며 서버 전용이다. 개인 실데이터 접근 경계와 공개 Mock 운영 구성을 먼저 확정한다.

테스트는 합성 fixture 기반으로 토큰 만료·동시 발급, HTTP 200 안의 업무 오류, 유량 초과, 005930, 하락 부호·결측값·기업행사, 휴장일·날짜 역순·중복, 복수 tick·오류 프레임·무체결 heartbeat·재연결, 구독 상한·참조 수를 다룬다. CI에 실키나 실시간 한투 접속을 요구하지 않는다. 별도 개인 환경에서 읽기 전용 smoke를 수동 검증하고 키·토큰을 결과물에서 제거한다.

이번 조사는 코드 변경·실제 인증·주문·배포를 수행하지 않는다. 다음 단계에서 필요한 정보는 키의 실제 값이 아니라 실전/모의 구분과 개인 검증 환경이다.

## 10. StockFlow 기능별 API 선정표

사용자가 제공한 신청 화면에서 실전투자계좌 구분을 확인했다. 계좌번호·키 값 등 개인정보는 이 문서에 옮기지 않는다. 아래는 필요한 API 계약의 선정이며 실제 키로 호출한 결과가 아니다. 초기 거래소는 KRX로 통일한다.

| 우선순위      | StockFlow 기능                         | KIS API / TR                                 | 적용 방식                                                    |
| ------------- | -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| 필수          | 서버 인증                              | POST /oauth2/tokenP                          | 실전용 키의 REST 토큰 캐시                                   |
| 필수          | WS 인증                                | POST /oauth2/Approval                        | 실시간 접속키 발급                                           |
| 필수          | /api/stocks 목록·검색                  | KOSPI/KOSDAQ 마스터 파일                     | 로컬 검색 인덱스; 입력마다 전체 종목 API 호출 금지           |
| 필수          | /api/stocks/:code/quote                | inquire-price / FHKST01010100                | 종목 상세 초기 현재가                                        |
| 필수          | /api/stocks/:code/candles              | inquire-daily-itemchartprice / FHKST03010100 | 일봉 및 가격 기준 확인                                       |
| 확장 시 필수  | 대시보드·관심종목·포트폴리오 초기 가격 | intstock-multprice / FHKST11300006           | 한 요청 최대 30종목; HTS 관심그룹 없이 사용                  |
| 필수          | 실시간 현재가·평가                     | H0STCNT0                                     | 종목별 KRX 체결 등록·해제, 서버 공유 연결                    |
| 운영 보완     | 휴장일 표시                            | chk-holiday / CTCA0903R                      | 가급적 일 1회 조회 후 캐시                                   |
| 운영 보완     | 거래정지·장운영 상태                   | H0STMKO0                                     | 종목별 상태 구독; 실제 이벤트 전달 범위 검증                 |
| 대시보드 확장 | KOSPI/KOSDAQ 지수 카드                 | inquire-index-price / FHPUP02100000          | U, 0001=KOSPI / 1001=KOSDAQ                                  |
| 후속          | 종목 상세 기본정보 보강                | search-stock-info / CTPF1002R                | PRDT_TYPE_CD=300, PDNO=6자리 코드; 이름 부분 검색 API가 아님 |
| 후속          | 분봉 차트                              | inquire-time-itemchartprice / FHKST03010200  | 당일 분봉 조회; 일봉 MVP 이후                                |
| 후속          | 호가창                                 | H0STASP0                                     | 체결 외 별도 구독 예산 필요                                  |

REST 표의 시세·운영 API 경로는 /uapi/domestic-stock/v1/quotations/ 뒤에 API 이름을 붙인다. 모든 GET 요청은 공통 인증 헤더 외 각 함수의 쿼리 계약을 따른다. 실전 지원 확인과 모의 지원 확인은 별도이며, 샘플의 자동 TR 치환을 모든 API에 무조건 적용하지 않는다.

휴장일은 BASS_DT와 연속조회 키를 사용한다. 공식 함수의 설명은 TCA0903R로도 표기하지만 실제 호출 상수는 CTCA0903R이므로 구현 시 개별 API 문서를 대조한다. 휴장일만으로 종목별 정지·VI·장중 상태가 모두 해결되지 않는다. 장운영 샘플은 명칭과 별개로 종목코드를 받으며 VI 발동·해제 수신을 설명하므로 전체 장 상태의 유일한 근거로 삼지 않는다.

가상 관심종목은 브라우저 코드 목록으로, 가상 보유 내역은 브라우저 Holding으로 유지한다. 한투 관심종목 그룹 생성이나 실제 계좌 잔고 API는 현재 요구사항에 필요하지 않다. 주문·정정·취소·매수가능금액·실제 잔고·체결통보는 이번 읽기 전용 범위에서 제외한다.

공식 추가 근거:

- [멀티 시세 TR과 경로](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/intstock_multprice/intstock_multprice.py)
- [지수 조회: KOSPI·KOSDAQ 코드와 TR](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_index_price/inquire_index_price.py)
- [휴장일: 일 1회 권고·실제 호출 TR](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/chk_holiday/chk_holiday.py)
- [주식기본조회: 종목번호 기반 조회](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/search_stock_info/search_stock_info.py)
- [종목별 장운영정보 KRX](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/market_status_krx/market_status_krx.py)
