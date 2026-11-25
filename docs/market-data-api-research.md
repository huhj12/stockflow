# 국내 주식 실데이터 API 조사

확인일: 2026-11-25. 증권사 공식 문서·공식 샘플 기준이며 실제 키를 발급하거나 인증 호출을 검증하지 않았다. 운영 시 적용되는 요금·유량·재배포 허용 범위는 계정 신청 및 최신 약관 확인이 필요하다.

## 후보 비교

| 후보                      | 국내 주식 데이터                                            | 인증·준비                                           | StockFlow 판단                                                                                             |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 한국투자증권 KIS Open API | REST 현재가·기간별 시세, WebSocket 체결·호가, 종목정보 파일 | 계좌 App Key·App Secret 기반 토큰, WebSocket 접속키 | 1차 연동 후보. 공식 REST·WS 샘플과 종목 마스터 자료를 함께 활용할 수 있다.                                 |
| 키움증권 REST API         | REST 주식 API, WebSocket 0B 주식체결                        | 키움 계좌·서비스 신청·허용 IP 등록·앱 키/시크릿     | 대안 후보. 기존 Windows 전용 OpenAPI+ 대신 REST 상품을 검토한다. 인증 가능한 서버 출발 IP를 확보해야 한다. |
| LS증권 OPEN API           | t1102 현재가, t1305 기간별 주가, S3_ KOSPI·K3_ KOSDAQ 체결  | 위탁 계좌·API 신청·앱 키/시크릿·Access Token        | 국내 시세와 실시간 TR이 구체적으로 구분되어 있는 대안이다.                                                 |

추천은 문서와 기존 서버 구조의 적합성을 바탕으로 한 개발 판단이며 품질·속도·요금의 실측 비교 결과가 아니다. 키움 0B 문서에는 국내·미국 합산 실시간 200종목 한도가 표시되어 있다. KIS·LS의 계정별 연결 수·구독 종목 수·초당 호출 수는 이번 공개 문서 조사만으로 확정하지 않는다. 키움 안내는 허용 IP 최대 10개와 24시간 토큰을 설명한다. 실제 연동 시 최신 적용값을 다시 확인한다.

## 개인 조회와 공개 배포

개인 API 사용 신청만으로 불특정 다수에게 시세를 재제공할 권한이 확보된다고 판단하지 않는다. 세 후보 모두 StockFlow 공개 웹서비스에서 데이터 표시·캐싱·재전송·보관이 허용되는지 이번 조사로 확정하지 못했다. 증권사에 공개 포트폴리오 목적·비상업성·동시 사용자·실시간 제공 범위를 설명하고 허용 범위 및 별도 계약·비용을 확인해야 한다. 무료·무제한·공개 재배포 가능이라고 표기하지 않는다. 그 전까지 공개 데모는 Mock을 유지하고 실데이터는 개인 개발 검증으로 분리한다.

## 후속 연동 설계

NestJS 서버만 공급자 키·토큰을 보관한다. NEXT_PUBLIC 환경 변수·브라우저 저장·로그·Git에는 키를 넣지 않는다. 공급자 REST·WS를 서버에서 수신하여 기존 StockQuote·StockCandle 계약으로 변환하고 브라우저에는 StockFlow API만 제공한다. 키 발급은 사용자가 증권사에서 직접 진행한다.

공급자별 날짜·부호 있는 가격 문자열·누적 거래량·종목 접두어·KRX/NXT 통합 구분을 명시적으로 정규화한다. StockFlow 종목 코드는 6자리 문자열, 시간은 Unix 밀리초다. 공급자 체결 시각과 서버 수신 시각을 구분하고 서버 세션/sequence를 발행한다. 토큰 갱신·재구독·호출 제한·장 운영 상태·휴장일·정정 시세를 테스트한다.

공급자 연결은 서버에서 종목별로 공유하고 브라우저 구독자를 팬아웃한다. DAY 14의 종목당 브라우저 Mock 연결 수를 그대로 증권사 연결 수로 옮기지 않는다. 초기 실데이터 범위는 주문 없이 현재가 1종목 → 일봉 → 실시간 1종목 순서다. Mock과 실데이터를 조용히 혼합하지 않고 데이터 출처·기준 시각·연결 상태를 표시한다.

## 공식 출처

- [KIS 서비스 소개: 인증·REST·WebSocket·종목 파일](https://apiportal.koreainvestment.com/intro)
- [KIS API 목록](https://apiportal.koreainvestment.com/apiservice)
- [KIS 공식 샘플 저장소](https://github.com/koreainvestment/open-trading-api)
- [키움 이용안내: 계좌·허용 IP·앱 키·토큰](https://openapi.kiwoom.com/intro/serviceInfo)
- [키움 0B 주식체결: WebSocket·구독 한도](https://openapi.kiwoom.com/guide/apiGuideContents/14/0B)
- [키움 공식 REST 샘플](https://github.com/Kiwoom-Securities/Kiwoom-REST-API)
- [LS 계좌·API 신청 안내](https://openapi.ls-sec.co.kr/about-openapi)
- [LS 현재가·차트·실시간 TR 목록](https://openapi.ls-sec.co.kr/apiservice)
- [LS 토큰·WebSocket 시작하기](https://openapi.ls-sec.co.kr/howto-use)
