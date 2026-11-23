# DAY 9 배포 준비

## 구성과 현재 상태

웹은 Vercel에서 배포할 수 있도록 설정하고, 기존 NestJS HTTP·WebSocket 프로세스는 Docker 컨테이너로 운영한다. Mock 프로토콜과 로컬 npm 실행은 유지한다. 외부 운영 URL·계정·API 호스트가 확정되지 않아 이번 변경은 배포 가능한 산출물과 검증 자동화까지 준비한다. 외부 서비스를 만들거나 운영 배포를 활성화한 상태는 아니다.

- Dockerfile: 공통 의존성과 shared 빌드를 재사용하는 다단계 빌드. api와 web 타깃 모두 node 사용자로 실행한다. API 런타임은 API의 운영 의존성만, 웹 런타임은 Next standalone 추적 산출물만 포함한다.
- compose.yaml: 웹 3000, API 4000을 호스트의 loopback에 공개한다. API healthcheck 통과 후 웹을 시작한다. Linux 컨테이너를 사용한다.
- apps/web/vercel.json: apps/web을 Vercel Root Directory로 선택했을 때 루트 lockfile로 설치하고 shared → web 순서로 빌드한다.
- CI의 Docker deployment smoke: 실제 컨테이너를 빌드·기동한 후 웹 HTML, TradingView 라이선스 정적 파일, 종목 검색·시세·캔들 REST, CORS, WebSocket snapshot·tick을 확인하고 컨테이너를 종료한다. 이미지 게시·운영 배포나 비밀값을 사용하지 않는다.

## Docker 로컬 실행

Docker Engine 및 Compose v2가 실행 중인 환경에서 저장소 루트에서 실행한다. Docker Desktop을 사용하는 경우 Linux containers 모드가 필요하다. 3000·4000 포트의 기존 개발 서버를 먼저 종료한다.

```shell
docker compose config --quiet
docker compose up --build --detach --wait --wait-timeout 180
```

브라우저에서 http://localhost:3000 에 접속한다. NEXT_PUBLIC_API_BASE_URL은 브라우저가 호출하는 주소이므로 Compose 내부 DNS인 api:4000을 사용하면 안 된다. 기본값은 http://localhost:4000/api 다. Mock 시세이며 실제 거래소 데이터가 아니다.

Node.js 24와 npm 의존성이 설치된 호스트에서 추가 확인할 수 있다.

```shell
node scripts/smoke-deployment.mjs
docker compose logs --tail=100
docker compose down
```

컨테이너는 소스 bind mount 없이 빌드 결과를 실행한다. 코드를 변경하면 다시 --build로 실행한다. 관심종목은 기존과 같이 브라우저에 저장되며 컨테이너 재시작과 무관하다.

## 환경 변수 계약

| 변수                     | 적용 시점·위치 | 기본값·역할                                                                              |
| ------------------------ | -------------- | ---------------------------------------------------------------------------------------- |
| API_HOST                 | API 런타임     | 로컬 npm은 127.0.0.1, Docker 이미지는 0.0.0.0                                            |
| PORT                     | API 런타임     | 4000, 호스팅 서비스가 제공하는 포트 사용 가능                                            |
| WEB_ORIGIN               | API 런타임     | http://localhost:3000, REST CORS와 WebSocket 검증에서 동일하게 사용하는 정확한 웹 origin |
| NEXT_PUBLIC_API_BASE_URL | 웹 빌드 시     | http://localhost:4000/api, 브라우저에서 접근 가능한 API 절대 URL, /api 포함              |
| BUILD_STANDALONE         | 웹 빌드 시     | Docker 빌드만 1, 일반 npm·Vercel 빌드는 미설정                                           |
| SMOKE_WEB_ORIGIN         | 검증 스크립트  | 기본 http://localhost:3000, API의 WEB_ORIGIN과 일치                                      |
| SMOKE_API_BASE_URL       | 검증 스크립트  | 기본 http://localhost:4000/api                                                           |

NEXT_PUBLIC_API_BASE_URL은 공개 설정이며 비밀값을 넣지 않는다. Docker에서는 build arg로 전달하므로 런타임 environment만 바꿔서는 브라우저 번들의 주소가 바뀌지 않는다. 값을 변경하면 이미지를 다시 빌드한다. API는 .env 파일을 자동 로딩하지 않으며 쉘·컨테이너 환경을 사용한다. Compose는 루트 .env 또는 현재 쉘에서 WEB_ORIGIN과 NEXT_PUBLIC_API_BASE_URL 보간값을 읽는다.

## Vercel 웹 설정

1. huhj12/stockflow를 가져올 계정·팀과 프로젝트를 확인한다.
2. Root Directory를 apps/web으로 지정하고 루트 외부 소스 포함 옵션을 켠다. framework는 Next.js, Node.js는 24.x를 사용한다.
3. apps/web/vercel.json의 설치·빌드 명령을 사용한다. shared가 먼저 컴파일되어야 한다. BUILD_STANDALONE은 설정하지 않는다.
4. HTTPS로 접근 가능한 API의 /api 주소를 NEXT_PUBLIC_API_BASE_URL에 빌드 전에 설정한다.
5. API에 해당 웹의 정확한 HTTPS origin을 WEB_ORIGIN으로 설정한다. Preview URL과 Production URL은 다르므로 테스트할 origin에 맞는 별도 API 환경이나 고정된 Preview 도메인을 사용한다. wildcard로 WebSocket 검증을 우회하지 않는다.
6. 우선 Preview에서 검색·상세·관심종목·WebSocket 연결을 검증한다. 이후 운영 브랜치·릴리스 범위를 정해 Production을 진행한다. 기존 main 직접 수정·자동 PR 병합 금지 규칙을 유지한다.

## API 외부 호스팅 조건

저장소 루트를 Docker build context로 하고 target=api를 사용한다. 서비스가 주입하는 PORT, API_HOST=0.0.0.0, WEB_ORIGIN을 설정한다. TLS를 종료하는 프록시가 /api와 /ws/quotes를 모두 API로 전달하고 WebSocket Upgrade를 지원해야 한다. HTTPS 웹에서는 HTTPS API와 WSS 스트림을 사용한다. 컨테이너 내부 0.0.0.0 바인딩과 외부 공개 정책은 별개이며, 제공 Compose 파일은 로컬 확인용 loopback 포트 매핑이다.

헬스 경로는 /api/health다. SIGTERM은 기존 Nest shutdown hook을 통해 연결과 타이머를 정리한다. Mock 스트림은 연결별로 생성되어 다중 인스턴스 사이에 공유되지 않으며 실제 거래소 데이터 운영 설계와는 다르다.

## 검증 범위와 제한

2026-11-23 작업 PC에는 Docker 실행 파일이 없어 로컬 Docker 빌드·실행은 미실행이다. 대신 PR의 Docker deployment smoke 작업에서 Linux 이미지 빌드와 외부 포트 접근, REST/CORS, WebSocket 수신을 실제 검증한다. 로컬 npm 품질 검사와 원격 Docker 검증 결과는 PR과 완료 보고에서 구분한다. 실제 Vercel Preview와 외부 API 배포 검증은 아직 수행하지 않았다.

## 참고

- [Next standalone 산출물·모노레포 추적 경로](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Docker Compose healthcheck 기반 시작 순서](https://docs.docker.com/compose/how-tos/startup-order/)
- [Vercel 모노레포 Root Directory 설정](https://vercel.com/docs/monorepos)
