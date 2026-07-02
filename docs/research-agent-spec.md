좋아. 아래는 그대로 `docs/research-agent-spec.md`에 넣고, Codex한테 순서대로 이슈를 잘라서 개발시키면 되는 **전체 개발 명세서**야.

리서치에서 이미 나온 핵심은 두 가지야. 첫째, LinkedIn은 단순 바이럴보다 전문적 관련성, 맥락 있는 지식, 건설적 대화를 더 중요하게 보는 방향이라 “비즈니스 관찰기”는 플랫폼 방향과 잘 맞아.  둘째, 자동화는 LinkedIn 스크래핑/자동 engagement가 아니라, 네 자료와 공개 소스를 바탕으로 한 RAG·검증·인간 승인형 워크플로로 가야 안전해. 

# LinkedIn Research & Content Manager Agent 개발 명세서

## 0. 프로젝트 개요

### 프로젝트명

`LinkedIn Research & Content Manager Agent`

### 목적

이 프로젝트는 LinkedIn 글을 직접 작성하는 에이전트가 아니라, 그 앞단에서 **글감이 될 만한 비즈니스 소재를 발굴하고 관리하는 Research Agent**다.

사용자는 LinkedIn에 “비즈니스 관찰기” 스타일의 글을 쓴다. 대표 글은 Olive Better라는 웰니스 오프라인 매장을 보고, “Olive Young이 이미 있는데 왜 굳이 Olive Better를 따로 만들었을까?”라는 질문에서 출발한 글이다.

따라서 이 에이전트의 핵심 역할은 단순 뉴스 요약이 아니라, 구체적인 브랜드, 매장, 앱, 스타트업, 제품, 투자 사례에서 **“왜 굳이?”라는 질문이 생기는 소재**를 매일 찾아오는 것이다.

---

## 1. 핵심 제품 정의

### 1.1 한 줄 정의

> 매일 공개 소스에서 LinkedIn 비즈니스 관찰기 후보 20개를 발굴하고, 각 후보를 “왜 굳이?” 질문과 비즈니스 관찰기 각도로 정리해 Notion DB에 저장하는 콘텐츠 스카우팅 에이전트.

### 1.2 MVP 목표

1차 MVP에서는 다음까지만 만든다.

* 매일 후보 20개 생성
* 모든 출력은 한국어
* 깊은 리포트가 아니라 빠르게 판단 가능한 짧은 브리프
* LinkedIn 성과 분석 API 제외
* LinkedIn 스크래핑 제외
* 자동 게시 제외
* Notion DB에 후보 저장
* 사용자의 채택 / 보류 / 폐기 피드백을 저장
* 피드백을 바탕으로 다음 추천 점수에 반영

### 1.3 MVP에서 하지 않는 것

아래 기능은 1차 MVP 범위에서 제외한다.

* LinkedIn 게시 자동화
* LinkedIn 댓글 / 좋아요 / DM 자동화
* LinkedIn 피드 스크래핑
* 타인의 LinkedIn 글 크롤링
* 성과 데이터 자동 수집
* 실존 인물의 문체 복제
* 완전 자동 글 작성 및 게시

---

## 2. 기존 repo 내 위치

### 2.1 권장 위치

새로운 repo를 만들지 않는다. 기존 LinkedIn 글쓰기 repo 안에 새 모듈로 추가한다.

```txt
linkedin/
  SKILL.md
  agents/
    writing-agent.md
    research-scout-agent.md

  templates/
    olive-better-style.md
    daily-scout-output.md

  data/
    examples/
      olive-better.md
      networking-post.md
      math-transfer-post.md

    research-agent/
      raw_candidates.sample.json
      feedback.sample.json
      selected_examples.json

  src/
    research-agent/
      index.ts
      scout.ts
      sources.ts
      dedupe.ts
      classify.ts
      score.ts
      why-question.ts
      notion.ts
      feedback.ts
      daily-output.ts
      types.ts
      config.ts

  docs/
    research-agent-spec.md
    notion-db-schema.md
    codex-prompts.md
```

