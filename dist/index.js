// src/index.ts
import { readFileSync, statSync } from "fs";
import { dirname, isAbsolute, join, resolve } from "path";
import { IMAGE_DATA_OMITTED, observe } from "@flue/runtime";

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
async function loadSchemaConverter() {
  try {
    const mod = await import("@valibot/to-json-schema");
    return (schema) => {
      try {
        return mod.toJsonSchema(schema, { errorMode: "ignore" });
      } catch {
        return void 0;
      }
    };
  } catch {
    return null;
  }
}
function findGitDir(start) {
  let dir = start;
  for (; ; ) {
    const candidate = join(dir, ".git");
    try {
      const stat = statSync(candidate);
      if (stat.isDirectory()) return candidate;
      if (stat.isFile()) {
        const m = /^gitdir:\s*(.+)\s*$/m.exec(readFileSync(candidate, "utf8"));
        if (m?.[1]) return isAbsolute(m[1]) ? m[1] : resolve(dir, m[1]);
        return null;
      }
    } catch {
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function readGitSha(gitDir) {
  try {
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    const symref = /^ref:\s*(.+)$/.exec(head)?.[1]?.trim();
    if (!symref) return /^[0-9a-f]{40}$/i.test(head) ? head : void 0;
    let common = gitDir;
    try {
      const c = readFileSync(join(gitDir, "commondir"), "utf8").trim();
      common = isAbsolute(c) ? c : resolve(gitDir, c);
    } catch {
    }
    try {
      const sha = readFileSync(join(common, symref), "utf8").trim();
      if (/^[0-9a-f]{40}$/i.test(sha)) return sha;
    } catch {
    }
    const packed = readFileSync(join(common, "packed-refs"), "utf8");
    for (const line of packed.split("\n")) {
      if (line.endsWith(` ${symref}`)) return line.slice(0, 40);
    }
  } catch {
  }
  return void 0;
}
function readRepoUrl(gitDir) {
  try {
    const config = readFileSync(join(gitDir, "config"), "utf8");
    const section = /\[remote "origin"\][^[]*/.exec(config)?.[0];
    const raw = section && /^\s*url\s*=\s*(.+)\s*$/m.exec(section)?.[1]?.trim();
    if (!raw) return void 0;
    const bare = raw.replace(/\.git$/, "");
    if (/^https?:\/\//.test(bare)) return bare;
    const ssh = /^ssh:\/\/(?:[^@]+@)?([^:/]+)(?::\d+)?\/(.+)$/.exec(bare);
    if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
    if (bare.includes("://")) return void 0;
    const scp = /^(?:[^@]+@)?([^:/]+):(.+)$/.exec(bare);
    if (scp) return `https://${scp[1]}/${scp[2]}`;
    return void 0;
  } catch {
    return void 0;
  }
}
function probeGit() {
  try {
    const gitDir = findGitDir(process.cwd());
    if (!gitDir) return {};
    return { sha: readGitSha(gitDir), repoUrl: readRepoUrl(gitDir) };
  } catch {
    return {};
  }
}
var byName = (a, b) => (a.name ?? "").localeCompare(b.name ?? "");
function toBomTool(def, convert) {
  const tool = { name: def.name ?? "", description: def.description ?? "" };
  for (const [key, schema] of [
    ["inputSchema", def.input],
    ["outputSchema", def.output]
  ]) {
    if (schema == null) continue;
    const converted = convert ? convert(schema) : void 0;
    if (converted === void 0) tool.schemaUnavailable = true;
    else tool[key] = converted;
  }
  return tool;
}
var toBomSkill = (s) => ({
  name: s.name ?? "",
  description: s.description ?? ""
});
function buildBom(config, convert) {
  const tools = (config.tools ?? []).map((t) => toBomTool(t, convert)).sort(byName);
  const actions = (config.actions ?? []).map((a) => toBomTool(a, convert)).sort(byName);
  const skills = (config.skills ?? []).map(toBomSkill).sort(byName);
  const subagents = (config.subagents ?? []).map((p) => ({
    ...p.name != null ? { name: p.name } : {},
    ...p.description != null ? { description: p.description } : {},
    ...p.model != null ? { model: p.model } : {},
    ...p.instructions != null ? { instructions: p.instructions } : {},
    tools: (p.tools ?? []).map((t) => toBomTool(t, convert)).sort(byName),
    skills: (p.skills ?? []).map(toBomSkill).sort(byName)
  })).sort(byName);
  const bom = { tools, actions, skills, subagents };
  if (config.description != null) bom.description = config.description;
  if (config.thinkingLevel != null) bom.thinkingLevel = config.thinkingLevel;
  if (config.compaction !== void 0) bom.compaction = config.compaction;
  if (config.durability !== void 0) bom.durability = config.durability;
  return bom;
}
var BUFFERABLE = {
  turn_request: "turn_request",
  turn: "turn",
  tool: "tool",
  task: "task",
  log: "log",
  compaction: "compaction",
  submission_settled: "submission_settled"
};
var NEVER_SAMPLE = /* @__PURE__ */ new Set(["turn", "turn_request", "submission_settled", "compaction"]);
var CONTENT_KEYS = /* @__PURE__ */ new Set([
  "text",
  "message",
  "thinking",
  "content",
  "input",
  "output",
  "result",
  "args",
  "prompt",
  "systemPrompt",
  "errorText"
]);
function sharePolicy(value, contentOff, key) {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((v) => sharePolicy(v, contentOff));
  if (typeof value === "object") {
    const src = value;
    const isImageBlock = typeof src.mimeType === "string";
    const out = {};
    for (const [k, v] of Object.entries(src)) {
      if (k === "data" && isImageBlock) {
        out[k] = IMAGE_DATA_OMITTED;
        continue;
      }
      out[k] = sharePolicy(v, contentOff, k);
    }
    return out;
  }
  if (typeof value === "string") {
    if (contentOff && key != null && CONTENT_KEYS.has(key)) return value.length > 0 ? "[content omitted]" : "";
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  return null;
}
var leafCost = (usage) => {
  const total = usage?.cost?.total;
  return typeof total === "number" ? total : void 0;
};
function toPushEvent(obs, contentOff) {
  const type = BUFFERABLE[obs.type];
  if (!type) return null;
  const e = obs;
  const runKey = e.instanceId ?? e.runId;
  if (!runKey) return null;
  const costUsd = type === "turn" ? leafCost(e.response?.usage) : type === "compaction" ? leafCost(e.usage) : void 0;
  return {
    runKey,
    submissionId: e.submissionId ?? "",
    eventIndex: obs.eventIndex,
    type,
    ...e.turnId ? { turnId: e.turnId } : {},
    timestamp: obs.timestamp,
    ...costUsd != null ? { costUsd } : {},
    payload: sharePolicy(obs, contentOff)
  };
}
function initEvalStudioReporter(options = {}) {
  const url = (options.url ?? process.env.EVAL_STUDIO_URL)?.replace(/\/$/, "");
  if (!url) return;
  const project = options.project ?? process.env.EVAL_STUDIO_PROJECT;
  const environment = options.environment ?? process.env.EVAL_STUDIO_ENV;
  const selfUrl = (options.selfUrl ?? process.env.FLUE_SELF_URL)?.replace(/\/$/, "");
  const needProbe = !(options.gitRef ?? process.env.GIT_SHA) || !(options.repoUrl ?? process.env.EVAL_STUDIO_REPO_URL);
  const probed = needProbe ? probeGit() : {};
  const gitRef = options.gitRef ?? process.env.GIT_SHA ?? probed.sha;
  const repoUrl = (options.repoUrl ?? process.env.EVAL_STUDIO_REPO_URL ?? probed.repoUrl)?.replace(/\/$/, "");
  const headers = { "content-type": "application/json" };
  const secret = options.secret ?? process.env.EVAL_STUDIO_SECRET;
  if (secret) headers["x-eval-studio-secret"] = secret;
  const post = (path, body, what) => fetch(`${url}${path}`, { method: "POST", headers, body: JSON.stringify(body) }).then(async (res) => {
    if (!res.ok) console.warn(`[eval-studio] ${what} rejected: ${res.status} ${await res.text()}`);
  }).catch((e) => console.warn(`[eval-studio] ${what} failed (run stays re-ingestable): ${e}`));
  const contentOff = (options.contentMode ?? process.env.EVAL_STUDIO_CONTENT_MODE) === "off";
  const sampleRate = options.eventSampleRate ?? 1;
  const redact = options.redact;
  const localUrl = (options.selfUrl ?? process.env.FLUE_SELF_URL ?? "http://127.0.0.1:3583").replace(/\/$/, "");
  const agentNames = Object.keys(options.agents ?? {});
  const soleAgentName = agentNames.length === 1 ? agentNames[0] : void 0;
  const MAX_BUFFERED_PER_KEY = 5e3;
  const buffer = /* @__PURE__ */ new Map();
  const readLocalHistory = async (agentName, instanceId) => {
    try {
      const res = await fetch(`${localUrl}/agents/${encodeURIComponent(agentName)}/${encodeURIComponent(instanceId)}`);
      if (!res.ok) {
        console.warn(`[eval-studio] local history() read for ${agentName}/${instanceId}: ${res.status}`);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.warn(`[eval-studio] local history() read failed for ${agentName}/${instanceId}: ${err}`);
      return null;
    }
  };
  const pushWithRetry = async (body) => {
    const label = `${body.agentName}/${body.instanceId}${body.submissionId ? `/${body.submissionId}` : ""}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${url}/api/ingest-push`, {
          method: "POST",
          headers,
          body: JSON.stringify(body)
        });
        if (res.ok) return;
        console.warn(`[eval-studio] push ${label} rejected: ${res.status} ${await res.text()}`);
        if (res.status < 500) return;
      } catch (err) {
        console.warn(`[eval-studio] push ${label} failed (attempt ${attempt}, backbone re-readable): ${err}`);
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  };
  const drainEvents = (runKey, submissionId) => {
    const all = buffer.get(runKey) ?? [];
    const taken = [];
    const kept = [];
    for (const e of all) {
      const mine = submissionId ? e.submissionId === submissionId || e.submissionId === "" : true;
      if (mine) taken.push(redact ? redact(e) : e);
      else kept.push(e);
    }
    if (kept.length > 0) buffer.set(runKey, kept);
    else buffer.delete(runKey);
    return taken;
  };
  const pushSettled = (agentName, instanceId, submissionId) => setTimeout(() => {
    void (async () => {
      const events = drainEvents(instanceId, submissionId);
      const snapshot = await readLocalHistory(agentName, instanceId);
      if (!snapshot && events.length === 0) return;
      const body = {
        // No local backbone (sdk absent / read failed): send an empty snapshot
        // so the events still ingest; a later settle re-reads and re-pushes it.
        backbone: snapshot ? sharePolicy(snapshot, contentOff) : { v: 1, conversationId: instanceId, offset: "", messages: [], settlements: [] },
        events,
        agentName,
        instanceId,
        ...submissionId ? { submissionId } : {},
        ...project ? { project } : {},
        ...environment ? { environment } : {},
        flueBaseUrl: localUrl,
        ...gitRef ? { gitRef } : {},
        contentMode: contentOff ? "off" : "full"
      };
      await pushWithRetry(body);
    })();
  }, 500);
  observe((event) => {
    const pushEvent = toPushEvent(event, contentOff);
    if (pushEvent) {
      const sampled = NEVER_SAMPLE.has(pushEvent.type) || sampleRate >= 1 || Math.random() < sampleRate;
      if (sampled) {
        const list = buffer.get(pushEvent.runKey) ?? [];
        list.push(pushEvent);
        if (list.length > MAX_BUFFERED_PER_KEY) list.splice(0, list.length - MAX_BUFFERED_PER_KEY);
        buffer.set(pushEvent.runKey, list);
      }
    }
    if (event.type === "submission_settled") {
      if (event.outcome !== "completed") return;
      const { agentName, instanceId, submissionId } = event;
      if (!agentName || !instanceId) return;
      pushSettled(agentName, instanceId, submissionId);
      return;
    }
    if (event.type === "agent_end") {
      const e = event;
      const agentName = e.agentName ?? soleAgentName;
      if (!agentName || !e.instanceId) return;
      pushSettled(agentName, e.instanceId);
    }
  });
  const agents = options.agents;
  if (!agents || Object.keys(agents).length === 0) return;
  void (async () => {
    const convert = await loadSchemaConverter();
    const registrations = [];
    for (const [agentName, definition] of Object.entries(agents)) {
      try {
        const config = await definition.initialize({ id: "stamp-probe", env: process.env });
        const names = [...config.skills ?? [], ...config.tools ?? [], ...config.actions ?? []].map((x) => x.name);
        const instructions = config.instructions ?? "";
        registrations.push({
          agentName,
          promptHash: promptHash(instructions),
          skillHash: skillHash(names),
          model: config.model ?? "",
          // #30 prompt provenance: the text/names behind the hashes, so a run's
          // input-token cost is explainable in Studio. Sorted to match skillHash's
          // canonicalization — stored names and their hash never disagree.
          instructions,
          skillNames: [...names].sort(),
          // #31 agent BOM: the full anatomy (tools with real schemas, subagents,
          // settings) for the read-only spec sheet. Best-effort schema conversion
          // — a tool that can't convert degrades to name+description in-place.
          bom: buildBom(config, convert)
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
        ...repoUrl ? { repoUrl } : {},
        gitRef,
        activatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      "version registration"
    );
  })();
}
async function reportFeedback(feedback, options = {}) {
  const url = (options.url ?? process.env.EVAL_STUDIO_URL)?.replace(/\/$/, "");
  if (!url) return;
  if (!feedback.conversationId || !feedback.submissionId) {
    console.warn("[eval-studio] reportFeedback ignored: conversationId and submissionId are required");
    return;
  }
  const headers = { "content-type": "application/json" };
  const secret = options.secret ?? process.env.EVAL_STUDIO_SECRET;
  if (secret) headers["x-eval-studio-secret"] = secret;
  const label = `${feedback.conversationId}/${feedback.submissionId} (${feedback.verdict})`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${url}/api/feedback`, { method: "POST", headers, body: JSON.stringify(feedback) });
      if (res.ok) return;
      if (res.status !== 404 && res.status < 500) {
        console.warn(`[eval-studio] feedback ${label} rejected: ${res.status} ${await res.text()}`);
        return;
      }
      console.warn(`[eval-studio] feedback ${label}: ${res.status} (attempt ${attempt}) \u2014 will retry`);
    } catch (err) {
      console.warn(`[eval-studio] feedback ${label} failed (attempt ${attempt}): ${err}`);
    }
    if (attempt < 4) await new Promise((r) => setTimeout(r, 400 * attempt));
  }
}
export {
  initEvalStudioReporter,
  reportFeedback
};
