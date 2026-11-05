# 브랜치, PR, 자동 검사와 AI 리뷰

## 브랜치 흐름

main은 검증된 기준 브랜치다. 일상 개발은 dev에서 커밋하고 push한다. 변경 묶음이 준비되면 base=main, compare=dev인 PR을 열고 검사와 리뷰를 확인한 뒤 사람이 병합한다. dev는 main의 하위 폴더가 아니라 main에서 분기한 별도 Git 이력이다.

```text
main ──────────────── merge
       ＼              ／
        dev ─ commit ─ PR
```

```shell
git switch dev
git add <변경한 파일>
git commit -m "feat: describe the change"
git push origin dev
```

dev를 장기 브랜치로 유지하는 동안 PR 병합 방식은 Create a merge commit을 사용한다. 병합 후 dev에서 git fetch origin과 git merge origin/main을 실행하고 git push origin dev로 동기화한다. 기능별 격리가 필요해지면 dev에서 codex/<작업명> 브랜치를 만들고 dev로 PR을 보낸다. main 직접 push와 자동 병합은 사용하지 않는다.

## GitHub Actions

.github/workflows/ci.yml은 dev/main push와 dev/main 대상 PR에서 실행된다. 읽기 전용 저장소 권한과 커밋 SHA로 고정한 공식 Actions를 사용한다. Node 버전은 .node-version을 따른다.

1. npm ci
2. npm run build: shared → API → web. 깨끗한 checkout에서 Next 라우트 타입도 생성한다.
3. npm run format:check, npm run lint, npm run typecheck
4. npm test
5. Chromium 설치 후 npm run test:e2e

실패 시 Playwright 결과를 7일 보관한다. GitHub Actions는 정해진 검사를 실행하는 도구이며 AI 리뷰 자체는 아니다. push와 PR 이벤트가 겹치면 서로 다른 실행 두 개가 보일 수 있다.

## Codex AI 리뷰

공식 설정: https://chatgpt.com/codex/settings/code-review
공식 안내: https://learn.chatgpt.com/docs/third-party/github

1. Codex와 GitHub 저장소 huhj12/stockflow를 연결한다.
2. 저장소의 Review code에서 Automatic review를 켠다.
3. Personal preferences와 Review trigger를 확인해 원하는 PR 이벤트에 실행되도록 한다.
4. 기존 PR은 댓글에 @codex review를 작성해 리뷰를 요청할 수 있다.

AGENTS.md의 Code Review Rules를 프로젝트 리뷰 기준으로 사용한다. 코드에 규칙을 추가하는 것만으로 계정의 자동 리뷰가 활성화되지는 않는다. 별도 API 키 기반 Actions 워크플로는 사용하지 않는다. 계정의 지원 여부와 사용량 조건은 Codex 설정에서 확인한다. AI 지적 사항과 CI 결과를 사람이 검토하고 병합한다.

## main 보호 설정

GitHub Settings → Rules → Rulesets에서 main을 대상으로 PR을 통한 변경, CI의 Quality and E2E 성공, force push 및 삭제 제한을 설정할 수 있다. 이 문서와 작업 규칙만으로 직접 push가 차단되지는 않는다. 1인 프로젝트에서는 다른 사람의 승인 1개를 필수로 지정하면 본인 PR 병합이 막힐 수 있으므로 협업자가 생겼을 때 적용한다.
