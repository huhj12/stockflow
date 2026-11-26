# StockFlow

국내 주식(KOSPI, KOSDAQ) 모니터링 포트폴리오. 국내 주식 종목 검색과 DAY 4 종목 상세·모의 시세를 제공한다.

## 환경

Node.js 24.x와 npm을 사용한다. `.node-version`을 기준으로 Node 버전을 맞춘다.
Windows에서 프로젝트 내부 `.tools/node-v24.*-win-x64`를 설치한 경우 해당 폴더를 현재 셸 PATH 맨 앞에 추가한다. 이 도구 폴더는 Git에서 제외된다.

## 실행

```powershell
$env:PATH = (Join-Path $PWD '.tools\node-v24.22.2-win-x64') + ';' + $env:PATH
node --version # v24.x 확인
npm ci
npm run dev
```

브라우저에서 http://localhost:3000 을 열면 종목 검색 화면이 표시된다. 목록 API는 http://localhost:4000/api/stocks 이다.
기본 설정으로 바로 실행할 수 있다. `.env.example`은 설정 안내용이다. 웹에서 API 주소를 바꾸려면 `apps/web/.env.local`에 `NEXT_PUBLIC_API_BASE_URL`을 설정한다. 브라우저에서 접근 가능한 주소에 `/api`를 포함하며, 프로덕션에서는 빌드 전에 설정한다. API의 `WEB_ORIGIN`은 웹 페이지의 origin과 일치시킨다. API는 현재 셸의 PORT, WEB_ORIGIN 환경변수를 읽으며 .env 파일을 자동 로딩하지 않는다.

## 검증

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

E2E는 빌드된 웹과 API를 직접 시작한다. 먼저 3000·4000 포트의 개발 서버를 종료한다.

## 구조와 설계

- apps/web: Next.js App Router, React, TypeScript. 서버 상태는 TanStack Query, 클라이언트 상태는 Zustand를 사용한다. Zustand 스토어는 기능 구현 시 추가한다.
- apps/api: NestJS. 상태 확인, 종목 목록·검색, 종목 상세 API를 제공한다.
- packages/shared: 프레임워크 독립 도메인 타입. 런타임 입력 검증은 각 API 기능에서 추가한다.
- docs/requirements.md: MVP 범위와 API 계약.
  단일 lockfile의 npm workspaces로 의존성을 관리한다. 초기 단계에서 별도 모노레포 빌드 도구를 도입하지 않고 공용 패키지를 먼저 컴파일한다. 공용 타입 변경 시 dev를 재시작하거나 shared 빌드를 다시 실행한다.

## DAY 3 기능과 데이터 범위

홈 화면에서 KOSPI·KOSDAQ 테스트용 종목 30개를 조회할 수 있다. 검색은 종목명 또는 6자리 종목코드를 입력하고, 시장 필터를 함께 적용할 수 있다. 결과는 코드 오름차순이며 업종은 화면 개발을 위해 단순화한 분류다.

API 상세 계약은 [요구사항](docs/requirements.md)을 참고한다. 목록은 테스트용 시세 스냅샷을 표시한다. 종목명을 선택하면 상세 화면으로 이동한다.

## DAY 4 종목 상세와 모의 시세

검색 결과의 종목명을 선택하거나 http://localhost:3000/stocks/005930 에 접속한다. 종목 기본 정보, Mock 현재가, 전일 대비, 거래량과 30일 캔들·거래량 차트를 볼 수 있다.

시세와 일봉은 종목코드별로 고정 생성한다. 가격은 원, 거래량은 주 단위이며 타임스탬프는 Unix epoch 밀리초다. Mock 일봉에는 주말도 포함되며, 실제 거래소 데이터 연동은 후속 범위다.