### 2.2 역할 분리

| 위치                                | 역할                      |
| --------------------------------- | ----------------------- |
| `SKILL.md`                        | LinkedIn 글쓰기 철학과 스타일 규칙 |
| `agents/research-scout-agent.md`  | 리서치 에이전트의 프롬프트 / 행동 규칙  |
| `templates/daily-scout-output.md` | 하루 20개 후보 출력 템플릿        |
| `data/research-agent/`            | 샘플 raw 후보, 피드백, 선택 사례   |
| `src/research-agent/`             | 실제 코드                   |
| `docs/`                           | 개발 명세서와 Codex 작업 지시서    |

---

## 3. 전체 시스템 구조

### 3.1 최종 파이프라인

```txt
Public Sources
↓
Raw Candidate Collector
↓
Normalizer
↓
Deduplicator
↓
Classifier
↓
Why-Gudi Question Generator
↓
Dahyeong-Fit Scorer
↓
Top 20 Selector
↓
Notion DB Writer
↓
User Feedback Collector
↓
Recommendation Memory
↓
Writing Agent
```

### 3.2 1차 MVP 파이프라인

1차 MVP는 live scraping 없이 local JSON으로 시작한다.

```txt
raw_candidates.sample.json
↓
normalizeCandidates()
↓
dedupeCandidates()
↓
classifyCandidate()
↓
generateWhyGudiQuestion()
↓
scoreCandidate()
↓
selectTop20()
↓
renderDailyScoutMarkdown()
↓
Notion 저장은 2단계에서 추가
```

---

## 4. 데이터 모델

### 4.1 RawSourceItem

외부 소스에서 처음 들어오는 원재료 데이터다.

```ts
export type RawSourceItem = {
  id?: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt?: string;
  rawSummary?: string;
  country?: "KR" | "GLOBAL" | "US" | "JP" | "EU" | "UNKNOWN";
  sourceCategory:
    | "startup_news"
    | "investment_news"
    | "retail_brand"
    | "popup_offline"
    | "big_company_experiment"
    | "app_product_update"
    | "consumer_trend"
    | "global_case"
    | "manual";
  collectedAt: string;
};
```

### 4.2 ScoutCandidate

에이전트가 가공한 최종 후보 데이터다.

```ts
export type ScoutCandidate = {
  id: string;
  discoveredDate: string;

  status: "new" | "shortlisted" | "selected" | "written" | "published" | "rejected";

  feedbackLabels: FeedbackLabel[];

  score: number;
  scoreBreakdown: ScoreBreakdown;

  category:
    | "리테일/브랜드"
    | "팝업/오프라인"
    | "스타트업/투자"
    | "대기업 신사업"
    | "앱/프로덕트"
    | "소비자 트렌드"
    | "핀테크/금융"
    | "글로벌 비교"
    | "커리어/네트워크";

  topicName: string;
  oneLineSummary: string;
  coreWhyGudiQuestion: string;
  businessObservationAngle: string;
  consumerBehaviorAngle: string;
  connectionToExistingPosts: string;

  overlapRisk: "낮음" | "중간" | "높음";

  recommendedFormat:
    | "장문 관찰기"
    | "짧은 포스트"
    | "캐러셀"
    | "비교글"
    | "저장만";

  visitPossible: "가능" | "불가능" | "확인 필요" | "중요하지 않음";

  sourceUrl: string;
  sourceName: string;

  nextAction:
    | "채택 검토"
    | "추가 조사"
    | "직접 방문"
    | "보류"
    | "폐기"
    | "글쓰기 에이전트로 전달";
};
```

### 4.3 FeedbackLabel

```ts
export type FeedbackLabel =
  | "바로 글 가능"
  | "좋은데 추가조사 필요"
  | "직접 방문하면 좋음"
  | "너무 뉴스 같음"
  | "너무 어려움"
  | "내 톤 아님"
  | "너무 겹침"
  | "구체성이 약함"
  | "왜 굳이 약함"
  | "소비자 행동 관점 약함"
  | "비즈니스 각도 약함";
```

