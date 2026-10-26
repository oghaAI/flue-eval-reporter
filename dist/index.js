import {
  agentVersion,
  agentVersionHash,
  toolManifestEntry
} from "./chunk-LKO4T54N.js";

// src/feedback.ts
import { createHash, randomUUID } from "crypto";

// ../schema/src/feedback-wire.ts
var FEEDBACK_EVENT_TYPES = [
  "approval.approved",
  "approval.rejected",
  "approval.revised",
  "case.takeover",
  "case.handback",
  "case.hold",
  "edit.sent"
];
var FEEDBACK_REASON_CODES = [
  "wrong_facts",
  "wrong_action",
  "tone",
  "policy",
  "duplicate",
  "other"
];
var isPlainObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);
var MAX_FEEDBACK_BODY_BYTES = 1024 * 1024;
var MAX_ATTRIBUTE_KEYS = 32;
var MAX_FEEDBACK_ID = 256;
var MAX_ATTRIBUTE_VALUE = 1024;
var MAX_DECISION_LATENCY_MS = Number.MAX_SAFE_INTEGER;
var DECISION_LATENCY_S_ATTRIBUTE = "decision_latency_s";
var MAX_FUTURE_MS = 864e5;
var EDIT_TYPES = /* @__PURE__ */ new Set(["edit.sent", "approval.revised"]);
var FORBIDDEN_KEYS = [
  "note",
  "note_text",
  "comment",
  "actor_id",
  "actor",
  "user_id",
  "email"
];
var isNonNegInt = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 2 ** 31 - 1;
function decisionLatencyMsOf(ms, attributes) {
  if (ms != null && ms !== "") {
    const n = typeof ms === "string" ? Number(ms) : ms;
    if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX_DECISION_LATENCY_MS)
      return Math.round(n);
  }
  const raw = attributes?.[DECISION_LATENCY_S_ATTRIBUTE];
  const s = typeof raw === "string" && /^\s*\d+(\.\d+)?\s*$/.test(raw) ? Number(raw) : raw;
  if (typeof s === "number" && Number.isFinite(s) && s >= 0 && s * 1e3 <= MAX_DECISION_LATENCY_MS)
    return Math.round(s * 1e3);
  return null;
}
function validateFeedbackEvent(raw, now = Date.now()) {
  if (!isPlainObject(raw)) return { ok: false, errors: ["not an object"] };
  const errors = [];
  const str = (key, opts = {}) => {
    const v = raw[key];
    if (v == null) {
      if (opts.required) errors.push(`${key} is required`);
      return null;
    }
    if (typeof v !== "string" || v.length === 0) {
      errors.push(`${key} must be a non-empty string`);
      return null;
    }
    if (v.length > (opts.max ?? MAX_FEEDBACK_ID)) {
      errors.push(`${key} exceeds ${opts.max ?? MAX_FEEDBACK_ID} characters`);
      return null;
    }
    if (opts.pattern && !opts.pattern.test(v)) {
      errors.push(`${key} has an invalid format`);
      return null;
    }
    return v;
  };
  for (const k of FORBIDDEN_KEYS)
    if (k in raw)
      errors.push(
        `${k} is not accepted: send note_present and a hashed actor_hash, never note text or raw user ids`
      );
  const id = str("id", { required: true, max: 128, pattern: /^[\w.:-]+$/ });
  const type = raw.type;
  if (!FEEDBACK_EVENT_TYPES.includes(type))
    errors.push(`type must be one of ${FEEDBACK_EVENT_TYPES.join(", ")}`);
  let occurredAt = null;
  const occurred = str("occurred_at", { required: true, max: 64 });
  if (occurred) {
    const ms = Date.parse(occurred);
    if (!Number.isFinite(ms))
      errors.push("occurred_at must be an ISO timestamp");
    else if (ms > now + MAX_FUTURE_MS)
      errors.push("occurred_at is more than a day in the future");
    else occurredAt = new Date(ms).toISOString();
  }
  const conversationId = str("conversation_id", { required: true });
  const submissionId = str("submission_id");
  const toolCallId = str("tool_call_id");
  const outputId = str("output_id");
  const agentName = str("agent_name");
  const actionType = str("action_type");
  const traceId = str("trace_id", { pattern: /^[0-9a-fA-F]{32}$/ })?.toLowerCase() ?? null;
  const spanId = str("span_id", { pattern: /^[0-9a-fA-F]{16}$/ })?.toLowerCase() ?? null;
  const actorHash = str("actor_hash", { pattern: /^[0-9a-fA-F]{64}$/ })?.toLowerCase() ?? null;
  if (raw.actor_hash != null && actorHash == null)
    errors.push("actor_hash must be a sha256 hex digest (hash it client-side)");
  let reasonCode = null;
  if (raw.reason_code != null) {
    if (FEEDBACK_REASON_CODES.includes(raw.reason_code))
      reasonCode = raw.reason_code;
    else
      errors.push(
        `reason_code must be one of ${FEEDBACK_REASON_CODES.join(", ")}`
      );
  } else if (type === "approval.rejected") {
    errors.push("reason_code is required for approval.rejected");
  }
  let notePresent = false;
  if (raw.note_present != null) {
    if (typeof raw.note_present !== "boolean")
      errors.push("note_present must be a boolean");
    else notePresent = raw.note_present;
  }
  let edit = {
    editCharsBefore: null,
    editCharsAfter: null,
    editDistance: null,
    editRatio: null
  };
  if (raw.edit != null) {
    const e = raw.edit;
    if (!EDIT_TYPES.has(type))
      errors.push("edit is only accepted on edit.sent and approval.revised");
    if (!isPlainObject(e)) errors.push("edit must be an object");
    else {
      const before = e.chars_before;
      const after = e.chars_after;
      const distance = e.edit_distance;
      const ratio = e.edit_ratio;
      if (before != null && !isNonNegInt(before))
        errors.push("edit.chars_before must be a non-negative integer");
      if (after != null && !isNonNegInt(after))
        errors.push("edit.chars_after must be a non-negative integer");
      if (distance != null && !isNonNegInt(distance))
        errors.push("edit.edit_distance must be a non-negative integer");
      if (ratio != null && (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0 || ratio > 1))
        errors.push("edit.edit_ratio must be a number between 0 and 1");
      edit = {
        editCharsBefore: isNonNegInt(before) ? before : null,
        editCharsAfter: isNonNegInt(after) ? after : null,
        editDistance: isNonNegInt(distance) ? distance : null,
        editRatio: typeof ratio === "number" && ratio >= 0 && ratio <= 1 ? ratio : null
      };
    }
  }
  let decisionLatencyMs = null;
  if (raw.decision_latency_ms != null) {
    const ms = raw.decision_latency_ms;
    if (typeof ms !== "number" || !Number.isInteger(ms) || ms < 0 || ms > MAX_DECISION_LATENCY_MS)
      errors.push("decision_latency_ms must be a non-negative integer");
    else decisionLatencyMs = ms;
  }
  const attributes = {};
  if (raw.attributes != null) {
    if (!isPlainObject(raw.attributes))
      errors.push("attributes must be a flat object");
    else {
      const entries = Object.entries(raw.attributes);
      if (entries.length > MAX_ATTRIBUTE_KEYS)
        errors.push(`attributes has more than ${MAX_ATTRIBUTE_KEYS} keys`);
      for (const [k, v] of entries.slice(0, MAX_ATTRIBUTE_KEYS)) {
        if (k.length === 0 || k.length > 128) {
          errors.push(`attributes key "${k.slice(0, 32)}" is empty or too long`);
          continue;
        }
        if (typeof v === "string") {
          if (v.length > MAX_ATTRIBUTE_VALUE)
            errors.push(
              `attributes.${k} exceeds ${MAX_ATTRIBUTE_VALUE} characters`
            );
          else attributes[k] = v;
        } else if (typeof v === "boolean") attributes[k] = v;
        else if (typeof v === "number" && Number.isFinite(v)) attributes[k] = v;
        else errors.push(`attributes.${k} must be a string, number or boolean`);
      }
    }
  }
  if (decisionLatencyMs == null)
    decisionLatencyMs = decisionLatencyMsOf(null, attributes);
  if (errors.length > 0 || !id || !occurredAt || !conversationId)
    return { ok: false, errors: errors.length ? errors : ["invalid event"] };
  return {
    ok: true,
    event: {
      id,
      type,
      occurredAt,
      conversationId,
      submissionId,
      toolCallId,
      outputId,
      traceId,
      spanId,
      agentName,
      actionType,
      actorHash,
      reasonCode,
      notePresent,
      ...edit,
      decisionLatencyMs,
      attributes
    }
  };
}

