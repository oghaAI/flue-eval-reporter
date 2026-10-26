import { FlueObservation } from '@flue/runtime';
import { PushEvent, IngestPushBody, FeedbackBody } from '@repo/schema/ingest';
import { AgentSubject, DeclaredScope, AgentBom, JsonValue, SubjectVersionRegistration } from '@repo/schema/stamping';
export { AgentSubject, ToolManifestEntry, instructionsHash, subjectVersionHash, toolManifestHash } from '@repo/schema/stamping';
import { T as ToolLike } from './version-DU6_w67Z.js';
export { t as toolManifestEntry } from './version-DU6_w67Z.js';

/** A declared subject plus the optional provenance Studio stores beside it. */
type DeclaredSubject = AgentSubject & {
    /** The instruction text behind instructionsHash (shown in Studio's spec sheet). */
    instructions?: string;
    /** The tool names in the manifest. */
    toolNames?: string[];
    /**
     * Declared instance-id scope (#77): a named conversation-id template with a
     * `{case}` slot that Eval Studio fills with its eval run id when an
     * experiment targets this scope. One subject per scope.
     */
    scope?: DeclaredScope;
    /** The tools as the spec sheet renders them (a partial BOM: tools only). */
    bom?: AgentBom;
};

/**
 * Build an agent's subject from what it renders: its system instructions,
 * the tools it mounts (Flue ToolDefinitions from defineTool) and its model.
 *
 *   agentSubject({ agentName: "hoa-v2", instructions: HOA_V2_INSTRUCTIONS,
 *                  tools: [lookupGoverningDocs, checkAmendments], model: HOA_MODEL })
 */
declare function agentSubject(args: {
    agentName: string;
    instructions: string;
    tools: ToolLike[];
    model: string;
    scope?: DeclaredScope;
}): DeclaredSubject;
/** Valid registrations for the declared subjects; invalid ones are reported and skipped. */
declare function subjectRegistrations(subjects: DeclaredSubject[]): SubjectVersionRegistration[];
/**
 * The URL of one agent conversation on this app: base + agent mount + id.
 * `agentPath` is a template with an `{agent}` slot (Flue 2 apps mount their
 * agents themselves; `/agents/{agent}` is the reference app's convention).
 */
declare function conversationUrl(baseUrl: string, agentPath: string, agentName: string, instanceId: string): string;
type EvalStudioReporterOptions = {
    /**
     * Agent versions to register at boot — one per agent (or per declared
     * scope). Build each with agentSubject(). Absent → nothing is stamped and
     * runs land unversioned.
     */
    subjects?: DeclaredSubject[];
    /** Eval Studio base URL. Default: EVAL_STUDIO_URL. Absent → reporter is inert. */
    url?: string;
    /**
     * Eval Studio project this app reports into (#18). Default:
     * EVAL_STUDIO_PROJECT. Unknown names auto-create; absent → the default project.
     */
    project?: string;
    /**
     * Environment this app runs in ('prod' | 'staging' | 'dev' | …, free text).
     * Default: EVAL_STUDIO_ENV, else UNSET — and Studio treats an unlabeled
     * reporter as 'prod'. Declare it on pre-prod apps to keep their traffic out
     * of monitoring (live judging, signals, dispatch, fleet health). Version
     * stamps are deliberately env-less — the same version hash links pre-prod
     * experiments and prod monitoring.
     */
    environment?: string;
    /**
     * THIS Flue app's own base URL. The reporter reads its LOCAL durable
     * history from here for the push backbone (#43), and Studio records it as
     * the app's location (and drives fresh evaluations against it). Default:
     * FLUE_SELF_URL, else Vite's dev default http://127.0.0.1:5173.
     */
    selfUrl?: string;
    /**
     * Where agents are mounted under selfUrl, with an `{agent}` slot. Default:
     * FLUE_AGENT_PATH, else `/agents/{agent}`. Studio must use the same shape
     * (its own FLUE_AGENT_PATH) to address conversations.
     */
    agentPath?: string;
    /**
     * Project API key (Settings → API keys, `ingest` scope), sent as
     * `Authorization: Bearer <key>`. It decides the project the app reports
     * into. Default: EVAL_STUDIO_API_KEY.
     */
    apiKey?: string;
    /**
     * DEPRECATED legacy shared secret, sent as x-eval-studio-secret only when no
     * apiKey is set; accepted only while the server sets
     * EVAL_STUDIO_LEGACY_SECRET. Default: EVAL_STUDIO_LEGACY_SECRET.
     */
    secret?: string;
    /**
     * Commit SHA the app runs from (#69) — recorded on each activation AND
     * pinned on the SubjectVersion it mints, powering Studio's "View source
     * @ sha" deep link. Default: GIT_SHA (set it in deploy pipelines), else a
     * .git read at boot (dev / source checkouts). No .git → stamps go unpinned.
     */
    gitRef?: string;
    /**
     * Where the agent's source can be browsed (#69) — composed with the commit
     * SHA into the spec sheet's deep link. Default: EVAL_STUDIO_REPO_URL, else
     * derived from the checkout's git remote origin (ssh forms normalize to
     * https). Absent → no deep link, everything else works.
     */
    repoUrl?: string;
    /**
     * Content policy (#43): "full" shares message/event text; "off" keeps only
     * structure + usage (Sentry's default). Image bytes are ALWAYS replaced with
     * the IMAGE_DATA_OMITTED sentinel regardless. Default: EVAL_STUDIO_CONTENT_MODE
     * ("off" iff set to "off"), else "full".
     */
    contentMode?: "full" | "off";
    /**
     * Last-mile redaction hook — runs on every event just before it is pushed
     * (after image-scrub + content-mode). Return the event to keep it, or the
     * mutated copy; the source decides what leaves the building.
     */
    redact?: (event: PushEvent) => PushEvent;
    /**
     * Sampling for high-volume, non-load-bearing events (tool / task / log):
     * 0..1, fraction KEPT. turn / turn_request / submission_settled / compaction
     * are never sampled out — cost, the composed request, and the outcome must
     * always survive. Default 1 (keep everything).
     */
    eventSampleRate?: number;
};
/**
 * The source-side content policy, applied to a backbone or an event before it
 * leaves the app. One recursive pass: image bytes become IMAGE_DATA_OMITTED
 * (any object carrying a `mimeType` has its `data` replaced — Flue's
 * {type:'image',data,mimeType} block), content-off blanks every string under
 * a content key, and the result is coerced to a serializable JSON value
 * (functions/undefined are dropped, so a push body never fails to stringify).
 */