### 4.4 ScoreBreakdown

```ts
export type ScoreBreakdown = {
  concreteCase: number;
  whyGudiStrength: number;
  consumerBehaviorPotential: number;
  businessInterpretability: number;
  dahyeongFit: number;
  novelty: number;
  sourceReliability: number;
  visitabilityBonus: number;
};
```

---

## 5. 점수화 기준

### 5.1 총점

총점은 100점 만점이다.

| 항목            |  배점 | 설명                                       |
| ------------- | --: | ---------------------------------------- |
| 구체성           |  20 | 브랜드, 매장, 앱, 제품, 스타트업 등 구체 대상이 있는가        |
| 왜 굳이 강도       |  20 | “왜 굳이?” 질문이 자연스럽고 강한가                    |
| 소비자 행동 해석 가능성 |  15 | 소비자의 구매, 방문, 선택, 신뢰, 선물, 비교 행동으로 풀 수 있는가 |
| 비즈니스 해석 가능성   |  15 | 포지셔닝, 유통, 수익모델, 전략, 투자 관점으로 확장 가능한가      |
| Dahyeong-fit  |  15 | 사용자의 기존 글 스타일과 자연스럽게 연결되는가               |
| 새로움 / 비중복성    |  10 | 최근 글과 너무 겹치지 않는가                         |
| 출처 신뢰도        |   5 | 출처가 공식 사이트, 기사, 신뢰 가능한 데이터인가             |
| 총점            | 100 |                                          |

### 5.2 점수 기준

|     점수 | 의미                 |
| -----: | ------------------ |
| 90~100 | 바로 장문 관찰기 가능       |
|  80~89 | 좋은 후보, 우선 검토       |
|  70~79 | 짧은 포스트 또는 보류       |
|  60~69 | 저장만                |
|  60 미만 | Notion 저장하지 않거나 폐기 |

### 5.3 필터링 규칙

아래에 해당하면 점수를 크게 낮춘다.

* 너무 거시경제적이다.
* 회사명, 브랜드명, 제품명 등 구체 대상이 없다.
* 단순 투자유치 뉴스일 뿐 시장 질문이 없다.
* 단순 홍보자료 느낌이 강하다.
* 사용자가 쓴 최근 글과 너무 유사하다.
* 학생 관찰자 톤으로 쓰기 어렵다.
* 너무 전문적인 산업 분석이 필요하다.
* 출처가 불명확하다.

---

## 6. “왜 굳이?” 질문 생성 규칙

### 6.1 좋은 질문 예시

```txt
Olive Young이 이미 강한데 왜 굳이 Olive Better라는 별도 웰니스 매장을 만들었을까?

온라인으로 충분히 팔 수 있는 브랜드가 왜 굳이 오프라인 팝업을 열었을까?

금융 앱이 왜 굳이 생활 플랫폼처럼 변하려고 할까?

이미 경쟁이 심한 시장인데 왜 이 스타트업은 지금 투자를 받았을까?

기능성 제품인데 왜 굳이 감도 있는 선물처럼 포장할까?
```

### 6.2 나쁜 질문 예시

```txt
이 회사는 왜 성장했을까?
이 브랜드는 왜 유명할까?
이 시장은 어떻게 변하고 있을까?
이 스타트업은 무엇을 하나?
```

나쁜 질문은 너무 일반적이다. 반드시 구체 대상과 이상한 전략 선택이 들어가야 한다.

### 6.3 질문 생성 프롬프트

```txt
다음 raw item을 LinkedIn 비즈니스 관찰기 소재로 바꿔라.

목표:
단순 뉴스 요약이 아니라 “왜 굳이?”라는 질문을 생성한다.

좋은 질문은:
- 구체적인 브랜드/매장/앱/스타트업에서 출발한다.
- 전략적 선택의 이상함을 드러낸다.
- 소비자 행동이나 비즈니스 모델로 해석 가능해야 한다.
- 학생 분석가가 자연스럽게 쓸 수 있어야 한다.

출력:
- coreWhyGudiQuestion
- businessObservationAngle
- consumerBehaviorAngle
- oneLineSummary
```

