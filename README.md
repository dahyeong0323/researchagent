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
npm run scout:url -- "https://news.acme.co.kr/article" --dry-run
npm run scout:local -- --limit 5
npm run scout:local:llm
npm run scout:notion -- --dry-run
npm run scout:feedback
npm run export:selected
npm run feedback:notion
npm run notion:schema:check
npm run notion:schema:update
npm run telegram:poll
npm run telegram:test
npm run daily:dry
npm run daily
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
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_ENABLED=0
MANUAL_URL_FETCH_TIMEOUT_MS=10000
RESEARCH_AGENT_FEEDS_PATH=data/research-agent/feeds.sample.json
RESEARCH_AGENT_MANUAL_INBOX_PATH=data/research-agent/manual-inbox.json
RESEARCH_AGENT_RUNS_DIR=data/research-agent/runs
FETCH_TIMEOUT_MS=12000
DISALLOW_LINKEDIN_URLS=true
```

`OPENAI_API_KEY` is only required for LLM enrichment. `NOTION_API_KEY` and `NOTION_DATABASE_ID` or `NOTION_DATA_SOURCE_ID` are only required for live Notion writes or feedback sync.
Set `TELEGRAM_ENABLED=1` with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to send interactive Top 5 notifications after live Notion writes. Dry runs never send Telegram messages.

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

## Manual URL Collector

Collect a single public article or official page into a `RawSourceItem` and `SourceDocument`:

```powershell
npm run scout:url -- "https://news.acme.co.kr/article" --dry-run
```

The collector only accepts public `http` or `https` URLs. It rejects LinkedIn URLs, empty pages, non-HTML responses, and pages that appear to require login, subscription, or paywall access. It does not use browser automation.

If the page contains extractable entity/evidence, the manual URL flow uses the generated document candidate only. If no entity/evidence can be extracted, it creates one `needs-research` fallback candidate so the URL is not silently dropped.

## RSS Collector

Collect configured RSS feeds in dry-run mode:

```powershell
npm run scout:rss -- --dry-run
```

RSS entries are still available as raw source items, and the enriched path can also fetch each linked public article page, parse it into a `SourceDocument`, and generate verified candidates when the article contains a concrete entity, observed feature, and evidence sentence. If a linked article fetch or parse fails, the error is captured and the RSS item remains a `needs-research` fallback candidate rather than crashing the run.

## Daily Batch

Run the daily batch locally in dry-run mode:

```powershell
npm run daily:dry
```

The daily batch loads RSS feed config, enriches RSS article pages when possible, reads optional manual inbox items, extracts candidates, and applies verification/scoring/dedupe. Dry-run mode does not write Notion payloads, Telegram messages, run artifacts, candidate snapshots, or history files.

Live mode refuses to run against sample fixtures, local fixture feed URLs, `.test` hosts, `example.*` hosts, or placeholder URLs. The default `data/research-agent/feeds.sample.json` is for dry-run/dev only. For live runs, set `RESEARCH_AGENT_FEEDS_PATH` or `RESEARCH_AGENT_MANUAL_INBOX_PATH` to real public sources.

Live mode writes Notion pages and saves run state under:

```text
data/research-agent/runs/{YYYY-MM-DD}.json
data/research-agent/runs/latest-candidates.json
data/research-agent/runs/candidate-history.json
```

Live daily mode is intended for GitHub Actions or a controlled local run:

```powershell
npm run daily
```

Collector errors, including full article fetch failures, are captured in the live run artifact and do not crash the whole run. GitHub Actions runs the side-effect-free dry-run batch by default. Telegram long polling remains local/dev only through `npm run telegram:poll`; production Telegram callbacks should use a separately deployed webhook worker later.

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

Check and repair the live Notion schema before running Telegram-connected writes:

```powershell
npm run notion:schema:check
npm run notion:schema:update
```

The Notion database must include a `Candidate ID` rich text property. The agent writes `ScoutCandidate.id` there so future Telegram callbacks can find and update the same candidate.

The database must also include verification fields: `서비스/브랜드명`, `관찰된 기능/변화`, `검증 상태`, `근거 스니펫`, `근거 유형`, and `검증 메모`. Candidates from sample URLs or without a real service, brand, company, app, or store name are marked `needs-research`.

## Telegram Notifications

After a live Notion write, enable Telegram notifications to receive the saved Top 5 candidates with `Selected`, `Shortlisted`, `Rejected`, and `Needs Research` buttons:

```powershell
npm run scout:notion -- --llm --limit 5
```

Telegram buttons emit compact callback data to stay under Telegram's 64-byte limit. Short candidate IDs are embedded directly; long candidate IDs use an opaque local ref stored in `data/research-agent/telegram-callbacks.json`. Legacy callback data such as `status:selected:<candidateId>` and `brief:create:<candidateId>` is still parsed for compatibility.

The local polling worker processes these into Notion status updates, Writing Brief files, or Research Task files. Telegram summaries show entity/evidence for verified candidates and `missingFields` for unresolved items.

For button-only local testing, send the latest candidate snapshot with an explicit test title. This does not claim a Notion write happened:

```powershell
npm run telegram:test
```

Run the local polling worker to process Telegram button clicks and update Notion candidate statuses:

```powershell
npm run telegram:poll
```

For one polling pass during local testing:

```powershell
npm run telegram:poll -- --once
```

The poller only handles Telegram `callback_query` updates. It updates the Notion status and workflow readiness fields by matching the `Candidate ID` property, and stores its Telegram offset in `data/research-agent/telegram-offset.json` only after successful processing. Brief/task buttons resolve candidates from the latest daily snapshot first, then fall back to the local raw input. A Writing Brief is created only when the candidate is verified and `briefAllowed`; otherwise the export path creates a Research Task instead. It does not trigger posting, LinkedIn activity, or any other automation.

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

Generate deeper Writing Brief v2 strategy notes with an LLM pass:

```powershell
npm run export:selected:llm
```

The LLM pass sharpens the brief before it reaches the writing agent. It focuses on concrete tension, non-obvious insight, business mechanism, consumer psychology, weak theses to avoid, and evidence that still needs checking. If `OPENAI_API_KEY` is missing or the LLM call fails, the exporter falls back to the local rule-based v2 brief.

Only `verified` candidates produce normal Writing Briefs. `needs-research` candidates produce Research Task Markdown instead, so the agent never invents a missing service or brand name.

## Writing Agent Handoff

Research Agent handoff is deliberately narrow:

- verified + `briefAllowed` candidates only
- source-backed evidence required: either an evidence snippet or evidence paragraph IDs
- `humanApprovalRequired: true`
- prohibited claims included from unresolved verification needs
- no LinkedIn posting, likes, comments, DMs, or browser automation

See `docs/writing-agent-handoff.md`.

## What This Agent Does

- Collects public/manual business signals
- Extracts entities and evidence
- Scores and stores candidates
- Sends candidates to Telegram for human review
- Generates Research Tasks or Writing Briefs

## What This Agent Does Not Do

- Does not scrape LinkedIn
- Does not auto-post to LinkedIn
- Does not auto-like/comment/DM
- Does not generate full briefs for unverified candidates

## Recommended Workflow

1. `npm run daily:dry`
2. Review Notion candidates
3. Use Telegram buttons
4. Make research task for incomplete candidate
5. Make writing brief only for verified candidate
6. Hand off brief to writing agent
7. Human writes/approves final post manually

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