declare function sharePolicy(value: unknown, contentOff: boolean): JsonValue;
/** What the push observer needs from its host (injected, so tests can drive it). */
type PushObserverDeps = {
    contentOff: boolean;
    /** 0..1, fraction of tool / task / log events kept. */
    sampleRate: number;
    redact?: (event: PushEvent) => PushEvent;
    /** Reads the conversation's local history snapshot; null when unreadable. */
    readHistory: (agentName: string, instanceId: string) => Promise<unknown>;
    push: (body: IngestPushBody) => Promise<void>;
    /** Fields every push carries (project, environment, flueBaseUrl, gitRef). */
    context: Pick<IngestPushBody, "project" | "environment" | "flueBaseUrl" | "gitRef">;
    /** Grace before reading history, so the durable store has the turn. Default 500. */
    settleDelayMs?: number;
};
/**
 * The push seam's observer (#43): buffers the forwardable events per
 * conversation and, on every submission_settled, drains that submission's
 * events and pushes them with the local backbone. Exported for tests;
 * initEvalStudioReporter wires it to observe().
 */
declare function createPushObserver(deps: PushObserverDeps): {
    observe: (event: FlueObservation) => void;
    /** Events still buffered, across every conversation. */
    buffered: () => number;
};
/**
 * @deprecated Use `createEvalStudio()` from `@eval-studio/flue` with
 * @flue/opentelemetry: spans for runs, registerAgentVersion() for versions,
 * feedback() for human signals. This backbone push is removed in the next
 * major.
 */
declare function initEvalStudioReporter(options?: EvalStudioReporterOptions): void;
type ReportFeedbackOptions = {
    /** Eval Studio base URL. Default: EVAL_STUDIO_URL. Absent → this call is inert. */
    url?: string;
    /** Project API key, sent as a bearer token. Default: EVAL_STUDIO_API_KEY. */
    apiKey?: string;
    /** DEPRECATED legacy secret (see initEvalStudioReporter). */
    secret?: string;
};
declare function reportFeedback(feedback: FeedbackBody, options?: ReportFeedbackOptions): Promise<void>;

export { type DeclaredSubject, type EvalStudioReporterOptions, type PushObserverDeps, type ReportFeedbackOptions, ToolLike, agentSubject, conversationUrl, createPushObserver, initEvalStudioReporter, reportFeedback, sharePolicy, subjectRegistrations };
