# StockFlow 작업 규칙

- DAY 단위로 범위를 정하고 승인된 작업을 완료한다.
- 기존 파일 삭제나 대규모 변경 전에 목적과 영향을 설명한다.
- TypeScript strict를 유지하고 종목 코드는 string으로 처리한다.
- apps/web은 UI, apps/api는 서버 로직, packages/shared는 프레임워크 독립 계약만 담당한다.
- 서버 상태는 TanStack Query, 클라이언트 상태는 Zustand로 관리한다. 필요할 때 스토어를 도입한다.
- 중요한 설계에는 이유를 기록하고 성능 주장은 측정값으로 입증한다.
- 기능별 테스트와 Git 커밋을 수행한다. 사용자 Git 신원을 임의로 설정하지 않는다.
- 변경 후 format:check, lint, typecheck, test, build를 실행한다. 사용자 흐름 변경은 관련 E2E를 확인한다.
- 비밀값과 실제 계좌 정보는 커밋하지 않는다.