// src/feedback.ts
var FEEDBACK_TYPES = [
  "approval.approved",
  "approval.rejected",
  "approval.revised",
  "case.takeover",
  "case.handback",
  "case.hold",
  "edit.sent"
];
var REASON_CODES = [
  "wrong_facts",
  "wrong_action",
  "tone",
  "policy",
  "duplicate",
  "other"
];
function hashActor(id, salt) {
  if (!salt) throw new TypeError("hashActor needs a non-empty salt");
  return createHash("sha256").update(`${salt}:${id}`).digest("hex");
}
function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length < b.length) [a, b] = [b, a];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}
var MAX_DIFF_CHARS = 2e4;
function editStats(before, after) {
  const charsBefore = before.length;
  const charsAfter = after.length;
  const longest = Math.max(charsBefore, charsAfter);
  const editDistance = charsBefore > MAX_DIFF_CHARS || charsAfter > MAX_DIFF_CHARS ? before === after ? 0 : Math.max(Math.abs(charsBefore - charsAfter), 1) : levenshtein(before, after);
  return {
    charsBefore,
    charsAfter,
    editDistance,
    editRatio: longest === 0 ? 0 : Math.min(1, editDistance / longest)
  };
}
var HEX64 = /^[0-9a-f]{64}$/i;
function toWireEvent(e) {
  if (!FEEDBACK_TYPES.includes(e.type))
    throw new TypeError(`unknown feedback type "${String(e.type)}"`);
  if (!e.conversationId) throw new TypeError("conversationId is required");
  if (e.type === "approval.rejected" && !e.reasonCode)
    throw new TypeError("approval.rejected needs a reasonCode");
  if (e.reasonCode && !REASON_CODES.includes(e.reasonCode))
    throw new TypeError(`unknown reasonCode "${e.reasonCode}"`);
  if (e.actorHash && !HEX64.test(e.actorHash))
    throw new TypeError(
      "actorHash must be a sha256 hex digest \u2014 use hashActor(id, salt), never a raw id"
    );
  if (e.edit && e.type !== "edit.sent" && e.type !== "approval.revised")
    throw new TypeError("edit is only valid on edit.sent and approval.revised");
  if (e.attributes && Object.keys(e.attributes).length > 32)
    throw new TypeError("attributes may have at most 32 keys");
  const occurred = e.occurredAt instanceof Date ? e.occurredAt.toISOString() : e.occurredAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const wire = {
    id: e.id ?? randomUUID(),
    type: e.type,
    occurred_at: occurred,
    conversation_id: e.conversationId,
    ...e.submissionId ? { submission_id: e.submissionId } : {},
    ...e.toolCallId ? { tool_call_id: e.toolCallId } : {},
    ...e.outputId ? { output_id: e.outputId } : {},
    ...e.traceId ? { trace_id: e.traceId } : {},
    ...e.spanId ? { span_id: e.spanId } : {},
    ...e.agentName ? { agent_name: e.agentName } : {},
    ...e.actionType ? { action_type: e.actionType } : {},
    ...e.actorHash ? { actor_hash: e.actorHash.toLowerCase() } : {},
    ...e.reasonCode ? { reason_code: e.reasonCode } : {},
    ...e.notePresent != null ? { note_present: e.notePresent } : {},
    ...e.edit ? {
      edit: {
        ...e.edit.charsBefore != null ? { chars_before: e.edit.charsBefore } : {},
        ...e.edit.charsAfter != null ? { chars_after: e.edit.charsAfter } : {},
        ...e.edit.editDistance != null ? { edit_distance: e.edit.editDistance } : {},
        ...e.edit.editRatio != null ? { edit_ratio: e.edit.editRatio } : {}
      }
    } : {},
    ...e.decisionLatencyMs != null ? { decision_latency_ms: Math.round(e.decisionLatencyMs) } : {},
    ...e.attributes ? { attributes: e.attributes } : {}
  };
  const checked = validateFeedbackEvent(wire);
  if (!checked.ok)
    throw new TypeError(`invalid feedback event: ${checked.errors.join("; ")}`);
  return wire;
}

