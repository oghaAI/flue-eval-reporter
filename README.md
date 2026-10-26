# @eval-studio/flue

The Eval Studio SDK for Flue 2.3 apps. It works beside
[`@flue/opentelemetry`](https://flueframework.com/docs/ecosystem/tooling/opentelemetry/),
which exports the spans Eval Studio turns into runs, and adds the three things
spans alone cannot carry:

- **Agent version.** `registerAgentVersion()` hashes the agent name, the
  rendered system instructions, the tool manifest and the model into one
  version identity, registers it with Eval Studio, and every `invoke_agent`
  span is stamped with it (`eval.subject_version_id`, `eval.version_hash`).
  Each run in Eval Studio then names the exact version it ran.
- **Cost.** Flue knows what each model call cost (`usage.cost.total` from its
  model catalog). The SDK puts that number on each `chat` span as
  `flue.cost.usd`. Eval Studio uses it before falling back to its own token ×
  price table.
- **Human feedback.** `feedback()` reports what a reviewer did with an agent's
  output: approved, rejected (with a reason code), revised (with how much was
  edited), taken over, handed back. Events are batched and retried.

The SDK never creates spans, a tracer provider or an exporter. Your
OpenTelemetry setup stays as it is.

## Install

```sh
bun add github:oghaAI/flue-eval-reporter#v1.1.0
# or: npm install github:oghaAI/flue-eval-reporter#v1.1.0
```

The package installs as `@eval-studio/flue`. Peer dependencies, which a Flue
app with OpenTelemetry already has: `@flue/runtime` ^2.3, `@opentelemetry/api`
^1.9, `valibot` ^1.1. Its one regular dependency, `@valibot/to-json-schema`
(which turns a tool's valibot input into the JSON Schema the tools hash
covers), installs with it and uses your `valibot`. Everything else, including
the shared hashing and validation code, is bundled into `dist/`. Always pin a
`#vX.Y.Z` tag.

## Setup

You need a project key with the `ingest` scope (Eval Studio → **Settings → API
keys**). The key decides the project; nothing in a payload can change it.

```ts title="src/telemetry.ts"
import { createEvalStudio } from "@eval-studio/flue"
import { createOpenTelemetryInstrumentation } from "@flue/opentelemetry"
import { instrument } from "@flue/runtime"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"
import { NodeSDK } from "@opentelemetry/sdk-node"

import { SUPPORT_INSTRUCTIONS, lookupOrder, refund } from "./agents/support.ts"

new NodeSDK({ traceExporter: new OTLPTraceExporter() }).start()

export const evalStudio = createEvalStudio({
  endpoint: process.env.EVAL_STUDIO_URL, // https://evals.example.com
  projectKey: process.env.EVAL_STUDIO_PROJECT_KEY, // es_ingest_…
  serviceVersion: process.env.GIT_SHA, // recorded beside each version
})
instrument(
  evalStudio.instrumentation({ otel: createOpenTelemetryInstrumentation() })
)

void evalStudio.registerAgentVersion({
  agentName: "support",
  instructions: SUPPORT_INSTRUCTIONS, // what the agent function returns
  tools: [lookupOrder, refund], // the defineTool() values it mounts
  model: "openrouter/deepseek/deepseek-v4-flash", // what it passes to useModel()
})
```

```ts title="src/app.ts"
import "./telemetry.ts" // first, before anything that makes model calls
```

Point the OpenTelemetry exporter at the same Eval Studio with the same key:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=https://evals.example.com
OTEL_EXPORTER_OTLP_HEADERS="authorization=Bearer es_ingest_…"
OTEL_SERVICE_NAME=support-app
```

Things to know:

- **Install one instrumentation.** `evalStudio.instrumentation({ otel })`
  wraps the OpenTelemetry instrumentation; install it **instead of**
  `createOpenTelemetryInstrumentation()`, not beside it. The wrapping puts the
  version stamp inside the agent span and lets the cost bridge set
  `flue.cost.usd` before the chat span ends. Installed on its own (after the
  OpenTelemetry one) it still stamps versions, but cannot bridge cost.
- **Register at boot.** The stamp is computed locally, so spans carry
  `eval.version_hash` from the first request, even before Eval Studio has
  answered. Eval Studio resolves the version by hash in that case.
- **Keep the definition in step with the agent.** The definition is what the
  agent renders. If it drifts, you register a version the agent is not
  running.
- **Inert without configuration.** With no `endpoint` or `projectKey` (and no
  `EVAL_STUDIO_URL` / `EVAL_STUDIO_PROJECT_KEY` in the environment) nothing is
  sent. Versions are still hashed and stamped. It is safe to leave in
  production code paths.
- **Flush on shutdown.** Call `await evalStudio.shutdown()` from your
  shutdown path, next to your OpenTelemetry SDK's `shutdown()`.

`apps/flue-test` in the eval-studio repo is a complete working example
(`src/telemetry.ts`, `src/eval-studio.ts`, `scripts/send-feedback.ts`).

## Version identity

```text
instructions_hash = sha256(instructions), 12 hex
tools_hash        = sha256(tools sorted by name, JSON Schema keys sorted), 12 hex
version_hash      = sha256({ agentName, instructionsHash, model, toolManifestHash }), 12 hex
```

The order you list tools in never changes the hash. A renamed tool, a reworded
description, a changed input schema, a different model or one changed word in
the instructions does. `agentVersion(def)` and `agentVersionHash(def)` compute
it without registering. Eval Studio recomputes `version_hash` from the parts
and refuses a mismatch.

The SDK sends the instruction text with the registration, so Eval Studio's
spec sheet can show it. Eval Studio stores it only when the project's
telemetry content mode is `redacted` or `full` (new projects default to
`none`, which keeps the hash and drops the text), and only when it hashes to
`instructions_hash`. Pass `sendInstructions: false` to keep it in the
process either way; the hashes are still sent.

## Human feedback

```ts
import { editStats, hashActor } from "@eval-studio/flue"

const salt = process.env.FEEDBACK_SALT! // one secret per deployment

// approved as is
evalStudio.feedback({
  type: "approval.approved",
  conversationId: caseId, // your conversation (Runbook: the case id)
  submissionId, // Flue's submission id: links the event to its run
  actorHash: hashActor(reviewer.id, salt),
  decisionLatencyMs: Date.now() - shownAt,
})

// rejected: a reason code is required
evalStudio.feedback({
  type: "approval.rejected",
  conversationId: caseId,
  submissionId,
  reasonCode: "wrong_facts", // wrong_facts | wrong_action | tone | policy | duplicate | other
  notePresent: note.length > 0, // the note itself is never sent
  actorHash: hashActor(reviewer.id, salt),
})

// revised before sending: send the size of the edit, not the text
evalStudio.feedback({
  type: "approval.revised",
  conversationId: caseId,
  submissionId,
  edit: editStats(agentDraft, sentText), // { charsBefore, charsAfter, editDistance, editRatio }
})

// several at once
evalStudio.feedbackBatch([
  { type: "case.takeover", conversationId: caseId, actorHash },
  { type: "case.handback", conversationId: caseId, actorHash },
])
```

Event types: `approval.approved`, `approval.rejected`, `approval.revised`,
`case.takeover`, `case.handback`, `case.hold`, `edit.sent`. Optional fields:
`id` (a UUID is generated; it is the idempotency key, so set your own when you
may resend), `occurredAt`, `toolCallId`, `outputId`, `traceId`, `spanId`,
`agentName`, `actionType`, `decisionLatencyMs`, and `attributes` (a flat map of
up to 32 string, number or boolean values).

Eval Studio links each event to its run by `submissionId`, or by `traceId` /
`spanId` when you have those instead. Feedback that arrives before its run is
linked once the run's spans land.

`feedback()` validates the event and throws a `TypeError` on a mistake the
server would refuse, such as a rejection with no reason or a raw id in
`actorHash`. Valid events are queued and sent in batches (every
`flushIntervalMs`, default 2 s, or as soon as `batchSize`, default 100, are
waiting). `await evalStudio.flush()` sends what is queued now.

### Privacy

- **Never send note text.** Report `notePresent: true`. The API has no field
  for the note and refuses events that carry `note`, `comment` or similar.
- **Never send raw user ids or emails.** Use `hashActor(id, salt)`: a salted
  sha256 that counts distinct reviewers without saying who they are. Use one
  secret salt per deployment, not per event, so the same person hashes the
  same way. The API only accepts a 64-hex digest in `actor_hash`.
- **Edits travel as numbers.** `editStats(before, after)` runs in your process
  and returns four numbers; neither text leaves it.

## Delivery

- Requests are retried with exponential backoff (500 ms doubling, with
  jitter, capped at 30 s, 5 attempts) on network errors, `408`, `429` and
  `5xx`. A `Retry-After` header is honoured.
- Other `4xx` answers (an invalid event, a bad key, a body over the cap) are
  not retried. The batch is dropped and reported to `onError`.
- If a batch still fails after every retry, it stays queued for the next
  flush. The queue holds up to `maxQueueSize` events (default 10 000); past
  that the oldest are dropped and reported.
- `shutdown()` stops the timer, flushes, and refuses further events.

| Option                                     | Default                                              |
| ------------------------------------------ | ---------------------------------------------------- |
| `endpoint`                                 | `EVAL_STUDIO_URL`                                    |
| `projectKey`                               | `EVAL_STUDIO_PROJECT_KEY` (or `EVAL_STUDIO_API_KEY`) |
| `serviceVersion`                           | `OTEL_SERVICE_VERSION`, else `GIT_SHA`               |
| `batchSize`                                | 100 (server cap 500)                                 |
| `flushIntervalMs`                          | 2000                                                 |
| `maxQueueSize`                             | 10 000                                               |
| `maxAttempts`, `baseDelayMs`, `maxDelayMs` | 5, 500, 30 000                                       |
| `timeoutMs`                                | 10 000 per attempt                                   |
| `sendInstructions`                         | `true`                                               |
| `onError`                                  | logs a warning                                       |

## API reference

The two endpoints the SDK calls, `POST /v1/subject-versions` and
`POST /v1/feedback`, are documented in Eval Studio's
`docs/sdk/api-reference.md`, for apps that send without this SDK.

## Migrating from the reporter (`initEvalStudioReporter`)

The backbone push reporter still ships, deprecated, at
`@eval-studio/flue/legacy`. Eval Studio still serves `/api/ingest-push`, and
answers a beta.9 snapshot with `422`. To move:

1. Set up `@flue/opentelemetry` with an OTLP exporter as above. Runs now come
   from spans.
2. Replace `initEvalStudioReporter({ subjects })` with `createEvalStudio()` and
   one `registerAgentVersion()` per agent. The object you passed to
   `agentSubject()` is the definition `registerAgentVersion()` takes, and the
   hashes are identical, so existing versions are re-used, not duplicated.
3. Replace `reportFeedback({ verdict })` with `feedback({ type })`.

## Releasing (maintainers)

```sh
packages/flue-eval-reporter/scripts/release.sh 1.1.0          # prepare: build, stage, commit, tag locally
packages/flue-eval-reporter/scripts/release.sh 1.1.0 --push   # then publish the prepared tag
```

The script builds with `tsup` (ESM + types, the shared `@repo/schema` slices
inlined, `@flue/runtime` and `@opentelemetry/api` external) and lays down
`package.json` (name `@eval-studio/flue`), `dist/` and this README in a clone
of the `oghaAI/flue-eval-reporter` dist repo, tagged `v<version>`. Without
`--push` it stops before pushing and prints the push command. The source of
truth stays in the eval-studio monorepo; never edit the dist repo by hand.
