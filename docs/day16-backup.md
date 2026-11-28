# DAY 16 수집 확대와 PostgreSQL 백업·복원

확인일: 2026-11-28, Asia/Seoul. 개인용 WSL 서버 운영 작업이며 실제 키·시크릿·개인 계좌번호·시세 가격 원문·백업 파일을 저장소에 넣지 않는다.

## 시작 상태와 보존한 운영 변경

PR #24/#25/#26은 dev에 병합되어 있었고 최신 origin/dev bf49977에서 codex/day16-archive-backup을 만들었다. 기존 미추적 apps/web/AGENTS.md는 보존했다.

서버는 이 대화 이후 이미 별도 운영 작업으로 300종목·72,705개 일봉과 archive_ranked_universe 테이블, 영문이 섞인 종목코드 제약 확장, 읽기 전용 역할, 휴장일 판별기를 포함하고 있었다. 이 데이터·권한·스크립트는 축소하거나 덮어쓰지 않았다. 예약 수집기는 /etc/stockflow/collect-market-day.sh이며 실제 이전 예약 실행 2026-11-27 19:10의 성공을 확인했다. 2026-11-28 19:10은 시장 closed 로그로 정상 스킵했다.

이번 정기 수집 범위는 승인된 기존 curated 30종목이다. 운영 /etc/stockflow/archive.env의 ARCHIVE_CODES만 이 목록으로 바꿨고 다른 설정은 유지했다. 초기 1종목 설정의 root 전용 사본을 보존했다. 300종목 전체를 매일 수집하도록 변경한 것은 아니다. 개발용 .tools/archive-local.env와 운영 복사본은 자동 동기화하지 않는다.

## 실제 수집·복원 검증

- 실제 KIS 30종목 중 30종목 성공, 실패 0, 1,830개 일봉 갱신.
- 작업 후 전체 DB: 301종목, 72,794개 일봉. 기존 300종목의 장기 데이터와 순위 테이블을 유지했다.
- 전체 데이터 날짜: 2025-11-26 ~ 2026-11-27. 주말 11월 28일의 가짜 봉을 생성하지 않았다.
- 수집 확대 전 전체 DB를 먼저 백업·복원했고, 확대 후 다시 백업·복원했다.
- 운영 DB 5개 테이블의 행 수·전체 행 지문을 동일 백업 스냅샷의 manifest와 비교해 일치함을 확인했다.
- 원본 DB에는 복원하지 않았고 일회용 복원 DB가 종료 후 0개임을 확인했다.

## 백업 방식

PostgreSQL 17 컨테이너의 pg_dump custom format을 사용한다. 운영 테이블을 읽기 전용 REPEATABLE READ 트랜잭션으로 고정하고 pg_export_snapshot 결과를 pg_dump --snapshot과 manifest 조회가 공유한다. 수집과 동시 쓰기가 발생해도 dump와 테이블별 지문은 같은 시점의 데이터를 표현한다. 테이블별 지문은 행 JSON의 MD5들을 정렬해 합산한 확인값이고, 백업 파일 무결성은 별도의 SHA-256으로 검사한다.

임시 디렉터리에 dump와 manifest를 만든 뒤 검증하고 checksum 파일을 마지막에 공개한다. checksum이 있어야 완료된 묶음이다. 백업·복원 검증은 같은 flock으로 중복 실행을 피한다. 완료된 새 백업이 생긴 뒤에만 14일 이상 지난 정상 묶음을 지운다. 다른 파일, 불완전·손상된 묶음은 자동 삭제하지 않는다. 실패 시 이전 정상 백업을 유지하고 자신이 만든 임시 파일만 정리한다. dump 명령은 300초 제한과 잠금 대기 제한이 있으며 데이터베이스 도구는 암호 프롬프트 없이 실패하도록 설정했다.

복원은 stockflow_restore_check_날짜_PID 형식의 새 DB만 생성한다. pg_restore --single-transaction --exit-on-error로 복원하고 각 테이블의 행 수·지문을 백업 manifest와 대조한 뒤 이 임시 DB만 삭제한다. 원본 DB 이름을 복원 대상으로 받는 옵션은 제공하지 않는다. 검증 중 원본에 새 데이터가 들어와도 옛 백업의 지문을 기준으로 검사하므로 잘못 실패하지 않는다.

