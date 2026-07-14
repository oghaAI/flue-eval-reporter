// src/index.ts
import { observe } from "@flue/runtime";

// ../schema/src/stamping.ts
import { createHash } from "crypto";
var sha12 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
function promptHash(instructions) {
  return sha12(instructions);
}
function skillHash(names) {
  return sha12(JSON.stringify([...names].sort()));
}

// src/index.ts
function initEvalStudioReporter(options = {}) {
  const url = (options.url ?? process.env.EVAL_STUDIO_URL)?.replace(/\/$/, "");
  if (!url) return;
  const project = options.project ?? process.env.EVAL_STUDIO_PROJECT;
  const selfUrl = (options.selfUrl ?? process.env.FLUE_SELF_URL)?.replace(/\/$/, "");
  const headers = { "content-type": "application/json" };
  const secret = options.secret ?? process.env.EVAL_STUDIO_SECRET;
  if (secret) headers["x-eval-studio-secret"] = secret;
  const post = (path, body, what) => fetch(`${url}${path}`, { method: "POST", headers, body: JSON.stringify(body) }).then(async (res) => {
    if (!res.ok) console.warn(`[eval-studio] ${what} rejected: ${res.status} ${await res.text()}`);
  }).catch((e) => console.warn(`[eval-studio] ${what} failed (run stays re-ingestable): ${e}`));
  const notifyIngest = (agentName, instanceId, submissionId) => setTimeout(
    () => void post(
      "/api/ingest",
      {
        agentName,
        instanceId,
        ...submissionId ? { submissionId } : {},
        ...project ? { project } : {},
        ...selfUrl ? { flueBaseUrl: selfUrl } : {}
      },
      `ingest notify ${agentName}/${instanceId}`
    ),
    500
  );
  const agentNames = Object.keys(options.agents ?? {});
  const soleAgentName = agentNames.length === 1 ? agentNames[0] : void 0;
  observe((event) => {
    if (event.type === "submission_settled") {
      if (event.outcome !== "completed") return;
      const { agentName, instanceId, submissionId } = event;
      if (!agentName || !instanceId) return;
      notifyIngest(agentName, instanceId, submissionId);
      return;
    }
    if (event.type === "agent_end") {
      const e = event;
      const agentName = e.agentName ?? soleAgentName;
      if (!agentName || !e.instanceId) return;
      notifyIngest(agentName, e.instanceId, e.submissionId);
    }
  });
  const agents = options.agents;
  if (!agents || Object.keys(agents).length === 0) return;
  void (async () => {
    const registrations = [];
    for (const [agentName, definition] of Object.entries(agents)) {
      try {
        const config = await definition.initialize({ id: "stamp-probe", env: process.env });
        const names = [...config.skills ?? [], ...config.tools ?? [], ...config.actions ?? []].map((x) => x.name);
        registrations.push({
          agentName,
          promptHash: promptHash(config.instructions ?? ""),
          skillHash: skillHash(names),
          model: config.model ?? ""
        });
      } catch (e) {
        console.warn(`[eval-studio] stamping ${agentName} failed (its runs will be unversioned): ${e}`);
      }
    }
    if (registrations.length === 0) return;
    await post(
      "/api/subject-versions",
      {
        registrations,
        ...project ? { project } : {},
        ...selfUrl ? { flueBaseUrl: selfUrl } : {},
        gitRef: options.gitRef ?? process.env.GIT_SHA,
        activatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      "version registration"
    );
  })();
}
export {
  initEvalStudioReporter
};