가격 차트는 TradingView Lightweight Charts 5.2.1의 캔들·거래량 시리즈를 사용한다. 캔들 시간은 한국 날짜로 정규화해 정렬하며, 중복 날짜와 잘못된 OHLCV는 오류로 처리한다. 히스토리 반영과 차트 초기화를 분리해 후속 실시간 시세는 기존 시리즈의 update 메서드로 연결할 수 있다.

## 의존성 보안 확인 (2026-11-05)

Vitest와 NestJS를 업데이트해 초기 치명적·높은 위험 항목을 해소했다. 현재 전체 npm audit에는 개발 도구의 minimatch 전이 의존성과 그 영향 패키지에 중간 위험 9건이 남는다. 관련 상위 패키지는 Nest CLI와 typescript-eslint/Next ESLint 설정이다. 자동 강제 수정은 상위 도구의 이전 메이저 버전을 제안하므로 적용하지 않았다. 상위 패키지의 수정 릴리스를 확인한 뒤 호환성 검증과 함께 갱신한다. ESLint 9는 현 구성의 호환 버전이며 설치 시 지원 종료 경고가 나온다.

현재 PC에 준비된 브라우저를 재사용하려면 E2E 실행 전에 다음을 설정한다.

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $PWD '.tools\browsers'
npm run test:e2e
```

## DAY 2 검증 결과

2026-11-05 Windows 환경에서 다음 항목을 통과했다.

- Prettier, ESLint, TypeScript 검사
- Vitest HTTP 통합 테스트 2개
- shared → API → web 프로덕션 빌드
- Playwright Chromium E2E 1개: 시작 화면과 API 상태 응답
  브라우저 캡처로 시작 화면의 레이아웃을 확인했다. 검증 서버는 종료했으며 실행은 위의 npm run dev 명령을 사용한다.

## 협업 및 리뷰

개발은 dev에서 커밋하고 main 대상 PR로 검토합니다. GitHub Actions 자동 검사와 Codex AI 리뷰 설정은 [개발 흐름](docs/development-workflow.md)을 참고하세요.

## DAY 5 모의 시세

종목 상세 화면에 들어가면 WebSocket으로 해당 종목을 구독한다. 현재가와 거래량은 1초 간격의 Mock tick에 따라 바뀌고 차트는 마지막 모의 일봉을 증분 갱신한다. 연결이 끊겨도 마지막 수치를 표시하며 재연결 상태를 안내한다. WebSocket은 기존 API 호스트의 /ws/quotes 경로를 사용한다.

## DAY 6 관심종목

검색 결과와 종목 상세에서 관심종목을 등록하거나 해제한다. 관심종목 보기에서 저장한 종목, 상세 이동, 삭제를 이용할 수 있다. 목록은 브라우저 localStorage에 저장되므로 같은 브라우저 및 사이트에서 새로고침해도 유지된다.

## DAY 7 모의 시세 정렬

검색 결과의 가격·등락률·거래량 열을 눌러 내림차순과 오름차순을 전환한다. 초기에는 종목코드 오름차순이다. 값이 같은 종목은 코드 오름차순을 유지한다. 정렬은 현재 검색과 시장 필터 결과에 적용되며 목록은 상세 화면의 WebSocket과 별도로 Mock 고정 시세를 표시한다.

## DAY 8 MVP 통합 검증

검색 → 종목 상세와 실제 Mock WebSocket 연결 → 관심종목 저장 → 새로고침 → 상세 재진입 → 삭제 → 목록 복귀를 375px 모바일 화면에서 검증한다. 검색 응답 순서가 뒤바뀌는 상황, 관심종목 목록 API 실패 후 재시도, 상세 화면 이탈 시 재연결 타이머 취소도 E2E로 확인한다.

전체 검증은 위의 품질 명령과 `npm run test:e2e`를 사용한다. 통합 시나리오만 실행하려면 프로덕션 빌드 후 `npm run test:e2e -- tests/e2e/mvp-integration.spec.ts`를 실행한다. 테스트가 3000·4000 포트에서 웹과 API를 시작하므로 기존 개발 서버는 먼저 종료한다.

검증 범위와 후속 작업은 [DAY 8 검증 기록](docs/day8-verification.md)을 참고한다. 현재 E2E는 Chromium이며 모바일 크기 검증이 실제 iOS Safari 호환성을 보장하지는 않는다.

## DAY 9 배포 준비

다단계 Docker 이미지와 Compose, Vercel 웹 빌드 설정, 컨테이너 REST·WebSocket smoke 검증 CI를 추가했다. API는 API_HOST로 바인딩 주소를 설정하며 기본 로컬 실행은 유지한다.

Docker가 실행 중인 환경에서 `docker compose up --build --detach --wait --wait-timeout 180`으로 웹·API를 기동하고 http://localhost:3000 에 접속한다. 종료는 `docker compose down`이다. 실제 외부 운영 배포는 아직 하지 않았다. 환경 변수, Vercel Root Directory, HTTPS·WebSocket 및 검증 한계는 [배포 안내](docs/deployment.md)를 참고한다.

## DAY 11 성능 기준 측정

측정용 production profiling 빌드에서 실제 검색과 합성 30·300·3,000행의 검색·정렬·관심종목을 반복 측정한다. `npm run bench:build` 후 `npm run bench:stocks`를 실행하며 Chromium이 필요하다. 3100·4100 포트를 사용하고 기존 Docker 서버는 유지한다. 일반 빌드로 돌아오려면 `npm run build`를 실행한다.

[측정 방법·결과·한계](docs/performance/day11-baseline.md)와 [원본 데이터](docs/performance/day11-baseline.json)를 보관한다. 최종 7회 측정에서 실제 검색 p50은 308.7ms(275ms debounce 포함), 합성 3,000행 기본 CPU 정렬 p50은 732.2ms였다. 운영 SLA나 성능 개선 수치를 뜻하지 않으며 가상 스크롤 도입 전 기준이다.

## DAY 12 대량 목록 가상화

100개를 초과하는 목록은 TanStack Virtual로 화면 주변 행만 렌더링한다. 기존 30종목 Mock 목록은 전체 표를 유지한다. 키보드 이동·포커스 보존과 전체 목록 표시 전환을 제공하며, 대량 데이터는 테스트·계측 브라우저에만 주입한다.

[구현 결정과 전후 비교](docs/performance/day12-virtualization.md)에 원본 데이터를 보관했다. 동일 조건에서 합성 3,000행 기본 CPU 정렬 p50은 933.1ms → 23.5ms, 해당 DOM 수는 33,063개 → 221개였다. 실제 30종목 검색은 311.9ms → 312.1ms로 큰 차이가 없었다. 운영 SLA나 실제 모바일의 개선율로 해석하지 않는다.

## DAY 13 가상 포트폴리오

검색 화면의 가상 포트폴리오 링크 또는 `/portfolio`에서 보유 종목·수량·평균 매수가를 등록·수정·삭제한다. `npm run dev`로 실행하며 기존 Node.js 요구 버전을 사용한다. 같은 브라우저의 localStorage에 저장하고 고정 Mock 현재가로 평가금액·미실현 손익을 계산한다. 실제 계좌·주문·실시간 평가 기능은 아니다. 저장 실패·누락 가격 처리와 입력 제한은 [포트폴리오 계약](docs/portfolio.md)을 참고한다.

## DAY 14 포트폴리오 실시간 Mock 평가

보유 종목의 Mock WebSocket 가격으로 평가금액·손익·수익률을 갱신한다. 연결 전에는 고정 가격, 끊긴 후에는 마지막 수신 가격을 표시하고 연결 상태와 수신 시각을 안내한다. 종목 삭제·화면 이탈 시 구독을 해제한다. 실제 거래소 시세는 제공하지 않는다. [실데이터 API 조사](docs/market-data-api-research.md)에 KIS·키움 REST·LS 후보와 후속 연동 조건을 정리했다.
