import { FlueInstrumentation } from '@flue/runtime';
import { A as AgentDefinition, a as AgentVersion } from './version-DU6_w67Z.js';
export { T as ToolLike, b as agentVersion, c as agentVersionHash, t as toolManifestEntry } from './version-DU6_w67Z.js';
export { ToolManifestEntry } from '@repo/schema/stamping';

declare const FEEDBACK_TYPES: readonly ["approval.approved", "approval.rejected", "approval.revised", "case.takeover", "case.handback", "case.hold", "edit.sent"];
type FeedbackType = (typeof FEEDBACK_TYPES)[number];
declare const REASON_CODES: readonly ["wrong_facts", "wrong_action", "tone", "policy", "duplicate", "other"];
type ReasonCode = (typeof REASON_CODES)[number];
type EditStats = {
    charsBefore: number;
    charsAfter: number;
    editDistance: number;
    /** editDistance / max(charsBefore, charsAfter): 0 = untouched, 1 = rewritten */
    editRatio: number;
};
/** One human signal about an agent output. */
type FeedbackEvent = {
    type: FeedbackType;
    /** The conversation the output belongs to (Runbook: the case id). */
    conversationId: string;
    /** Idempotency key; a UUID is generated when absent. */
    id?: string;
    /** When the human acted; now when absent. */
    occurredAt?: Date | string;
    submissionId?: string;
    toolCallId?: string;
    outputId?: string;
    /** The run's trace and span, when the app has them (hex32 / hex16). */
    traceId?: string;
    spanId?: string;
    agentName?: string;
    actionType?: string;
    /** hashActor(userId, salt) — never a raw id or email. */
    actorHash?: string;
    /** Required for approval.rejected. */
    reasonCode?: ReasonCode;
    /** Whether the human wrote a note; the note itself is never sent. */
    notePresent?: boolean;
    /** edit.sent / approval.revised: how much the human changed (editStats). */
    edit?: Partial<EditStats>;
    decisionLatencyMs?: number;
    /** Flat string/number/boolean map, at most 32 keys. */
    attributes?: Record<string, string | number | boolean>;
};
/** The snake_case event POST /v1/feedback takes. */
type WireFeedbackEvent = {
    id: string;
    type: FeedbackType;
    occurred_at: string;
    conversation_id: string;
    submission_id?: string;
    tool_call_id?: string;
    output_id?: string;
    trace_id?: string;
    span_id?: string;
    agent_name?: string;
    action_type?: string;
    actor_hash?: string;
    reason_code?: ReasonCode;
    note_present?: boolean;
    edit?: {
        chars_before?: number;
        chars_after?: number;
        edit_distance?: number;
        edit_ratio?: number;
    };
    decision_latency_ms?: number;
    attributes?: Record<string, string | number | boolean>;
};
/**
 * A salted sha256 of an actor id, as lowercase hex. Use one secret salt per
 * deployment (not per event) so the same person hashes the same way and
 * Eval Studio can count distinct reviewers without learning who they are.
 */
declare function hashActor(id: string, salt: string): string;
/**
 * How much a human changed an agent's draft, computed locally — the texts
 * never leave the process, only these four numbers do.
 */
declare function editStats(before: string, after: string): EditStats;
/**
 * The wire form of an event, or a TypeError naming what is wrong. The final
 * check is the server's own validator (@repo/schema/feedback-wire, bundled
 * into the SDK), so an event that gets queued is an event POST /v1/feedback
 * accepts: a bad one throws here, at the call site, instead of sinking the
 * batch it would have been sent in.
 */
declare function toWireEvent(e: FeedbackEvent): WireFeedbackEvent;

declare const EVAL_STUDIO_INSTRUMENTATION_KEY: unique symbol;
declare const ATTR_SUBJECT_VERSION_ID = "eval.subject_version_id";
declare const ATTR_VERSION_HASH = "eval.version_hash";
declare const ATTR_COST_USD = "flue.cost.usd";
/** What the stamp needs per agent, kept current by the client. */
type VersionLookup = (agentName: string) => {
    versionHash: string;
    subjectVersionId: string | null;
} | undefined;
type InstrumentationOptions = {
    /**
     * The @flue/opentelemetry instrumentation to compose with
     * (createOpenTelemetryInstrumentation()). Install the result INSTEAD of it.
     * Without it, install this after the OpenTelemetry one: stamping still
     * works, the cost bridge cannot (the chat span has already ended).
     */
    otel?: FlueInstrumentation;
    /** Set flue.cost.usd on chat spans that lack it. Default true. */
    costBridge?: boolean;
};
declare function createInstrumentation(lookup: VersionLookup, options?: InstrumentationOptions): FlueInstrumentation;

