# LinkedIn Research Agent MVP

LinkedIn Research Agent is a local-first scout for Korean LinkedIn business-observation ideas. It finds candidate topics, turns them into short "왜 굳이?" briefs, ranks them, optionally saves them to Notion, learns from human feedback, and exports selected candidates into writing briefs.

This agent decides what might be worth writing about. The existing writing agent still decides how to draft the post.

## MVP Scope

- Read local JSON candidate data.
- Normalize, deduplicate, classify, score, and rank candidates.
- Render a Korean daily scout Markdown report.
- Optionally enrich candidate briefs with an LLM.
- Save Notion page payloads, with dry-run support.
- Apply local or synced feedback to future scoring.
- Export `Selected` candidates into writing-agent Markdown briefs.

## Out Of Scope

This MVP does not do LinkedIn scraping, auto engagement, auto posting, automatic likes, automatic comments, automatic DMs, or LinkedIn feed crawling.

## Install

```powershell
npm install
```

PowerShell may block `npm.ps1` on some Windows machines. Use `npm.cmd` if that happens:

```powershell
npm.cmd install
```

## Commands

```powershell
npm run scout:local
npm run scout:local -- --limit 5
npm run scout:local:llm
npm run scout:notion -- --dry-run
npm run scout:feedback
npm run export:selected
npm run feedback:notion
npm run typecheck
npm test
```

Use `npm.cmd run ...` on Windows if PowerShell execution policy blocks `npm`.

## Environment Variables

Copy `.env.example` to `.env` for local use.

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
NOTION_API_KEY=
NOTION_DATABASE_ID=
NOTION_DATA_SOURCE_ID=
NOTION_VERSION=2022-06-28
SCOUT_USE_LLM=0
SCOUT_FEEDBACK_PATH=data/research-agent/feedback.sample.json
```

`OPENAI_API_KEY` is only required for LLM enrichment. `NOTION_API_KEY` and `NOTION_DATABASE_ID` or `NOTION_DATA_SOURCE_ID` are only required for live Notion writes or feedback sync.

## Local Scout

Run the rule-based local scout:

```powershell
npm run scout:local
```

Limit output:

```powershell
npm run scout:local -- --limit 5
```

Change input:

```powershell
npm run scout:local -- --input data/research-agent/raw_candidates.sample.json
```

## LLM Enrichment

Run with OpenAI enrichment:

```powershell
npm run scout:local:llm
```

If `OPENAI_API_KEY` is missing or the API call fails, the scout falls back to the rule-based brief.

## Notion Dry Run

Inspect Notion page payloads without writing:

```powershell
npm run scout:notion -- --dry-run
```

Live writes require Notion environment variables and a Notion database whose properties match `docs/notion-db-schema.md`.

## Feedback Loop

Use sample local feedback:

```powershell
npm run scout:feedback
```

Use a synced feedback file:

```powershell
npm run scout:local -- --feedback data/research-agent/feedback.notion.json
```

Sync feedback from Notion:

```powershell
npm run feedback:notion
```

## Writing Brief Export

Export `Selected` candidates to writing-agent Markdown briefs:

```powershell
npm run export:selected
```

Generated briefs are written to:

```text
data/research-agent/writing-briefs/
```

## Development Roadmap

- Stabilize local MVP execution, docs, and tests.
- Connect real Notion credentials and validate live writes.
- Replace sample URLs with real public sources.
- Add public source collectors, starting with safe RSS or official sources.
- Keep human approval before any final LinkedIn post.