---

## 7. Notion DB 설계

### 7.1 DB 이름

`LinkedIn Signal Scout`

### 7.2 필드

| 필드명         | 타입           | 설명                                                            |
| ----------- | ------------ | ------------------------------------------------------------- |
| 소재명         | Title        | 후보의 대표 제목                                                     |
| 발견 날짜       | Date         | 후보를 발견한 날짜                                                    |
| 상태          | Select       | New / Shortlisted / Selected / Written / Published / Rejected |
| 피드백 라벨      | Multi-select | 사용자가 남긴 피드백                                                   |
| 점수          | Number       | 총점                                                            |
| 카테고리        | Select       | 리테일/브랜드, 스타트업/투자 등                                            |
| 한 줄 요약      | Text         | 빠르게 훑기 위한 요약                                                  |
| 핵심 왜 굳이 질문  | Text         | 글의 출발 질문                                                      |
| 비즈니스 관찰기 각도 | Text         | 전략, 유통, 포지셔닝 관점                                               |
| 소비자 행동 관점   | Text         | 구매, 신뢰, 선물, 비교 등                                              |
| 기존 글과의 연결   | Text         | Olive Better 글 등과 어떻게 이어지는지                                   |
| 겹침 위험       | Select       | 낮음 / 중간 / 높음                                                  |
| 추천 포맷       | Select       | 장문 관찰기 / 짧은 포스트 / 캐러셀 / 비교글 / 저장만                             |
| 직접 방문 가능 여부 | Select       | 가능 / 불가능 / 확인 필요 / 중요하지 않음                                    |
| 출처 URL      | URL          | 원문 링크                                                         |
| 출처명         | Text         | 매체명 또는 사이트명                                                   |
| 다음 액션       | Select       | 채택 검토 / 추가 조사 / 보류 / 폐기 / 글쓰기 에이전트로 전달                        |

### 7.3 상태값 정의

| 상태          | 의미                    |
| ----------- | --------------------- |
| New         | 새로 들어온 후보             |
| Shortlisted | 흥미롭지만 아직 글감으로 확정하지 않음 |
| Selected    | 글로 쓸 후보로 채택           |
| Written     | 초안 작성 완료              |
| Published   | LinkedIn 게시 완료        |
| Rejected    | 폐기                    |

---

## 8. Daily Scout Output 템플릿

### 8.1 출력 원칙

* 하루 최종 후보 20개
* 한국어
* 깊은 리포트 금지
* 한 후보당 6~10줄 이내
* 점수 높은 순서
* 중복 주제는 최대 2개까지만
* 리테일/브랜드 후보가 너무 많으면 스타트업/앱 후보를 섞는다

### 8.2 Markdown 출력 예시

```md
# Daily LinkedIn Signal Scout
날짜: 2026-07-01
총 후보: 20개

---

## 1. [91점] Olive Better / 리테일·웰니스

**한 줄 요약**  
CJ올리브영이 웰니스 전용 오프라인 매장을 별도로 실험하고 있다.

**왜 굳이?**  
Olive Young이 이미 강한데 왜 굳이 Olive Better라는 별도 웰니스 매장을 만들었을까?

**비즈니스 관찰기 각도**  
웰니스 제품은 화장품처럼 즉시 테스트하기 어렵기 때문에, 오프라인 공간은 판매 채널보다 신뢰와 발견을 설계하는 장치일 수 있다.

**기존 글과의 연결**  
Olive Better 모범글과 직접 연결됨. 후속 글로 쓰려면 다른 웰니스/선물/리테일 사례와 비교해야 함.

**겹침 위험**  
높음

**추천 포맷**  
비교글 / 후속 관찰기

**직접 방문 가능 여부**  
가능

**출처**  
source_url

**다음 액션**  
보류 또는 후속 비교글
```

---

## 9. 피드백 루프 설계

