import { ToolManifestEntry } from '@repo/schema/stamping';

/** The parts of a Flue tool definition (defineTool) the manifest reads. */
type ToolLike = {
    name: string;
    description: string;
    /** A valibot schema (Flue's defineTool `input`). */
    input?: unknown;
};
/**
 * A tool's manifest entry: name, description and its input as JSON Schema
 * (converted from valibot; an unconvertible part degrades instead of throwing).
 */
declare function toolManifestEntry(tool: ToolLike): ToolManifestEntry;
/** What an agent renders: the inputs to its version identity. */
type AgentDefinition = {
    /** The agent's durable name (its `agentName` static or function name). */
    agentName: string;
    /** The rendered system instructions (what the agent function returns). */
    instructions: string;
    /** The tools it mounts: defineTool() values or manifest entries. */
    tools: readonly (ToolLike | ToolManifestEntry)[];
    /** The model it passes to useModel(), verbatim. */
    model: string;
};
/** One agent version: its digest and the parts it was computed from. */
type AgentVersion = {
    agentName: string;
    model: string;
    instructionsHash: string;
    toolsHash: string;
    versionHash: string;
    toolNames: string[];
};
/** Compute an agent's version identity. Pure and synchronous. */
declare function agentVersion(def: AgentDefinition): AgentVersion;
/** Just the digest — what eval.version_hash carries. */
declare const agentVersionHash: (def: AgentDefinition) => string;

export { type AgentDefinition as A, type ToolLike as T, type AgentVersion as a, agentVersion as b, agentVersionHash as c, toolManifestEntry as t };
