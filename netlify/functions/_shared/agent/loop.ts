/**
 * The one main agent loop.
 *
 * Two paths:
 *   Haiku  — single-pass, skill content pre-injected into system prompt, no tool calls.
 *            Use for focused, single-purpose tasks. Cheap (~$0.001/call).
 *   Sonnet — full tool-use loop. Skills loaded dynamically via skill_resource tool.
 *            Use when the agent needs tools, multi-step reasoning, or external data.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Agent, AgentContext, AgentResult } from './types';
import { MODELS } from './types';
import { preloadContent } from './registry/skillRegistry';
import { anthropicTools, executeTool } from './registry/toolRegistry';

const MAX_ITERATIONS = 12;
const MAX_TOOL_CALLS = 24;

const client = new Anthropic();

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
}

function buildSystem(agent: Agent, injectedSkills: string): string {
  return [
    `You are ${agent.name}.\n${agent.instructions}`,
    injectedSkills
      ? `\n## Loaded Skills\n\n${injectedSkills}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function runAgent(
  agent: Agent,
  userMessage: string,
  context: AgentContext,
): Promise<AgentResult> {
  // ── Haiku path: single API call, all skill content pre-loaded ─────────────
  if (agent.model === 'haiku') {
    const injected = preloadContent(agent.skills);
    const system = buildSystem(agent, injected);

    const response = await client.messages.create({
      model: MODELS.haiku,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });

    return { output: extractText(response.content), iterations: 1 };
  }

  // ── Sonnet path: tool-use loop ────────────────────────────────────────────
  const tools = anthropicTools(agent.tools);
  const system = buildSystem(agent, '');
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  let iterations = 0;
  let toolCallCount = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await client.messages.create({
      model: MODELS.sonnet,
      max_tokens: 2048,
      system,
      ...(tools.length > 0 ? { tools } : {}),
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') {
      return { output: extractText(response.content), iterations };
    }

    const uses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    toolCallCount += uses.length;
    if (toolCallCount > MAX_TOOL_CALLS) {
      return {
        output: extractText(response.content),
        iterations,
        error: 'max_tool_calls',
      };
    }

    let completeOutput: string | null = null;

    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
      uses.map(async u => {
        const result = await executeTool(
          u.name,
          u.input as Record<string, unknown>,
          agent.tools,
          context,
        );

        if (result.control === 'complete') {
          completeOutput = result.content;
        }

        return {
          type: 'tool_result' as const,
          tool_use_id: u.id,
          content: result.content,
          ...(result.isError ? { is_error: true } : {}),
        };
      }),
    );

    if (completeOutput !== null) {
      return { output: completeOutput, iterations };
    }

    messages.push({ role: 'user', content: results });
  }

  return { output: '', iterations, error: 'max_iterations' };
}