### 9.1 1차 MVP 학습 신호

1차 MVP에서는 LinkedIn 성과 데이터를 사용하지 않는다. 오직 사용자의 선택만 사용한다.

사용자는 Notion에서 각 후보를 다음 중 하나로 표시한다.

* Selected
* Shortlisted
* Rejected

그리고 필요한 경우 피드백 라벨을 붙인다.

### 9.2 피드백 반영 규칙

| 사용자 행동      | 다음 추천 반영                            |
| ----------- | ----------------------------------- |
| Selected    | 비슷한 카테고리, source type, angle 가중치 상승 |
| Shortlisted | 약한 상승. 단, 반복 보류만 되면 중립              |
| Rejected    | 비슷한 패턴 가중치 하락                       |
| 너무 뉴스 같음    | 보도자료성 source, 단순 투자유치 기사 점수 하락      |
| 너무 어려움      | 전문 산업/기술 의존도가 높은 후보 점수 하락           |
| 내 톤 아님      | 거시경제/전문가형 해설 후보 점수 하락               |
| 너무 겹침       | 최근 30일 주제와 유사한 후보 페널티 강화            |
| 바로 글 가능     | 해당 유형 가중치 상승                        |
| 직접 방문하면 좋음  | 오프라인/리테일 후보 가중치 소폭 상승               |

### 9.3 Feedback Memory 파일

1차 MVP에서는 Notion 읽기 전까지 local JSON으로 관리할 수 있다.

```json
{
  "categoryWeights": {
    "리테일/브랜드": 1.15,
    "스타트업/투자": 1.0,
    "앱/프로덕트": 0.95
  },
  "rejectedPatterns": [
    "단순 투자유치",
    "거시경제 전망",
    "출처 불명확"
  ],
  "preferredAngles": [
    "오프라인 존재 이유",
    "소비자 신뢰",
    "선물 소비",
    "브랜드 포지셔닝"
  ],
  "recentTopics": [
    "Olive Better",
    "웰니스 리테일",
    "전과 이야기"
  ]
}
```

---

## 10. 단계별 개발 로드맵

## Phase 1 — 로컬 JSON 기반 스카우팅 엔진

### 목표

Notion 없이, local JSON에서 raw 후보를 읽고, 상위 20개를 한국어 Markdown으로 출력한다.

### 구현 파일

```txt
src/research-agent/
  types.ts
  config.ts
  scout.ts
  dedupe.ts
  classify.ts
  score.ts
  why-question.ts
  daily-output.ts
  index.ts

data/research-agent/
  raw_candidates.sample.json
  feedback.sample.json
```

### 세부 작업

1. `RawSourceItem`, `ScoutCandidate`, `ScoreBreakdown` 타입 정의
2. `raw_candidates.sample.json` 작성
3. 후보 정규화 함수 구현
4. 중복 제거 함수 구현
5. 카테고리 분류 함수 구현
6. “왜 굳이?” 질문 생성 함수 구현
7. Dahyeong-fit 점수화 함수 구현
8. 상위 20개 선택 함수 구현
9. Markdown 출력 함수 구현
10. CLI 명령어 추가

### CLI 예시

```bash
npm run scout:local
```

### 성공 기준

* local JSON 후보 50개 이상 입력 가능
* 중복 제거 작동
* 점수 순 정렬 작동
* top 20 Markdown 출력
* 모든 출력 한국어
* LinkedIn API 사용 없음
* Notion API 사용 없음

---

## Phase 2 — Notion DB 연동

### 목표

상위 20개 후보를 Notion DB에 저장한다.

### 구현 파일

```txt
src/research-agent/notion.ts
docs/notion-db-schema.md
```

### 환경변수

```env
NOTION_API_KEY=
NOTION_DATABASE_ID=
```

### 세부 작업

1. Notion client 추가
2. 환경변수 검증
3. `createCandidatePage(candidate)` 구현
4. dry-run 모드 구현
5. Notion property mapping 구현
6. 에러 핸들링 추가
7. 저장 성공/실패 로그 출력

