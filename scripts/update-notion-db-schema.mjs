import fs from "node:fs";

const envPath = new URL("../.env", import.meta.url);
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return index === -1 ? [line, ""] : [line.slice(0, index), line.slice(index + 1)];
    })
);

const token = env.NOTION_API_KEY;
const databaseId = env.NOTION_DATABASE_ID;

if (!token) {
  throw new Error("NOTION_API_KEY is missing from .env");
}

if (!databaseId) {
  throw new Error("NOTION_DATABASE_ID is missing from .env");
}

const options = (names) => names.map((name) => ({ name }));
const properties = {
  "Candidate ID": { rich_text: {} },
  "상태": { select: { options: options(["New", "Shortlisted", "Selected", "Written", "Published", "Rejected"]) } },
  "피드백 라벨": {
    multi_select: {
      options: options([
        "바로 글 가능",
        "좋음 / 추가조사 필요",
        "직접 방문하면 좋음",
        "너무 뉴스 같음",
        "너무 어려움",
        "내 톤 아님",
        "너무 겹침",
        "구체성이 약함",
        "왜 굳이 약함",
        "소비자 행동 관점 약함",
        "비즈니스 각도 약함"
      ])
    }
  },
  "카테고리": {
    select: {
      options: options([
        "리테일/브랜드",
        "팝업/오프라인",
        "스타트업/투자",
        "대기업 신사업",
        "앱/프로덕트",
        "소비자 트렌드",
        "테크/금융",
        "글로벌 비교",
        "커리어/네트워크"
      ])
    }
  },
  "겹침 위험": { select: { options: options(["낮음", "중간", "높음"]) } },
  "추천 포맷": { select: { options: options(["장문 관찰기", "짧은 포스트", "캐러셀", "비교글", "메모만"]) } },
  "직접 방문 가능 여부": { select: { options: options(["가능", "불가능", "확인 필요", "중요하지 않음"]) } },
  "다음 액션": {
    select: { options: options(["채택 검토", "추가 조사", "직접 방문", "보류", "폐기", "글쓰기 에이전트로 전달"]) }
  }
};

const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=utf-8",
    "Notion-Version": env.NOTION_VERSION ?? "2022-06-28"
  },
  body: JSON.stringify({ properties })
});

const body = await response.json().catch(async () => ({ message: await response.text() }));

if (!response.ok) {
  console.log(JSON.stringify({ ok: false, status: response.status, code: body.code, message: body.message }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, id: body.id, url: body.url }, null, 2));
}
