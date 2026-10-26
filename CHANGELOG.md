# Changelog

All notable changes to `@eval-studio/flue`, released as tags of
[oghaAI/flue-eval-reporter](https://github.com/oghaAI/flue-eval-reporter).
Install a release with `bun add github:oghaAI/flue-eval-reporter#vX.Y.Z`.

## 1.1.0

The first release of the Eval Studio SDK for Flue 2.3 apps, replacing the
v0.x backbone reporter. It works beside `@flue/opentelemetry`: runs reach
Eval Studio as OpenTelemetry spans over OTLP, and the SDK adds what spans
alone cannot carry. There is no 1.0.0 tag; 1.1.0 follows 0.4.0.

- **Agent versions.** `createEvalStudio()` and `registerAgentVersion()` hash
  the agent name, rendered system instructions, tool manifest and model into
  one version identity, register it with `POST /v1/subject-versions`, and
  stamp every `invoke_agent` span with `eval.subject_version_id` and
  `eval.version_hash`. The stamp is computed locally, so spans carry it from
  the first request. `serviceVersion` (default `OTEL_SERVICE_VERSION`, else
  `GIT_SHA`) is recorded beside each version. `sendInstructions: false`
  keeps instruction text out; the hash still covers it.
- **Cost.** `evalStudio.instrumentation({ otel })` wraps Flue's OpenTelemetry
  instrumentation and puts Flue's own per-call cost (`usage.cost.total`) on
  each `chat` span as `flue.cost.usd`.
- **Human feedback.** `feedback()` reports approvals, rejections with a
  reason code, revisions with their edit size, take-overs, hand-backs and
  holds to `POST /v1/feedback`. Events are validated locally, batched (cut by
  count and size, split on a `413`), retried with backoff on network errors,
  `408`, `429` and `5xx`, and kept queued through an outage, up to
  `maxQueueSize` (default 10 000; the oldest are dropped past it and reported
  to `onError`). One bad event no longer sinks its batch. `hashActor()` and `editStats()` keep reviewer ids
  and edited text in your process; note text is never sent.
- **Inert without configuration.** With no `EVAL_STUDIO_URL` /
  `EVAL_STUDIO_PROJECT_KEY` nothing is sent; versions are still hashed and
  stamped.
- **Peers:** `@flue/runtime` ^2.3, `@opentelemetry/api` ^1.9, `valibot` ^1.1.
  `@valibot/to-json-schema` is the one regular dependency.
- **Deprecated:** the v0.x push reporter (`initEvalStudioReporter`,
  `agentSubject`, `reportFeedback`) still ships at `@eval-studio/flue/legacy`
  for apps mid-migration. See the README's migration section.
