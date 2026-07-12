# @oghaai/flue-eval-reporter

Eval Studio reporter for Flue apps. One call in your app's entrypoint wires two things:

- **observer** — every settled agent submission notifies Eval Studio's `/api/ingest`; Eval Studio pulls the canonical conversation from your app's own Flue API and records it as a live run.
- **stamper** — at boot, each listed agent's resolved config (instructions, skills/tools/actions, model) is content-hashed and registered at `/api/subject-versions`, so runs are attributed to an exact agent version. Identical content re-registers idempotently; a config change mints a new version.

No delivery guarantees by design: your Flue app's store is the system of record. A missed notification leaves a run re-ingestable; duplicates are absorbed by Eval Studio's `(conversationId, submissionId)` idempotency key. **When `EVAL_STUDIO_URL` is unset the reporter is completely inert** — safe to leave in production code paths.

## Install

```sh
bun add github:oghaAI/flue-eval-reporter#v0.1.0
# or: npm install github:oghaAI/flue-eval-reporter#v0.1.0
```

`@flue/runtime >= 1.0.0-beta.9` is a peer dependency — your Flue app already has it. The repo is private: installs need GitHub access (a read-only deploy key or a `GH_TOKEN` with repo read, e.g. `https://x-access-token:$GH_TOKEN@github.com/…` in CI).

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
| `selfUrl` | `FLUE_SELF_URL` | THIS app's own base URL, so Eval Studio knows where to pull `history()` from. Required when Eval Studio serves more than one Flue app. |
| `gitRef` | `GIT_SHA` | Deploy ref recorded on version activations. |

**TLS note:** if your Eval Studio runs behind a locally-trusted certificate (portless, self-signed), Node/Bun must trust its CA: set `NODE_EXTRA_CA_CERTS=/path/to/ca.pem` in the Flue app's environment.

## Compatibility

Reporter releases track Eval Studio's ingest contract (`POST /api/ingest`, `POST /api/subject-versions`). `v0.1.x` speaks the contract as of eval-studio `main` 2026-07-12. When the contract changes, a new reporter tag is cut — pin a tag and bump deliberately.

## Releasing (maintainers)

From the monorepo: `packages/flue-eval-reporter/scripts/release.sh <version>` — builds (`tsup`: ESM + types, stamping slice inlined, `@flue/runtime` external) and pushes `package.json + dist/ + README` to `oghaAI/flue-eval-reporter`, tagged `v<version>`. Source of truth stays in the `eval-studio` monorepo; the dist repo is generated output only — never edit it directly.
