import { AgentDefinition } from '@flue/runtime';
import { PushEvent, FeedbackBody } from '@repo/schema/ingest';

type EvalStudioReporterOptions = {
    /** Agents to version-stamp at boot, keyed by their Flue agent name. */
    agents?: Record<string, AgentDefinition>;
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
     * history() from here for the push backbone (#43), and Studio records it as
     * the app's location (never dials in). Default: FLUE_SELF_URL, else the Flue
     * dev default http://127.0.0.1:3583.
     */
    selfUrl?: string;
    /** Shared secret sent as x-eval-studio-secret. Default: EVAL_STUDIO_SECRET. */
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
declare function initEvalStudioReporter(options?: EvalStudioReporterOptions): void;
type ReportFeedbackOptions = {
    /** Eval Studio base URL. Default: EVAL_STUDIO_URL. Absent → this call is inert. */
    url?: string;
    /** Shared secret sent as x-eval-studio-secret. Default: EVAL_STUDIO_SECRET. */
    secret?: string;
};
declare function reportFeedback(feedback: FeedbackBody, options?: ReportFeedbackOptions): Promise<void>;

export { type EvalStudioReporterOptions, type ReportFeedbackOptions, initEvalStudioReporter, reportFeedback };
