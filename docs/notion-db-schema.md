# LinkedIn Signal Scout Notion DB Schema

This document defines the Notion database or data source expected by the research agent.

## Environment Variables

Required for live writes:

```env
NOTION_API_KEY=
NOTION_DATABASE_ID=
```

Optional:

```env
NOTION_DATA_SOURCE_ID=
NOTION_VERSION=2022-06-28
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
```

Use `NOTION_DATA_SOURCE_ID` only when working with a newer Notion data source parent. If it is present, it takes priority over `NOTION_DATABASE_ID`.

## Commands

Dry run:

```powershell
npm.cmd run scout:notion -- --dry-run --limit 2
```

Live write:

```powershell
npm.cmd run scout:notion
```

Live write with LLM enrichment:

```powershell
npm.cmd run scout:notion -- --llm
```

Sync feedback from Notion into local JSON:

```powershell
npm.cmd run feedback:notion
```

Then reuse the synced feedback:

```powershell
npm.cmd run scout:local -- --feedback data/research-agent/feedback.notion.json
npm.cmd run export:selected -- --feedback data/research-agent/feedback.notion.json
```

## Database Name

`LinkedIn Signal Scout`

## Properties

| Property | Type |
| --- | --- |
| Candidate ID | Text / Rich text |
| 소재명 | Title |
| 발견 날짜 | Date |
| 상태 | Select |
| 피드백 라벨 | Multi-select |
| 점수 | Number |
| 카테고리 | Select |
| 서비스/브랜드명 | Text / Rich text |
| 관찰된 기능/변화 | Text / Rich text |
| 검증 상태 | Select |
| 근거 스니펫 | Text / Rich text |
| 근거 유형 | Select |
| 검증 메모 | Text / Rich text |
| 한 줄 요약 | Text / Rich text |
| 핵심 왜 굳이 질문 | Text / Rich text |
| 비즈니스 관찰기 각도 | Text / Rich text |
| 소비자 행동 관점 | Text / Rich text |
| 기존 글과의 연결 | Text / Rich text |
| 겹침 위험 | Select |
| 추천 포맷 | Select |
| 직접 방문 가능 여부 | Select |
| 출처 URL | URL |
| 출처명 | Text / Rich text |
| 다음 액션 | Select |

## Select Values

상태:

- New
- Shortlisted
- Selected
- Written
- Published
- Rejected

검증 상태:

- verified
- needs-research
- rejected

근거 유형:

- official
- app-store
- article
- manual-observation
- unknown

카테고리:

- 리테일/브랜드
- 팝업/오프라인
- 스타트업/투자
- 대기업 신사업
- 앱/프로덕트
- 소비자 트렌드
- 핀테크/금융
- 글로벌 비교
- 커리어/네트워크

겹침 위험:

- 낮음
- 중간
- 높음

추천 포맷:

- 장문 관찰기
- 짧은 포스트
- 캐러셀
- 비교글
- 저장만

직접 방문 가능 여부:

- 가능
- 불가능
- 확인 필요
- 중요하지 않음

다음 액션:

- 채택 검토
- 추가 조사
- 직접 방문
- 보류
- 폐기
- 글쓰기 에이전트로 전달

피드백 라벨:

- 바로 글 가능
- 좋은데 추가조사 필요
- 직접 방문하면 좋음
- 너무 뉴스 같음
- 너무 어려움
- 내 톤 아님
- 너무 겹침
- 구체성이 약함
- 왜 굳이 약함
- 소비자 행동 관점 약함
- 비즈니스 각도 약함

## Notes

`Candidate ID` stores `ScoutCandidate.id`. Telegram callbacks can use this value later to find the candidate and update its status without relying on the Notion page ID.

The writer uses Notion's create page API with a parent database or data source and a `properties` object whose keys match the schema above. Long interpretive fields are also copied into the page body as readable blocks.
