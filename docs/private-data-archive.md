# DAY 15 개인용 일봉 아카이브·Swagger

## 범위

한투 KRX 원주가 일봉 → PostgreSQL → 개인용 NestJS 조회 API → Swagger 흐름이다. 기본 Mock 웹·REST·WebSocket은 유지한다. 한투 시세의 공개 웹·앱 재제공 제한 때문에 별도 개인용 서비스를 loopback에 둔다. API·Swagger 모두 별도의 HTTP Basic 비밀번호로 보호한다. localhost 밖에서 접근하려면 SSH 터널 또는 인증·HTTPS가 있는 개인용 접근 경계를 별도로 구성해야 한다. 비밀번호를 KIS 키로 설정하지 않는다.

초기 합성 검증을 마친 뒤 실제 KIS 읽기 전용 수집과 cron 활성화를 완료했다. 현재 결과와 운영 경로는 [실수집 검증 기록](day15-live-verification.md)을 따른다. 초기 종목 메타데이터는 기존 curated 30종목이며 실제 마스터 자동 갱신은 후속이다. 일봉과 실행 기록만 저장한다. 당일 현재가 스냅샷·실시간 체결 저장·휴장일 테이블·종목 마스터 자동 수집은 이번 DAY 범위가 아니다.

## 구성

- compose.archive.yaml: 기존 실행 서비스와 독립된 PostgreSQL 17과 private-api, 일회성 collector.
- archive_stocks: curated 종목 메타데이터; 이미 있는 이름·업종은 seed로 덮어쓰지 않는다.
- archive_daily_candles: 코드·KRX·거래일·원주가 여부·출처의 고유키. 재실행은 upsert한다.
- archive_collection_runs: running/success/partial/failed/interrupted 상태와 종목별 실패 코드.
- DB 마이그레이션은 별도 명령으로 실행한다. v1은 추가형이며 기존 테이블·데이터를 삭제하지 않는다.
- fixture와 kis를 고유키와 조회 조건에서 구분하며 합성 데이터로 실데이터를 채우지 않는다.

## 비밀값 준비와 실행 순서

deploy/archive/.env.example을 deploy/archive/.env로 복사한다. 이 파일은 Git·Docker 빌드 컨텍스트에서 제외된다. POSTGRES_PASSWORD는 URL-safe 무작위 문자열, PRIVATE_API_PASSWORD는 최소 24자 별도 무작위 문자열을 사용한다. KIS 키는 검증 준비 후 KIS_APP_KEY와 KIS_APP_SECRET에 직접 입력하며 채팅·커밋·로그에 넣지 않는다. DB 비밀번호는 최초 볼륨 생성 후 파일만 바꿔도 자동 변경되는 값이 아니다. 볼륨을 지우는 방식으로 비밀번호를 바꾸지 않는다.

Linux/WSL, 저장소 루트 기준:

```sh
# 1. DB 기동과 수집기 이미지 빌드 (키 없이 가능)
docker compose -p stockflow-archive --env-file deploy/archive/.env -f compose.archive.yaml up -d --wait db
docker compose -p stockflow-archive --env-file deploy/archive/.env -f compose.archive.yaml build private-api collector
# 2. 명시적 마이그레이션 (키 없이 가능)
docker compose -p stockflow-archive --env-file deploy/archive/.env -f compose.archive.yaml run --rm --no-deps collector node apps/api/dist/archive/cli.js migrate
# 3. 개인용 API와 Swagger 기동 (키 없이 가능)
docker compose -p stockflow-archive --env-file deploy/archive/.env -f compose.archive.yaml up -d private-api
# 4. 키 입력 후 한 종목 읽기 전용 수집. ARCHIVE_CODES 기본값은 005930.
docker compose -p stockflow-archive --env-file deploy/archive/.env -f compose.archive.yaml run --rm --no-deps collector
```

Swagger: http://localhost:4400/api/docs/ . 로그인 이름은 stockflow, 비밀번호는 PRIVATE_API_PASSWORD다. OpenAPI JSON /api/docs-json도 보호한다. Swagger Authorize 창에도 StockFlow 개인용 비밀번호를 사용한다. 한투 키를 Swagger에 입력하지 않는다. Basic은 암호화가 아니므로 loopback 밖에서 평문 HTTP로 노출하지 않는다.

기존 /api/stocks는 Mock이다. 새 경로:

| GET 경로                                                         | 응답·조건                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| /api/archive/stocks?query=삼성&market=KOSPI                      | 저장된 종목 정보, code 오름차순                                              |
| /api/archive/stocks/005930/candles?from=2026-11-01&to=2026-11-24 | 날짜 오름차순 일봉, 최대 366일 구간                                          |
| /api/archive/stocks/005930/quote                                 | 최신 저장 일봉의 close·date·collectedAt·kind=daily-close; 실시간 현재가 아님 |
| /api/archive/collection-runs                                     | 최근 실행 최대 50건                                                          |

