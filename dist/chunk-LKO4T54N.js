// ../schema/src/stamping.ts
import { createHash } from "crypto";
var sha12 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
function promptHash(instructions) {
  return sha12(instructions);
}
function instructionsHash(instructions) {
  return promptHash(instructions);
}
function toolManifestHash(tools) {
  const canonical = [...tools].map((t) => ({
    name: t.name,
    description: t.description,
    ...t.inputSchema !== void 0 ? { inputSchema: t.inputSchema } : {}
  })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return sha12(stableStringify(canonical));
}
var HASH12 = /^[0-9a-f]{12}$/;
function subjectProblem(subject) {
  if (!subject.agentName.trim()) return "agentName is empty";
  if (!HASH12.test(subject.instructionsHash))
    return "instructionsHash must be 12 lowercase hex characters";
  if (!HASH12.test(subject.toolManifestHash))
    return "toolManifestHash must be 12 lowercase hex characters";
  if (typeof subject.model !== "string") return "model must be a string";
  return null;
}
function subjectVersionHash(subject) {
  return sha12(
    stableStringify({
      agentName: subject.agentName,
      instructionsHash: subject.instructionsHash,
      model: subject.model,
      toolManifestHash: subject.toolManifestHash
    })
  );
}
function subjectRegistration(subject) {
  return {
    agentName: subject.agentName,
    promptHash: subject.instructionsHash,
    skillHash: subject.toolManifestHash,
    model: subject.model,
    ...subject.instructions != null ? { instructions: subject.instructions } : {},
    ...subject.toolNames != null ? { skillNames: [...subject.toolNames].sort() } : {},
    ...subject.scope ? { scopeName: subject.scope.name, scopeTemplate: subject.scope.template } : {},
    ...subject.bom ? { bom: subject.bom } : {}
  };
}
function manifestBom(tools) {
  return {
    partial: true,
    tools: [...tools].map((t) => ({
      name: t.name,
      description: t.description,
      ...t.inputSchema !== void 0 ? { inputSchema: t.inputSchema } : {}
    })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    actions: [],
    skills: [],
    subagents: []
  };
}
function stableStringify(value) {
  if (value === void 0) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}
var SCOPE_CASE_PLACEHOLDER = "{case}";
function isValidScopeTemplate(template) {
  return template.includes(SCOPE_CASE_PLACEHOLDER);
}

// src/version.ts
import { toJsonSchema } from "@valibot/to-json-schema";
function toolManifestEntry(tool) {
  let inputSchema;
  if (tool.input != null) {
    try {
      inputSchema = toJsonSchema(tool.input, {
        errorMode: "ignore"
      });
    } catch {
      inputSchema = void 0;
    }
  }
  return {
    name: tool.name,
    description: tool.description,
    ...inputSchema !== void 0 ? { inputSchema } : {}
  };
}
var isManifestEntry = (t) => "inputSchema" in t || !("input" in t);
function agentVersion(def) {
  if (!def.agentName.trim()) throw new TypeError("agentName is empty");
  if (typeof def.model !== "string" || !def.model.trim())
    throw new TypeError("model is empty");
  const manifest = def.tools.map(
    (t) => isManifestEntry(t) ? t : toolManifestEntry(t)
  );
  const iHash = instructionsHash(def.instructions);
  const tHash = toolManifestHash(manifest);
  return {
    agentName: def.agentName,
    model: def.model,
    instructionsHash: iHash,
    toolsHash: tHash,
    versionHash: subjectVersionHash({
      agentName: def.agentName,
      instructionsHash: iHash,
      toolManifestHash: tHash,
      model: def.model
    }),
    toolNames: manifest.map((t) => t.name).sort()
  };
}
var agentVersionHash = (def) => agentVersion(def).versionHash;

export {
  instructionsHash,
  toolManifestHash,
  subjectProblem,
  subjectVersionHash,
  subjectRegistration,
  manifestBom,
  isValidScopeTemplate,
  toolManifestEntry,
  agentVersion,
  agentVersionHash
};