### CLI 예시

```bash
npm run scout:notion
npm run scout:notion -- --dry-run
```

### 성공 기준

* Notion DB에 후보 20개 생성
* long text는 rich_text 또는 page body로 저장
* URL, select, multi-select 타입 정상 매핑
* dry-run에서 payload 확인 가능
* Notion 실패 시 전체 프로세스가 죽지 않고 에러 로그 출력

---

## Phase 3 — 피드백 루프 v1

### 목표

사용자가 Notion에서 선택한 상태와 피드백 라벨을 읽어와 다음 추천 점수에 반영한다.

### 구현 파일

```txt
src/research-agent/feedback.ts
src/research-agent/score.ts
data/research-agent/feedback.sample.json
```

### 세부 작업

1. Notion에서 최근 후보 30~90일치 읽기
2. status와 feedback label 추출
3. selected / shortlisted / rejected 패턴 집계
4. 카테고리 가중치 업데이트
5. source type 가중치 업데이트
6. rejected pattern 저장
7. recent topic overlap 페널티 적용
8. feedback memory JSON 저장

### 성공 기준

* Selected가 많은 카테고리 점수 상승
* Rejected가 많은 패턴 점수 하락
* “너무 뉴스 같음” 라벨이 많은 source type 점수 하락
* 최근 글과 겹치는 후보 overlap risk 상승
* local feedback JSON만으로도 작동 가능

---

## Phase 4 — 공개 소스 수집기

### 목표

local JSON이 아니라 실제 공개 소스에서 raw 후보를 수집한다.

### 소스 우선순위

1. RSS 지원 스타트업/투자 뉴스
2. 브랜드/리테일 뉴스
3. 대기업 공식 보도자료
4. 앱 업데이트 또는 제품 블로그
5. 팝업스토어/오프라인 공간 정보
6. 글로벌 비교 사례

### 구현 파일

```txt
src/research-agent/sources.ts
src/research-agent/source-connectors/
  rss.ts
  google-news.ts
  naver-news.ts
  official-press.ts
  manual.ts
```

### 세부 작업

1. source config 정의
2. RSS connector 구현
3. keyword query 기반 connector 구현
4. source별 reliability score 부여
5. raw 후보 저장
6. 중복 URL 제거
7. 수집 실패 시 source별 에러 로깅

### 성공 기준

* 하루 raw 후보 50~150개 수집
* 최종 후보 20개 출력
* source별 실패가 전체 실행을 막지 않음
* LinkedIn 스크래핑 없음
* robots/약관 위험이 큰 소스 제외

---

## Phase 5 — Writing Agent 연결

### 목표

Notion에서 `Selected` 상태인 후보를 기존 글쓰기 에이전트로 넘길 수 있는 structured brief로 변환한다.

### 구현 파일

```txt
src/research-agent/export-to-writing.ts
templates/writing-brief.md
```

### Writing Brief 구조

```ts
export type WritingBrief = {
  topicName: string;
  coreWhyGudiQuestion: string;
  oneLineSummary: string;
  businessObservationAngle: string;
  consumerBehaviorAngle: string;
  possibleStructure: string[];
  counterArguments: string[];
  sourceUrls: string[];
  recommendedFormat: string;
  styleReference: "olive-better";
};
```

### 성공 기준

* Selected 후보만 가져오기
* 글쓰기 에이전트 입력용 Markdown 생성
* 출처 URL 포함
* 기존 Olive Better 스타일 구조 반영
* 자동 게시 없음

---

## Phase 6 — 이후 확장

### 6.1 LinkedIn 성과 분석

후속 버전에서만 진행한다.

수집 후보 지표:

* impressions
* members reached
* reactions
* comments
* reposts
* saves
* sends
* profile views from content
* followers gained from content

성과 분석은 1차 MVP에 넣지 않는다.

### 6.2 자동 게시

공식 API 검토 후 진행한다.

원칙:

* 본인 계정 게시만
* 초안 생성 후 인간 승인 필수
* 자동 댓글 / 자동 좋아요 / 자동 DM 금지
* LinkedIn 스크래핑 금지

