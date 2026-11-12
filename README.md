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

API 상세 계약은 [요구사항](docs/requirements.md)을 참고한다. 목록 데이터에는 현재가나 실시간 시세가 포함되지 않는다. 종목명을 선택하면 상세 화면으로 이동한다.

## DAY 4 종목 상세와 모의 시세

검색 결과의 종목명을 선택하거나 http://localhost:3000/stocks/005930 에 접속한다. 종목 기본 정보, Mock 현재가, 전일 대비, 거래량과 30일 캔들·거래량 차트를 볼 수 있다.

시세와 일봉은 종목코드별로 고정 생성한다. 가격은 원, 거래량은 주 단위이며 타임스탬프는 Unix epoch 밀리초다. Mock 일봉에는 주말도 포함되며, 실제 거래소 데이터와 실시간 스트리밍은 후속 범위다.

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