// src/instrumentation.ts
import { trace } from "@opentelemetry/api";
var EVAL_STUDIO_INSTRUMENTATION_KEY = /* @__PURE__ */ Symbol.for("@eval-studio/flue");
var ATTR_SUBJECT_VERSION_ID = "eval.subject_version_id";
var ATTR_VERSION_HASH = "eval.version_hash";
var ATTR_COST_USD = "flue.cost.usd";
var bits = (span) => span;
function isAgentSpan(span) {
  if (!span.isRecording()) return false;
  const name = bits(span).name;
  return typeof name === "string" ? name.startsWith("invoke_agent") : true;
}
function spanAgentName(span) {
  const v = bits(span).attributes?.["gen_ai.agent.name"];
  return typeof v === "string" ? v : void 0;
}
var MAX_OPEN_TURNS = 1e4;
function createInstrumentation(lookup, options = {}) {
  const otel = options.otel;
  const costBridge = options.costBridge ?? true;
  const chatSpans = /* @__PURE__ */ new Map();
  const operationAgent = /* @__PURE__ */ new Map();
  const opKey = (instanceId, operationId) => `${instanceId ?? ""}\0${operationId}`;
  const stamp = (span, agentName) => {
    if (!span || !agentName || !isAgentSpan(span)) return;
    const version = lookup(agentName);
    if (!version) return;
    span.setAttribute(ATTR_VERSION_HASH, version.versionHash);
    if (version.subjectVersionId)
      span.setAttribute(ATTR_SUBJECT_VERSION_ID, version.subjectVersionId);
  };
  const own = (operation, ctx, next) => {
    try {
      if (operation.type === "agent") {
        const span = trace.getActiveSpan();
        stamp(
          span,
          ctx.agentName ?? operationAgent.get(opKey(ctx.instanceId, operation.operationId)) ?? (span ? spanAgentName(span) : void 0)
        );
      } else if (operation.type === "task") {
        const span = trace.getActiveSpan();
        stamp(span, span ? spanAgentName(span) : void 0);
      } else if (operation.type === "model" && costBridge) {
        const span = trace.getActiveSpan();
        if (span?.isRecording()) {
          if (chatSpans.size >= MAX_OPEN_TURNS) chatSpans.clear();
          chatSpans.set(operation.turnId, span);
        }
      }
    } catch {
    }
    return next();
  };
  const observe = (event, ctx) => {
    try {
      const e = event;
      if (e.type === "operation_start" && e.operationId && e.agentName) {
        if (operationAgent.size >= MAX_OPEN_TURNS) operationAgent.clear();
        operationAgent.set(opKey(e.instanceId, e.operationId), e.agentName);
      } else if (e.type === "operation" && e.operationId) {
        operationAgent.delete(opKey(e.instanceId, e.operationId));
      } else if (e.type === "turn" && e.turnId) {
        const span = chatSpans.get(e.turnId);
        chatSpans.delete(e.turnId);
        const cost = e.response?.usage?.cost?.total;
        if (span && typeof cost === "number" && Number.isFinite(cost) && bits(span).ended !== true && bits(span).attributes?.[ATTR_COST_USD] == null)
          span.setAttribute(ATTR_COST_USD, cost);
      }
    } catch {
    }
    return otel?.observe(event, ctx);
  };
  return {
    key: EVAL_STUDIO_INSTRUMENTATION_KEY,
    observe,
    interceptor: otel ? (operation, ctx, next) => otel.interceptor(operation, ctx, () => own(operation, ctx, next)) : own,
    dispose: async () => {
      chatSpans.clear();
      operationAgent.clear();
      await otel?.dispose();
    }
  };
}