### 6.3 스타일 평가기

후속 버전에서 다음 지표를 추가한다.

* 구조 점수
* 훅 점수
* 사실성 점수
* originality 점수
* Olive Better-style fit 점수
* 너무 전문가인 척하는 문장 감점

---

## 11. 테스트 계획

### 11.1 Unit Tests

| 테스트                    | 설명                     |
| ---------------------- | ---------------------- |
| `dedupe.test.ts`       | 같은 URL, 유사 제목 제거       |
| `score.test.ts`        | 점수 계산 정상 작동            |
| `classify.test.ts`     | 카테고리 분류 정상 작동          |
| `daily-output.test.ts` | top 20 Markdown 출력     |
| `feedback.test.ts`     | 피드백 라벨에 따른 가중치 조정      |
| `notion.test.ts`       | Notion payload mapping |

### 11.2 샘플 테스트 데이터

`raw_candidates.sample.json`에는 최소 30개 후보를 넣는다.

카테고리 분포:

* 리테일/브랜드 8개
* 팝업/오프라인 5개
* 스타트업/투자 7개
* 앱/프로덕트 5개
* 대기업 신사업 3개
* 소비자 트렌드 2개

### 11.3 Acceptance Criteria

Phase 1 완료 기준:

* `npm run scout:local` 실행 가능
* Markdown으로 20개 후보 출력
* 모든 후보에 `왜 굳이?` 질문 있음
* 점수 0~100 정상 출력
* 중복 제거 작동
* 테스트 통과

Phase 2 완료 기준:

* Notion DB에 20개 저장
* dry-run 가능
* 환경변수 누락 시 명확한 에러
* 기존 글쓰기 에이전트 영향 없음

Phase 3 완료 기준:

* Notion 또는 local feedback 기반으로 추천 점수 변화
* Rejected 패턴이 다음 실행에서 감점
* Selected 패턴이 다음 실행에서 가점

---

## 12. Codex 작업 순서

### Codex Task 1 — 프로젝트 구조 생성

```txt
기존 LinkedIn repo 안에서 작업해줘.

새 repo를 만들지 말고, 기존 writing skill을 건드리지 말고,
Research & Content Manager Agent를 별도 모듈로 추가해줘.

생성할 폴더:
- src/research-agent
- data/research-agent
- docs/research-agent-spec.md
- agents/research-scout-agent.md
- templates/daily-scout-output.md

아직 Notion, LinkedIn API, live scraping은 붙이지 마.
```

### Codex Task 2 — 타입과 샘플 데이터

```txt
Research Agent의 TypeScript 타입을 정의해줘.

필요 타입:
- RawSourceItem
- ScoutCandidate
- ScoreBreakdown
- FeedbackLabel

그리고 data/research-agent/raw_candidates.sample.json에 샘플 후보 30개를 만들어줘.
모든 샘플은 한국어 LinkedIn 비즈니스 관찰기 후보여야 해.
```

### Codex Task 3 — 로컬 스카우팅 엔진

```txt
local JSON을 읽어서 후보를 정규화하고, 중복 제거하고, 카테고리 분류하고, 점수화해서 top 20을 Markdown으로 출력하는 CLI를 만들어줘.

명령어:
npm run scout:local

아직 LLM API는 붙이지 말고, 규칙 기반으로 먼저 구현해줘.
```

### Codex Task 4 — LLM 기반 후보 가공

```txt
각 raw candidate를 LLM으로 가공해서 다음 필드를 생성하게 해줘.

- oneLineSummary
- coreWhyGudiQuestion
- businessObservationAngle
- consumerBehaviorAngle
- connectionToExistingPosts
- recommendedFormat
- nextAction

Structured JSON output을 사용하고, 실패하면 fallback rule-based output을 사용해줘.
```

### Codex Task 5 — Notion 연동