출처 기본값은 kis다. 검증 자료는 source=fixture를 명시해야 보인다. 빈 봉 목록은 items=[],total=0이고 저장 종가가 없으면 404다. 잘못된 코드·배열 쿼리·날짜·시장·출처는 400이다. 인증 없이는 401이다. ENABLE_PRIVATE_ARCHIVE=1일 때만 새 모듈·Swagger를 켜며 DB URL과 비밀번호가 없으면 시작하지 않는다. 기존 기본 API 실행에는 DB가 필요하지 않다.

## 수집 정책

KIS_ENV=prod, KRX(J), 원주가(1), 일봉(D)을 고정한다. 주문·계좌 API는 호출하지 않는다. 초기 검증은 한 종목이며 ARCHIVE_CODES에 curated 코드의 쉼표 목록을 넣어 최대 기존 30종목으로 확장한다. 빈 설정으로 대상을 암묵적으로 확대하지 않도록 Compose 기본값은 005930이다.

ARCHIVE_FROM/ARCHIVE_TO가 비어 있으면 최근 90 달력일을 매번 다시 수집한다. 서울 19:00 이전에는 어제, 이후에는 오늘까지 대상으로 한다. 이는 KRX 일봉 작업의 보수적인 실행 기준이며 거래소 데이터 확정 보장은 아니다. 최근 날짜 재조회로 정정과 단기 누락을 갱신한다. 90일보다 긴 중단·더 오래된 기업행사 정정은 명시적 날짜 구간을 주어 복구한다. 수동 구간은 최대 366일이고 60일씩 나눠 100봉 제한을 피한다. 미래·오늘 장중 구간은 수집하지 않는다.

계좌별 순차 요청에 최소 250ms 간격을 두고 실패 시 최대 3회 시도한다. 토큰은 프로세스 내에서 응답 만료시각까지 재사용한다. 현재는 하루 한 번 일회성 프로세스이므로 프로세스 간 영속 토큰 캐시는 없다. 별도의 다른 KIS 프로그램과 유량을 공유하는 상황은 운영자가 조정해야 한다.

PostgreSQL 세션 advisory lock은 같은 DB의 수동 실행과 cron 중복을 막는다. 이미 실행 중이면 locked로 종료한다. 종목·날짜 구간 단위 트랜잭션으로 저장하며 일부 종목 실패는 partial 및 실패 코드로 남긴다. 실패한 명령은 종료 코드 1이다. 요청 성공이더라도 전체 저장 봉이 0이면 failed로 남겨 초기 수집 성공으로 오인하지 않는다. 실행 중 강제 종료가 생기면 다음 잠금 획득 실행에서 미완료 기록을 interrupted로 표시한다. DB·KIS 오류 원문과 인증정보를 콘솔에 출력하지 않는다.

## cron

호스트 cron이 deploy/archive/collect.sh를 실행한다. 기본 환경 파일은 deploy/archive/.env이며 STOCKFLOW_ARCHIVE_ENV로 절대 경로를 지정할 수 있다. 예시는 deploy/archive/cron.example에 있다. 실제 KIS 1종목 수집을 확인하기 전에는 crontab에 등록하지 않는다.

호스트 timezone이 Asia/Seoul이면 평일 19:10, UTC이면 평일 10:10이 같은 시점이다. 환경 변수 TZ만 적으면 cron 스케줄까지 바뀐다고 가정하지 않는다. 휴장일에는 최근 봉을 재조회하며 최신 일봉 날짜로 실제 데이터 기준을 확인한다. cron은 꺼진 서버의 작업을 자동 보상하지 않으므로 재기동 후 수동 수집 또는 별도 catch-up 스케줄이 필요하다. 로그 경로·권한·로테이션과 DB 백업은 운영 전 설정한다. Docker group 권한은 호스트 관리자 권한에 준하므로 승인된 서버 운영 계정에서 실행한다.

## 검증

npm test는 날짜·OHLC·인증·토큰 재사용·비밀값을 제거한 오류를 검증한다. npm run build 후 ARCHIVE_TEST_DATABASE_URL을 설정하고 npm run test:archive를 실행하면 실제 PostgreSQL 안에 무작위 테스트 스키마를 만들어 마이그레이션·중복 갱신·롤백·동시 잠금·부분 실패·빈 응답·중단 복구와 보호된 API·OpenAPI 응답을 확인한다. 테스트 스키마만 finally에서 삭제한다. 운영 테이블이나 볼륨을 삭제하지 않는다. CI도 임시 PostgreSQL로 실행하며 실키는 요구하지 않는다.

Windows 기존 WSL 서버가 3000/4000을 쓰고 있으므로 전체 E2E는 별도 3200/4200 설정으로 실행할 수 있다. 방법은 portfolio.md를 따른다. 로컬 DB 검증 환경은 .tools/archive-local.env에 자동 생성한 비밀번호를 저장하며 KIS 두 값은 비어 있다. 이 파일을 출력하거나 Git에 넣지 않는다. 키 입력 후에는 같은 파일을 --env-file로 지정해야 현재 로컬 컨테이너와 비밀번호가 일치한다.