// src/transport.ts
var defaultSleep = (ms) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  t.unref?.();
});
var retryableStatus = (s) => s === 408 || s === 429 || s >= 500;
function backoffDelay(attempt, opts, retryAfterSeconds) {
  const cap = opts.maxDelayMs ?? 3e4;
  if (retryAfterSeconds != null && Number.isFinite(retryAfterSeconds))
    return Math.min(cap, Math.max(0, retryAfterSeconds * 1e3));
  const exp = (opts.baseDelayMs ?? 500) * 2 ** attempt;
  return Math.min(cap, exp / 2 + (opts.random ?? Math.random)() * (exp / 2));
}
async function attemptPost(url, projectKey, body, opts) {
  const doFetch = opts.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 1e4);
  timer.unref?.();
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${projectKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    let parsed = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
    }
    if (res.ok) return { ok: true, status: res.status, body: parsed };
    const retryAfter = Number(res.headers.get("retry-after") ?? NaN);
    const message = parsed && typeof parsed === "object" && "error" in parsed ? String(parsed.error) : `HTTP ${res.status}`;
    return {
      ok: false,
      status: res.status,
      error: message,
      retryable: retryableStatus(res.status),
      body: parsed,
      ...Number.isFinite(retryAfter) ? { retryAfter } : {}
    };
  } catch (e) {
    return {
      ok: false,
      status: null,
      error: e instanceof Error ? e.message : String(e),
      retryable: true
    };
  } finally {
    clearTimeout(timer);
  }
}
async function postWithRetry(url, projectKey, body, opts = {}) {
  const attempts = Math.max(1, opts.maxAttempts ?? 5);
  const sleep = opts.sleep ?? defaultSleep;
  let last = {
    ok: false,
    status: null,
    error: "not sent",
    retryable: true
  };
  for (let attempt = 0; attempt < attempts; attempt++) {
    const r = await attemptPost(url, projectKey, body, opts);
    if (r.ok || !r.retryable) {
      const { retryAfter: _ra, ...result } = r;
      return result;
    }
    last = { ok: false, status: r.status, error: r.error, retryable: true };
    if (attempt < attempts - 1)
      await sleep(backoffDelay(attempt, opts, r.retryAfter));
  }
  return last;
}

