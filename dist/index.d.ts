import { AgentDefinition } from '@flue/runtime';

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
     * THIS Flue app's own base URL (multi-app ingest) — Eval Studio pulls
     * history() from here, so a second app on another host/port stays
     * ingestable. Default: FLUE_SELF_URL. Absent → Eval Studio falls back to
     * its FLUE_BASE_URL env (single-app dogfood).
     */
    selfUrl?: string;
    /** Shared secret sent as x-eval-studio-secret. Default: EVAL_STUDIO_SECRET. */
    secret?: string;
    /** Deploy ref recorded on the activation. Default: GIT_SHA. */
    gitRef?: string;
};
declare function initEvalStudioReporter(options?: EvalStudioReporterOptions): void;

export { type EvalStudioReporterOptions, initEvalStudioReporter };