```txt
Notion DB 연동을 추가해줘.

환경변수:
NOTION_API_KEY
NOTION_DATABASE_ID

기능:
- createCandidatePage(candidate)
- dry-run mode
- payload validation
- error handling

기존 scout:local은 유지하고,
새 명령어 scout:notion을 추가해줘.
```

### Codex Task 6 — 피드백 루프

```txt
Notion 또는 local feedback JSON에서 사용자의 status와 feedback label을 읽고,
다음 추천 점수에 반영하는 feedback loop를 구현해줘.

Selected는 유사 패턴 가점.
Rejected는 유사 패턴 감점.
Shortlisted는 약한 가점.
피드백 라벨별 가중치 조정도 추가해줘.
```

### Codex Task 7 — Writing Agent 연결

```txt
Notion에서 Selected 상태인 후보를 기존 writing agent에 넘길 수 있는 writing brief Markdown으로 export하는 기능을 만들어줘.

명령어:
npm run export:selected

출력:
data/research-agent/writing-briefs/YYYY-MM-DD-topic.md
```

---

## 13. 운영 루틴

### 매일

```txt
1. scout 실행
2. Notion에 후보 20개 저장
3. 사용자가 5분 동안 훑음
4. Selected / Shortlisted / Rejected 표시
5. 피드백 라벨 입력
```

### 주 2~3회

```txt
1. Selected 후보를 writing brief로 export
2. 기존 글쓰기 에이전트로 초안 생성
3. 사람이 검토
4. LinkedIn에 수동 게시
```

### 주 1회

```txt
1. Rejected 라벨 검토
2. 너무 자주 나오는 노이즈 source 제거
3. 자주 채택되는 카테고리 확인
4. source keyword 업데이트
```

---

## 14. 핵심 원칙

1. 이 에이전트는 글을 쓰는 에이전트가 아니다.
2. 이 에이전트는 좋은 글감을 찾는 에이전트다.
3. 좋은 글감은 단순 뉴스가 아니다.
4. 좋은 글감은 “왜 굳이?” 질문을 만든다.
5. 구체적인 브랜드, 매장, 앱, 스타트업, 제품에서 출발해야 한다.
6. 사용자는 전문가인 척하는 사람이 아니라 학생 분석가다.
7. LinkedIn 스크래핑은 하지 않는다.
8. 자동 engagement는 하지 않는다.
9. 1차 MVP는 성과 분석 없이 선택 데이터만 학습한다.
10. 최종 게시 전에는 항상 사람이 판단한다.

---

## 15. 최종 MVP 정의

MVP가 성공했다는 의미는 다음과 같다.

```txt
매일 아침 명령어 하나로
한국어 LinkedIn 비즈니스 관찰기 후보 20개가 Notion에 쌓이고,
사용자는 그중 Selected / Shortlisted / Rejected만 고르면 되며,
다음 실행에서는 그 선택이 추천 점수에 반영된다.
```

이 상태가 되면, 기존 글쓰기 AI는 더 이상 빈손으로 글을 쓰는 게 아니라, Research Agent가 골라준 좋은 소재를 바탕으로 글을 쓰게 된다.

최종적으로 이 프로젝트는 다음 구조가 된다.

```txt
Research Agent
무엇을 쓸지 찾는다.

Writing Agent
어떻게 쓸지 만든다.

Human
무엇을 채택하고 무엇을 게시할지 판단한다.
```

이 명세서 기준으로 개발 순서는 딱 이렇게 가면 돼.

**1일차:** 폴더 구조 + 타입 + 샘플 JSON
**2일차:** local JSON → top 20 Markdown
**3일차:** 점수화 / 중복 제거 / 테스트
**4~5일차:** LLM으로 “왜 굳이?” 질문 생성
**2주차:** Notion 연동
**3~4주차:** 피드백 루프
**그 이후:** 글쓰기 에이전트 연결, 성과 분석 API 검토

처음 Codex에 넣을 건 `Task 1`부터야. `Notion`이랑 `LLM`을 첫 프롬프트에 같이 넣지 말고, 먼저 local 엔진부터 만들게 하는 게 안전해.