type TransportOptions = {
    fetch?: typeof fetch;
    /** Attempts per request, first try included. Default 5. */
    maxAttempts?: number;
    /** First backoff delay; doubles per attempt, with jitter. Default 500 ms. */
    baseDelayMs?: number;
    /** Backoff ceiling. Default 30 s. */
    maxDelayMs?: number;
    /** Per-attempt timeout. Default 10 s. */
    timeoutMs?: number;
    /** Injectable for tests. */
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
};
type PostResult = {
    ok: true;
    status: number;
    body: unknown;
} | {
    ok: false;
    status: number | null;
    error: string;
    retryable: boolean;
    /** The parsed error body, when the server sent one (e.g. 400 `invalid`). */
    body?: unknown;
};
declare function backoffDelay(attempt: number, opts: Pick<TransportOptions, "baseDelayMs" | "maxDelayMs" | "random">, retryAfterSeconds?: number): number;
/** POST JSON with the project key, retrying what is worth retrying. */
declare function postWithRetry(url: string, projectKey: string, body: unknown, opts?: TransportOptions): Promise<PostResult>;

type EvalStudioOptions = {
    /** Eval Studio base URL. Default EVAL_STUDIO_URL; absent → inert. */
    endpoint?: string;
    /** Project API key with the `ingest` scope. Default EVAL_STUDIO_PROJECT_KEY (or EVAL_STUDIO_API_KEY). */
    projectKey?: string;
    /**
     * The build this process runs (decision 5: the git SHA, recorded beside
     * the version). Default OTEL_SERVICE_VERSION, else GIT_SHA. A hex SHA is
     * also sent as the version's git_sha.
     */
    serviceVersion?: string;
    /** Events per POST. Default 100 (server cap 500); a batch also stays under ~900 KB. */
    batchSize?: number;
    /** Auto-flush period for queued feedback. Default 2000 ms. */
    flushIntervalMs?: number;
    /** Queue bound; the oldest events are dropped past it. Default 10 000. */
    maxQueueSize?: number;
    /** Send each version's instruction text as provenance. Default true. */
    sendInstructions?: boolean;
    /** Called on every dropped event or failed request (never throws into the app). */
    onError?: (error: EvalStudioError) => void;
} & TransportOptions;
type EvalStudioError = {
    kind: "register" | "feedback" | "dropped";
    message: string;
    status?: number | null;
    count?: number;
};
type RegisteredAgentVersion = AgentVersion & {
    /** Eval Studio's id for the version; null when inert or unreachable. */
    subjectVersionId: string | null;
};
type EvalStudio = {
    /** Hash an agent version, stamp it from now on, and register it. */
    registerAgentVersion: (def: AgentDefinition) => Promise<RegisteredAgentVersion>;
    /** The Flue instrumentation: version stamps + the cost bridge. */
    instrumentation: (options?: InstrumentationOptions) => FlueInstrumentation;
    /** Queue one human feedback event (validated now, sent in a batch). */
    feedback: (event: FeedbackEvent) => void;
    /** Queue several. */
    feedbackBatch: (events: FeedbackEvent[]) => void;
    /** Send everything queued; resolves when the queue is empty or a send failed. */
    flush: () => Promise<void>;
    /** Stop the timer, flush, and refuse further events. */
    shutdown: () => Promise<void>;
    /** Versions registered in this process, by agent name. */
    versions: () => ReadonlyMap<string, RegisteredAgentVersion>;
    /** Whether this client sends anything. */
    readonly enabled: boolean;
};
declare function createEvalStudio(options?: EvalStudioOptions): EvalStudio;

export { ATTR_COST_USD, ATTR_SUBJECT_VERSION_ID, ATTR_VERSION_HASH, AgentDefinition, AgentVersion, EVAL_STUDIO_INSTRUMENTATION_KEY, type EditStats, type EvalStudio, type EvalStudioError, type EvalStudioOptions, FEEDBACK_TYPES, type FeedbackEvent, type FeedbackType, type InstrumentationOptions, type PostResult, REASON_CODES, type ReasonCode, type RegisteredAgentVersion, type TransportOptions, type VersionLookup, type WireFeedbackEvent, backoffDelay, createEvalStudio, createInstrumentation, editStats, hashActor, postWithRetry, toWireEvent };