파일은 dump, manifest.jsonl, sha256 세 개가 한 묶음이다. 복구할 때 반드시 함께 보관한다. 역할·암호와 소유권/ACL은 portable dump에서 제외한다. 실제 재해 복구 시 역할·접근 권한과 외부 환경 파일을 별도로 재구성해야 한다. 임시 archive_test_* 스키마는 백업·manifest에서 제외한다. 정보 스키마·시스템 테이블은 데이터 manifest 대상이 아니다.

공식 근거: [pg_dump의 일관된 백업과 외부 snapshot](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html). snapshot/보관·운영 경로는 StockFlow 구현 결정이다.

## 일정과 운영 경로

| 작업                | 한국시간                                | 상태                                    |
| ------------------- | --------------------------------------- | --------------------------------------- |
| 30종목 수집         | 매일 19:10, 기존 판별기가 거래일만 수집 | 실제 30종목 수동 검증 및 대상 설정 완료 |
| 전체 DB 백업        | 매일 20:00                              | 등록·동일 운영 명령 수동 검증 완료      |
| 최신 백업 복원 검증 | 일요일 20:15                            | 등록·동일 운영 명령 수동 검증 완료      |

- /etc/stockflow/archive-ops-day16/: 고정 운영 스크립트, 디렉터리 700, 실행 파일 700, SQL 600.
- /etc/cron.d/stockflow-archive-backup: 새 백업·복원 일정. 기존 수집 cron은 유지했다.
- /var/backups/stockflow/: 백업 디렉터리 700, 묶음 파일 600, 14일 보관.
- /var/log/stockflow/backup.log 및 restore-check.log: 640, logrotate 매일 회전·14개 보관.
- /etc/logrotate.d/stockflow-archive-backup: 기존 수집 로그 설정과 분리했다.

개발 checkout의 브랜치를 바꿔도 고정 운영 스크립트는 유지된다. 수정 배포는 파일을 검증한 뒤 운영 경로에 명시적으로 설치한다. 암호·KIS 키를 읽거나 전달할 필요 없이 DB 컨테이너 내부의 로컬 접속으로 백업한다.

Linux 저장소 루트에서 운영자가 수동 확인할 때:

```sh
sudo bash deploy/archive/backup.sh
sudo bash deploy/archive/restore-check.sh
# 특정 묶음 검증은 경로/DB 이름 대신 묶음 basename만 지정한다.
sudo bash deploy/archive/restore-check.sh stockflow-archive-YYYYMMDDTHHMMSSZ-SUFFIX
```

다른 로컬 검증 환경은 ARCHIVE_DB_CONTAINER, ARCHIVE_DB_USER, ARCHIVE_DB_NAME, ARCHIVE_BACKUP_DIR을 지정한다. 보관 기간은 ARCHIVE_BACKUP_RETENTION_DAYS(1~365, 기본 14)다. 해당 경로의 전용 묶음 파일만 관리하므로 운영자는 다른 프로젝트 디렉터리를 지정하지 않는다.

## 회귀 검사

npm run test:backup은 Linux Bash와 Docker, 실행 중인 PostgreSQL 컨테이너가 필요하다. 실제 운영 테이블이 아닌 고유한 stockflow_backup_test_* DB와 /tmp/stockflow-backup-test.*를 만들고 정리한다. CI는 기존 PostgreSQL service 컨테이너를 사용하며 실키는 요구하지 않는다.

동시 쓰기 중 일관된 snapshot, 원본 변경 후 옛 백업 복원, 빈 테이블·한글·NULL·큰 정수, 파일 권한, 중복 실행 잠금, 손상 checksum 거부, dump 실패 시 임시 파일 정리·기존 백업 보존, 보관 기간과 무관한 파일 보존을 검증했다. format:check, lint, typecheck, Vitest 75개, production build도 통과했다. UI 변경이 없어 로컬 Playwright는 재실행하지 않았으며 기존 GitHub CI의 E2E는 유지한다.

## 남은 운영 한계

이것은 같은 WSL 호스트의 로컬 백업이다. 디스크·PC 전체 장애에 대비한 암호화된 외부 사본은 아직 없다. Windows/WSL이 꺼져 있으면 cron은 실행되지 않는다. 최초 미래 예약 백업·주간 복원 결과는 이후 로그로 확인해야 한다. 백업과 로그의 용량, 실패 기록, 디스크 여유 공간을 운영자가 확인한다. 자동 알림 발송이나 외부 클라우드 업로드는 추가하지 않았다.
