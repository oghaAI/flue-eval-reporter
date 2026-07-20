# @oghaai/flue-eval-reporter

Eval Studio reporter for Flue apps. One call in your app's entrypoint wires two things:

- **observer** — the reporter is a Flue **observer**, co-located inside your app. It buffers the live rich events (`turn_request`/`turn`/`tool`/`task`/`log`/`compaction`/`submission_settled`) via `observe()`, and on each settle reads your app's **local** durable `history()` for the conversation backbone, applies a source-owned content policy, and **pushes** `{ backbone, events }` to Eval Studio's `/api/ingest-push`. Studio only receives and dedupes — it never dials back into your app. Since **v0.3.0** this replaces the old pull (Studio calling your `history()`); the backbone stays locally re-readable, so a dropped push loses nothing.
- **stamper** — at boot, each listed agent's resolved config (instructions, skills/tools/actions, model) is content-hashed and registered at `/api/subject-versions`, so runs are attributed to an exact agent version. Identical content re-registers idempotently; a config change mints a new version. Since **v0.1.3** the stamp also carries the full instructions text and skill/tool/action names (prompt provenance). Since **v0.2.0** it additionally carries the agent's full **bill of materials** — every tool/action with its real input/output JSON Schema, subagents, and settings (thinking level, compaction, durability) — so Eval Studio renders a read-only spec sheet of what each version is made of. Backwards-compatible: older Studio servers ignore the extra fields, and a Studio that predates a version's provenance backfills it on the next boot. Since **v0.4.0** the stamp is **code-addressable**: the reporter resolves the running commit SHA (`GIT_SHA` env, else a `.git` read at boot) and the repo's browse URL (`EVAL_STUDIO_REPO_URL`, else derived from `git remote origin`), so Eval Studio's spec sheet deep-links "View source @ sha" to the exact tree that produced the version.

Tool/action parameter schemas are converted from valibot to JSON Schema via `@valibot/to-json-schema` (a dependency). It's loaded lazily and per-tool best-effort: an app without `valibot`, or a schema that can't convert, simply degrades that tool to name + description — the stamp never fails. Skills are captured as name + description only (Flue beta.9 doesn't expose the packaged skill body).

**At-least-once by design:** your Flue app's store is the system of record. Pushes buffer and retry; the backbone dedupes on `(conversationId, submissionId)` and the events on `(runKey, submissionId, eventIndex)`, so a retry or re-push collapses to no duplicate rows. A dropped push is recoverable — the backbone is locally re-readable, so the next settle re-pushes it. **When `EVAL_STUDIO_URL` is unset the reporter is completely inert** — safe to leave in production code paths.

**Content policy** (the source decides what leaves the building): image bytes are always replaced with the `IMAGE_DATA_OMITTED` sentinel; `contentMode: "off"` shares only structure + usage (no message/event text); an optional `redact` hook runs last on every event; `eventSampleRate` thins high-volume `tool`/`task`/`log` events (cost, the composed request, and outcomes are never sampled out).

## Install

```sh
bun add github:oghaAI/flue-eval-reporter#v0.4.0
# or: npm install github:oghaAI/flue-eval-reporter#v0.4.0
```

`@flue/runtime >= 1.0.0-beta.9` is a peer dependency — your Flue app already has it. That's the only peer: the reporter reads the local backbone over a plain `fetch` to your app's own history view, so there's nothing else to install. This dist repo is public (built output only); the Eval Studio source stays private. Always pin a `#vX.Y.Z` tag.

## Usage

```ts
import { initEvalStudioReporter } from "@oghaai/flue-eval-reporter"

import myAgent from "./agents/my-agent.ts"

initEvalStudioReporter({
  agents: { "my-agent": myAgent }, // agents to version-stamp at boot (optional)
  project: "acme-support",         // Eval Studio project; unknown names auto-create
})
```

Call it once in the app entrypoint, before the app starts serving. Agents passed for stamping must have probe-safe `initialize()` — pure config closures only; if yours opens connections at initialize, don't list it (its runs are still ingested, just unversioned).

## Configuration

Every option falls back to an environment variable — a bare `initEvalStudioReporter()` is fully env-driven.

| Option | Env var | Meaning |
| --- | --- | --- |
| `url` | `EVAL_STUDIO_URL` | Eval Studio base URL. **Absent → reporter is inert.** |
| `secret` | `EVAL_STUDIO_SECRET` | Shared secret, sent as `x-eval-studio-secret`. Required when the server has one set. |
| `project` | `EVAL_STUDIO_PROJECT` | Project to report into. Absent → the server's default project. |
| `selfUrl` | `FLUE_SELF_URL` | THIS app's own base URL — where the reporter reads its **local** `history()` for the backbone, and what Studio records as the app's location. Default: the Flue dev URL `http://127.0.0.1:3583`. |
| `contentMode` | `EVAL_STUDIO_CONTENT_MODE` | `"full"` (default) shares text; `"off"` keeps only structure + usage. Images are scrubbed to the sentinel regardless. |
| `redact` | — | Last-mile `(event) => event` hook, run just before each event is pushed. |
| `eventSampleRate` | — | `0..1`, fraction of `tool`/`task`/`log` events KEPT (default 1). Load-bearing events are never sampled out. |
| `environment` | `EVAL_STUDIO_ENV` | Environment tag (`'prod'`, `'staging'`, `'dev'`, … free text). Unset → Studio treats the traffic as prod. Declare it on pre-prod apps to keep them out of monitoring; version stamps are deliberately env-less. |
| `gitRef` | `GIT_SHA` | Commit SHA the app runs from — recorded on each activation and pinned on the version it mints. Fallback when both are unset: a `.git` read at boot. |
| `repoUrl` | `EVAL_STUDIO_REPO_URL` | Where the source can be browsed; composed with the SHA into the spec sheet's "View source" link. Fallback: derived from the checkout's `git remote origin` (ssh forms normalize to https). |

**TLS note:** if your Eval Studio runs behind a locally-trusted certificate (portless, self-signed), Node/Bun must trust its CA: set `NODE_EXTRA_CA_CERTS=/path/to/ca.pem` in the Flue app's environment.

## Compatibility

Reporter releases track Eval Studio's ingest contract (`POST /api/ingest-push`, `POST /api/subject-versions`). `v0.1.x` speaks the contract as of eval-studio `main` 2026-07-12; `v0.1.3` adds optional prompt-provenance fields (`instructions`, `skillNames`); `v0.2.0` adds the optional `bom` field (agent bill of materials); `v0.3.0` **inverts ingestion to push** — the reporter sends `{ backbone, events }` to `/api/ingest-push` instead of notifying `/api/ingest` for Studio to pull. `v0.3.0` needs an eval-studio that serves `/api/ingest-push` (the old `/api/ingest` pull endpoint remains for manual re-ingest). `v0.4.0` adds the `environment` tag on pushes and commit-SHA + repo-URL capture on stamps (needs an eval-studio with `subject_versions.git_commit_sha` / `agents.repo_url`; older servers ignore the extra fields). Field additions stay backwards-compatible; the push cutover is the one deliberate contract bump — pin a tag and bump both sides together.

## Releasing (maintainers)

From the monorepo: `packages/flue-eval-reporter/scripts/release.sh <version>` — builds (`tsup`: ESM + types, stamping + ingest-contract slices inlined, `@flue/runtime` external) and pushes `package.json + dist/ + README` to `oghaAI/flue-eval-reporter`, tagged `v<version>`. Source of truth stays in the `eval-studio` monorepo; the dist repo is generated output only — never edit it directly.
