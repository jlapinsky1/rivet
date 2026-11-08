import type { AgentTool, AgentContext, ToolResult } from '../types';

const _REGISTRY = new Map<string, AgentTool>();

export function addTool(tool: AgentTool): void {
  _REGISTRY.set(tool.name, tool);
}

/** Returns Anthropic-shaped tool specs filtered to the agent's allowlist. */
export function anthropicTools(allowlist: string[]) {
  return allowlist
    .map(name => _REGISTRY.get(name))
    .filter((t): t is AgentTool => t !== undefined)
    .map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Record<string, unknown>,
    }));
}

/** Execute a tool. Rejects calls outside the agent's allowlist. */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  allowlist: string[],
  context: AgentContext,
): Promise<ToolResult> {
  if (!allowlist.includes(name)) {
    return { content: `Tool '${name}' is not in this agent's allowlist.`, isError: true };
  }
  const tool = _REGISTRY.get(name);
  if (!tool) {
    return { content: `Unregistered tool '${name}'.`, isError: true };
  }
  try {
    return await tool.execute(input, context);
  } catch (err) {
    return {
      content: `${name} failed: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    };
  }
}