// src/client.ts
var HEX_SHA = /^[0-9a-f]{7,40}$/i;
var MAX_BATCH_BYTES = 9e5;
var BATCH_ENVELOPE_BYTES = '{"events":[]}'.length;
function invalidIndexes(res, size) {
  if (res.status !== 400) return null;
  const invalid = res.body?.invalid;
  if (!Array.isArray(invalid)) return null;
  const out = /* @__PURE__ */ new Set();
  for (const item of invalid) {
    const index = item?.index;
    if (typeof index === "number" && Number.isInteger(index) && index >= 0 && index < size)
      out.add(index);
  }
  return out.size > 0 ? out : null;
}
function createEvalStudio(options = {}) {
  const endpoint = (options.endpoint ?? process.env.EVAL_STUDIO_URL)?.replace(
    /\/+$/,
    ""
  );
  const projectKey = options.projectKey ?? process.env.EVAL_STUDIO_PROJECT_KEY ?? process.env.EVAL_STUDIO_API_KEY;
  const enabled = Boolean(endpoint && projectKey);
  const serviceVersion = options.serviceVersion ?? process.env.OTEL_SERVICE_VERSION ?? process.env.GIT_SHA;
  const batchSize = Math.min(500, Math.max(1, options.batchSize ?? 100));
  const maxQueue = Math.max(batchSize, options.maxQueueSize ?? 1e4);
  const report = (e) => {
    try {
      if (options.onError) options.onError(e);
      else console.warn(`[eval-studio] ${e.kind}: ${e.message}`);
    } catch {
    }
  };
  const registry = /* @__PURE__ */ new Map();
  let queue = [];
  let closed = false;
  let inFlight = null;
  let followUp = null;
  let timer = null;
  const ensureTimer = () => {
    if (timer || !enabled) return;
    timer = setInterval(() => {
      if (queue.length > 0 && !inFlight) void flush();
    }, options.flushIntervalMs ?? 2e3);
    timer.unref?.();
  };
  async function registerAgentVersion(def) {
    const version = agentVersion(def);
    const known = registry.get(def.agentName);
    const entry = {
      ...version,
      subjectVersionId: known?.versionHash === version.versionHash ? known.subjectVersionId : null
    };
    registry.set(def.agentName, entry);
    if (!enabled) return entry;
    const metadata = {
      tool_names: version.toolNames,
      ...options.sendInstructions === false ? {} : { instructions: def.instructions },
      ...serviceVersion ? { service_version: serviceVersion } : {}
    };
    const res = await postWithRetry(
      `${endpoint}/v1/subject-versions`,
      projectKey,
      {
        agent_name: version.agentName,
        version_hash: version.versionHash,
        model: version.model,
        instructions_hash: version.instructionsHash,
        tools_hash: version.toolsHash,
        ...serviceVersion && HEX_SHA.test(serviceVersion) ? { git_sha: serviceVersion } : {},
        metadata
      },
      options
    );
    if (!res.ok) {
      report({
        kind: "register",
        message: `${def.agentName}: ${res.error}`,
        status: res.status
      });
      return entry;
    }
    const id = res.body.subject_version_id;
    const current = registry.get(def.agentName);
    if (typeof id === "string" && current?.versionHash === version.versionHash)
      current.subjectVersionId = id;
    return { ...entry, subjectVersionId: typeof id === "string" ? id : null };
  }
  function enqueue(events) {
    if (closed) {
      report({
        kind: "dropped",
        message: "feedback after shutdown()",
        count: events.length
      });
      return;
    }
    const wire = events.map(toWireEvent);
    if (!enabled) return;
    queue.push(...wire);
    if (queue.length > maxQueue) {
      const over = queue.length - maxQueue;
      queue = queue.slice(over);
      report({
        kind: "dropped",
        message: `feedback queue full; dropped the ${over} oldest events`,
        count: over
      });
    }
    ensureTimer();
    if (queue.length >= batchSize) void flush();
  }
  const takeBatch = (limit) => {
    let bytes = BATCH_ENVELOPE_BYTES;
    let n = 0;
    while (n < queue.length && n < limit) {
      const size = Buffer.byteLength(JSON.stringify(queue[n])) + 1;
      if (n > 0 && bytes + size > MAX_BATCH_BYTES) break;
      bytes += size;
      n++;
    }
    const batch = queue.slice(0, n);
    queue = queue.slice(n);
    return batch;
  };
  async function drain() {
    let limit = batchSize;
    while (queue.length > 0) {
      const batch = takeBatch(limit);
      const res = await postWithRetry(
        `${endpoint}/v1/feedback`,
        projectKey,
        { events: batch },
        options
      );
      if (res.ok) continue;
      if (res.status === 413 && batch.length > 1) {
        limit = Math.max(1, Math.floor(batch.length / 2));
        queue = [...batch, ...queue];
        continue;
      }
      if (res.retryable) {
        queue = [...batch, ...queue].slice(0, maxQueue);
        report({ kind: "feedback", message: res.error, status: res.status });
        return;
      }
      const bad = invalidIndexes(res, batch.length);
      if (bad && bad.size < batch.length) {
        report({
          kind: "dropped",
          message: `feedback refused ${bad.size} invalid event${bad.size === 1 ? "" : "s"}: ${res.error}`,
          status: res.status,
          count: bad.size
        });
        queue = [...batch.filter((_, i) => !bad.has(i)), ...queue];
        continue;
      }
      report({
        kind: "dropped",
        message: `feedback batch refused (${res.status}): ${res.error}`,
        status: res.status,
        count: batch.length
      });
    }
  }
  function flush() {
    if (!enabled) return Promise.resolve();
    if (!inFlight) {
      const run = drain().finally(() => {
        if (inFlight === run) inFlight = null;
      });
      inFlight = run;
      return run;
    }
    if (!followUp) {
      const next = inFlight.then(() => {
        if (followUp === next) followUp = null;
        return flush();
      });
      followUp = next;
    }
    return followUp;
  }
  async function shutdown() {
    closed = true;
    if (timer) clearInterval(timer);
    timer = null;
    await flush();
    if (queue.length > 0)
      report({
        kind: "dropped",
        message: `shutdown with ${queue.length} unsent feedback events`,
        count: queue.length
      });
  }
  return {
    enabled,
    registerAgentVersion,
    instrumentation: (opts) => createInstrumentation((name) => registry.get(name), opts),
    feedback: (event) => enqueue([event]),
    feedbackBatch: (events) => enqueue(events),
    flush,
    shutdown,
    versions: () => registry
  };
}
export {
  ATTR_COST_USD,
  ATTR_SUBJECT_VERSION_ID,
  ATTR_VERSION_HASH,
  EVAL_STUDIO_INSTRUMENTATION_KEY,
  FEEDBACK_TYPES,
  REASON_CODES,
  agentVersion,
  agentVersionHash,
  backoffDelay,
  createEvalStudio,
  createInstrumentation,
  editStats,
  hashActor,
  postWithRetry,
  toWireEvent,
  toolManifestEntry
};
