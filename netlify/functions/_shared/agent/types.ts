// ─── Model Routing ───────────────────────────────────────────────────────────
// Haiku: single-pass tasks, pre-loaded skills, no tool calling. Cheap + fast.
// Sonnet: tool-use loop, dynamic skill loading, deep reasoning.

export const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
} as const;

export type ModelTier = keyof typeof MODELS;

// ─── Core Types ──────────────────────────────────────────────────────────────

export interface AgentContext {
  businessId: string;
  userId?: string;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
  control?: 'complete' | 'needs_review';
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
  execute(input: Record<string, unknown>, context: AgentContext): Promise<ToolResult>;
}

export interface Skill {
  name: string;
  description: string;
  /** Full SKILL.md body — instructions for the agent. */
  instructions: string;
  /** Resource files: relative path → markdown content. Logic lives here, not in code. */
  resources?: Record<string, string>;
}

export interface Agent {
  id: string;
  name: string;
  /** Identity + purpose. Injected into system prompt. */
  instructions: string;
  /** Skill names this agent can access. */
  skills: string[];
  /** Tool names this agent is allowed to call (allowlist). Empty = no tools (Haiku path). */
  tools: string[];
  model: ModelTier;
}

export interface AgentResult {
  output: string;
  iterations: number;
  error?: string;
}
