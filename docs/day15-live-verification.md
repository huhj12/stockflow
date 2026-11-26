# DAY 15 실제 KIS 수집·cron 활성화 기록

확인일: 2026-11-25 (Asia/Seoul). 개인용 WSL 서버에서 읽기 전용 일봉 수집을 검증했다. 키·시크릿·계좌번호·시세 가격 원문은 이 기록에 포함하지 않는다.

## 검증 결과

- 삼성전자 005930, KRX, 원주가 일봉 60개 저장.
- 저장 날짜: 2026-08-28 ~ 2026-11-25. 최근 90 달력일 조회 결과이며 거래일 90개를 뜻하지 않는다.
- 초기 수집, 예약 명령과 같은 재실행, 고정 운영 이미지 재실행의 3회 모두 success.
- 3회 실행 이후 저장 행은 60개로 동일하다. 신규 중복 행은 0개다.
- DB 조회 API의 source=kis, 최신 종가 kind=daily-close, 최신 날짜 및 날짜 오름차순을 확인했다.
- 보호된 OpenAPI JSON과 DB 조회를 확인했다. Swagger 주소는 http://localhost:4400/api/docs/ 이다.
- 주문·계좌 잔고·자산 조회는 실행하지 않았다.

## 현재 운영 일정

WSL 호스트 시간대는 KST +0900이고 cron 서비스는 active/enabled다. 매일 19:10 한국시간에 삼성전자 1종목을 수집한다. 주말·휴장일에도 최근 구간을 재조회하며 기존 행을 갱신한다. 첫 미래 예약 시각의 실제 실행은 아직 관찰하지 않았으며 등록과 동일 명령의 즉시 실행을 검증한 상태다.

- /etc/cron.d/stockflow-archive: 매일 19:10 예약, root 소유 644.
- /etc/stockflow/archive.env: 운영 비밀값 복사본, root 소유 600.
- /etc/stockflow/collect.sh: 개발 checkout과 독립된 실행 파일, root 소유 700.
- /etc/stockflow/compose.archive.runtime.yaml: 고정 이미지 실행 설정, root 소유 600.
- stockflow-archive-collector:day15-13da2db: 검증된 코드의 운영 이미지 태그.
- /var/log/stockflow/archive.log: 실행 로그, root 소유 640.
- /etc/logrotate.d/stockflow-archive: 매일 회전·14개 보관·압축, 설정 검증 통과.

예약 작업은 Git 작업 폴더의 현재 브랜치나 컨테이너 latest 이미지에 의존하지 않는다. Docker 기본 네트워크 stockflow-archive_default와 DB 컨테이너는 필요하다. 키나 설정을 바꿀 때 개발용 .tools/archive-local.env 변경만으로 운영 복사본이 자동 갱신되지는 않는다. 승인된 운영자가 기존 DB 비밀번호를 유지하며 운영 파일을 동기화하고 한 번 수동 검증해야 한다. 값을 채팅이나 로그에 출력하지 않는다.

## 운영 확인과 한계

Swagger 로그인 이름은 stockflow이며 개인용 PRIVATE_API_PASSWORD를 사용한다. 한투 키를 Swagger에 입력하지 않는다. 같은 PC에서 localhost로 접근하며 외부 인터넷에 공개하지 않았다.

운영자는 cron 상태, 수집 이력의 실패·부분 실패·최신 저장 날짜, 디스크 사용량과 DB 백업을 확인한다. Windows/WSL 서버가 꺼져 있거나 절전 중이면 그 시각의 cron은 실행되지 않는다. 재가동 후 한 번 수동 수집하면 최근 90일 범위를 복구하고, 더 긴 중단은 명시적 기간으로 복구한다. DB 정기 백업·종목 30개 확장·실제 다음 예약 실행 확인은 후속이다. 기존 코드의 테스트 75개, E2E 41개 및 실제 DB 통합 검증은 이전 구현에서 통과했으며 이번 변경은 운영 설정과 문서에 한정된다.
