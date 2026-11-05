# StockFlow

국내 주식(KOSPI, KOSDAQ) 모니터링 포트폴리오. 현재 DAY 2 개발 환경 구축 단계다.

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

웹: http://localhost:3000, API: http://localhost:4000/api/health
기본 설정으로 바로 실행할 수 있다. `.env.example`은 설정 안내용이다. 웹의 사용자 설정은 `.env.local`에 작성한다. API는 현재 셸의 PORT, WEB_ORIGIN 환경변수를 읽으며 .env 파일을 자동 로딩하지 않는다.

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
- apps/api: NestJS. DAY 2는 상태 확인 API만 제공한다.
- packages/shared: 프레임워크 독립 도메인 타입. 런타임 입력 검증은 각 API 기능에서 추가한다.
- docs/requirements.md: MVP 범위와 API 초안.
  단일 lockfile의 npm workspaces로 의존성을 관리한다. 초기 단계에서 별도 모노레포 빌드 도구를 도입하지 않고 공용 패키지를 먼저 컴파일한다. 공용 타입 변경 시 dev를 재시작하거나 shared 빌드를 다시 실행한다.

## 개발 범위

DAY 2에는 실제 검색·차트·관심종목·WebSocket을 구현하지 않는다. 이후 Mock 데이터부터 기능별로 개발한다. PostgreSQL, Docker, GitHub Actions, Vercel 배포는 후속 단계다. NestJS의 장기 WebSocket 서버 배포 대상은 별도로 결정한다.

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
