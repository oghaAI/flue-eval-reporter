import {
  instructionsHash,
  isValidScopeTemplate,
  manifestBom,
  subjectProblem,
  subjectRegistration,
  subjectVersionHash,
  toolManifestEntry,
  toolManifestHash
} from "./chunk-LKO4T54N.js";

// src/legacy.ts
import { readFileSync, statSync } from "fs";
import { dirname, isAbsolute, join, resolve } from "path";
import { IMAGE_DATA_OMITTED, observe } from "@flue/runtime";
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
function agentSubject(args) {
  const manifest = args.tools.map(toolManifestEntry);
  return {
    agentName: args.agentName,
    instructionsHash: instructionsHash(args.instructions),
    toolManifestHash: toolManifestHash(manifest),
    model: args.model,
    instructions: args.instructions,
    toolNames: args.tools.map((t) => t.name),
    ...args.scope ? { scope: args.scope } : {},
    bom: manifestBom(manifest)
  };
}
function subjectRegistrations(subjects) {
  const out = [];
  for (const subject of subjects) {
    const problem = subjectProblem(subject) ?? (subject.scope && !isValidScopeTemplate(subject.scope.template) ? `scope "${subject.scope.name}" template must contain "{case}"` : null);
    if (problem) {
      console.warn(
        `[eval-studio] subject ${subject.agentName || "(unnamed)"} ignored: ${problem}`
      );
      continue;
    }
    out.push(subjectRegistration(subject));
  }
  return out;
}
function conversationUrl(baseUrl, agentPath, agentName, instanceId) {
  const mount = agentPath.replaceAll("{agent}", encodeURIComponent(agentName)).replace(/\/$/, "");
  return `${baseUrl.replace(/\/$/, "")}${mount}/${encodeURIComponent(instanceId)}`;
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
var NEVER_SAMPLE = /* @__PURE__ */ new Set([
  "turn",
  "turn_request",
  "submission_settled",
  "compaction"
]);
var CONTENT_KEYS = /* @__PURE__ */ new Set([
  // free text and model I/O
  "text",
  "message",
  "thinking",
  "content",
  "input",
  "output",
  "result",
  "args",
  "arguments",
  "prompt",
  "systemPrompt",
  "toolResults",
  // errors: their message, details and dev hints quote the payload
  "error",
  "errorText",
  "details",
  // Flue 2 parts: data-* payloads, files
  "data",
  "filename",
  "url",
  // Flue 2 observation detail
  "effectiveResult",
  "agentInput",
  "agentOutput",
  "attributes"
]);
var STRUCTURE_KEYS = /* @__PURE__ */ new Set([
  "type",
  "role",
  "state",
  "toolName",
  "toolCallId",
  "mimeType",
  "mediaType"
]);
var METADATA_KEPT = /* @__PURE__ */ new Set(["usage", "model"]);
var OMITTED = "[content omitted]";
function sharePolicy(value, contentOff) {
  return share(value, contentOff, false, null);
}
function share(value, contentOff, inContent, key) {
  if (value === null) return null;
  if (Array.isArray(value))
    return value.map((v) => share(v, contentOff, inContent, null));
  if (typeof value === "object") {
    const src = value;
    const isImageBlock = typeof src.mimeType === "string";
    const inMetadata = contentOff && !inContent && key === "metadata";
    const out = {};
    for (const [k, v] of Object.entries(src)) {
      if (k === "data" && isImageBlock) {
        out[k] = IMAGE_DATA_OMITTED;
        continue;
      }
      const childContent = inContent || contentOff && CONTENT_KEYS.has(k) || inMetadata && !METADATA_KEPT.has(k);
      out[k] = share(v, contentOff, childContent, k);
    }
    return out;
  }
  if (typeof value === "string") {
    if (inContent && !(key != null && STRUCTURE_KEYS.has(key)))
      return value.length > 0 ? OMITTED : "";
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
  const runKey = e.instanceId;
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
function createPushObserver(deps) {
  const { contentOff, sampleRate, redact } = deps;
  const MAX_BUFFERED_PER_KEY = 5e3;
  const buffer = /* @__PURE__ */ new Map();
  const drainEvents = (runKey, submissionId) => {
    const all = buffer.get(runKey) ?? [];
    const taken = [];
    const kept = [];
    for (const e of all) {
      const mine = e.submissionId === submissionId || e.submissionId === "";
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
      const snapshot = await deps.readHistory(agentName, instanceId);
      if (!snapshot && events.length === 0) return;
      const body = {
        // No local backbone (read failed): send an empty snapshot so the
        // events still ingest; a later settle re-reads and re-pushes it.
        backbone: snapshot ? sharePolicy(snapshot, contentOff) : {
          v: 1,
          conversationId: instanceId,
          offset: "",
          messages: [],
          settlements: []
        },
        events,
        agentName,
        instanceId,
        submissionId,
        ...deps.context,
        contentMode: contentOff ? "off" : "full"
      };
      await deps.push(body);
    })();
  }, deps.settleDelayMs ?? 500);
  const onEvent = (event) => {
    const pushEvent = toPushEvent(event, contentOff);
    if (pushEvent) {
      const sampled = NEVER_SAMPLE.has(pushEvent.type) || sampleRate >= 1 || Math.random() < sampleRate;
      if (sampled) {
        const list = buffer.get(pushEvent.runKey) ?? [];
        list.push(pushEvent);
        if (list.length > MAX_BUFFERED_PER_KEY)
          list.splice(0, list.length - MAX_BUFFERED_PER_KEY);
        buffer.set(pushEvent.runKey, list);
      }
    }
    if (event.type === "submission_settled") {
      const { agentName, instanceId, submissionId } = event;
      if (!agentName || !instanceId) return;
      pushSettled(agentName, instanceId, submissionId);
    }
  };
  return {
    observe: onEvent,
    buffered: () => [...buffer.values()].reduce((n, l) => n + l.length, 0)
  };
}
var warnedDeprecated = false;
function initEvalStudioReporter(options = {}) {
  if (!warnedDeprecated) {
    warnedDeprecated = true;
    console.warn(
      "[eval-studio] initEvalStudioReporter() is deprecated: switch to createEvalStudio() from @eval-studio/flue (see its README)."
    );
  }
  const url = (options.url ?? process.env.EVAL_STUDIO_URL)?.replace(/\/$/, "");
  if (!url) return;
  const project = options.project ?? process.env.EVAL_STUDIO_PROJECT;
  const environment = options.environment ?? process.env.EVAL_STUDIO_ENV;
  const selfUrl = (options.selfUrl ?? process.env.FLUE_SELF_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
  const agentPath = options.agentPath ?? process.env.FLUE_AGENT_PATH ?? "/agents/{agent}";
  const needProbe = !(options.gitRef ?? process.env.GIT_SHA) || !(options.repoUrl ?? process.env.EVAL_STUDIO_REPO_URL);
  const probed = needProbe ? probeGit() : {};
  const gitRef = options.gitRef ?? process.env.GIT_SHA ?? probed.sha;
  const repoUrl = (options.repoUrl ?? process.env.EVAL_STUDIO_REPO_URL ?? probed.repoUrl)?.replace(/\/$/, "");
  const headers = {
    "content-type": "application/json",
    ...studioAuthHeaders(options)
  };
  const contentOff = (options.contentMode ?? process.env.EVAL_STUDIO_CONTENT_MODE) === "off";
  const readLocalHistory = async (agentName, instanceId) => {
    const target = conversationUrl(selfUrl, agentPath, agentName, instanceId);
    try {
      const res = await fetch(target, {
        headers: { accept: "application/json" }
      });
      if (!res.ok) {
        console.warn(
          `[eval-studio] local history read for ${agentName}/${instanceId}: ${res.status}`
        );
        return null;
      }
      return await res.json();
    } catch (err) {
      console.warn(
        `[eval-studio] local history read failed for ${agentName}/${instanceId}: ${err}`
      );
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
        console.warn(
          `[eval-studio] push ${label} rejected: ${res.status} ${await res.text()}`
        );
        if (res.status < 500) return;
      } catch (err) {
        console.warn(
          `[eval-studio] push ${label} failed (attempt ${attempt}, backbone re-readable): ${err}`
        );
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  };
  observe(
    createPushObserver({
      contentOff,
      sampleRate: options.eventSampleRate ?? 1,
      ...options.redact ? { redact: options.redact } : {},
      readHistory: readLocalHistory,
      push: pushWithRetry,
      context: {
        ...project ? { project } : {},
        ...environment ? { environment } : {},
        flueBaseUrl: selfUrl,
        ...gitRef ? { gitRef } : {}
      }
    }).observe
  );
  const registrations = subjectRegistrations(options.subjects ?? []);
  if (registrations.length === 0) return;
  void fetch(`${url}/api/subject-versions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      registrations,
      ...project ? { project } : {},
      flueBaseUrl: selfUrl,
      ...repoUrl ? { repoUrl } : {},
      gitRef,
      activatedAt: (/* @__PURE__ */ new Date()).toISOString()
    })
  }).then(async (res) => {
    if (!res.ok)
      console.warn(
        `[eval-studio] version registration rejected: ${res.status} ${await res.text()}`
      );
  }).catch(
    (e) => console.warn(
      `[eval-studio] version registration failed (runs stay unversioned until the next boot): ${e}`
    )
  );
}
async function reportFeedback(feedback, options = {}) {
  const url = (options.url ?? process.env.EVAL_STUDIO_URL)?.replace(/\/$/, "");
  if (!url) return;
  if (!feedback.conversationId || !feedback.submissionId) {
    console.warn(
      "[eval-studio] reportFeedback ignored: conversationId and submissionId are required"
    );
    return;
  }
  const headers = {
    "content-type": "application/json",
    ...studioAuthHeaders(options)
  };
  const label = `${feedback.conversationId}/${feedback.submissionId} (${feedback.verdict})`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${url}/api/feedback`, {
        method: "POST",
        headers,
        body: JSON.stringify(feedback)
      });
      if (res.ok) return;
      if (res.status !== 404 && res.status < 500) {
        console.warn(
          `[eval-studio] feedback ${label} rejected: ${res.status} ${await res.text()}`
        );
        return;
      }
      console.warn(
        `[eval-studio] feedback ${label}: ${res.status} (attempt ${attempt}) \u2014 will retry`
      );
    } catch (err) {
      console.warn(
        `[eval-studio] feedback ${label} failed (attempt ${attempt}): ${err}`
      );
    }
    if (attempt < 4) await new Promise((r) => setTimeout(r, 400 * attempt));
  }
}
function studioAuthHeaders(options) {
  const apiKey = options.apiKey ?? process.env.EVAL_STUDIO_API_KEY;
  if (apiKey) return { authorization: `Bearer ${apiKey}` };
  const secret = options.secret ?? process.env.EVAL_STUDIO_LEGACY_SECRET ?? process.env.EVAL_STUDIO_SECRET;
  return secret ? { "x-eval-studio-secret": secret } : {};
}
export {
  agentSubject,
  conversationUrl,
  createPushObserver,
  initEvalStudioReporter,
  instructionsHash,
  reportFeedback,
  sharePolicy,
  subjectRegistrations,
  subjectVersionHash,
  toolManifestEntry,
  toolManifestHash
};
