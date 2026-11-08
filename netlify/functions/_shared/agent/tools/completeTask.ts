import type { AgentTool } from '../types';

/**
 * complete_task — control tool for the Sonnet path.
 * Agent calls this with its final structured result. Loop sees control='complete' and exits.
 */
export const completeTaskTool: AgentTool = {
  name: 'complete_task',
  description:
    'Signal that the task is complete. Call this with a JSON string containing the final result. The loop will exit and return this output.',
  inputSchema: {
    type: 'object',
    properties: {
      result: {
        type: 'string',
        description: 'JSON string with the final structured result.',
      },
    },
    required: ['result'],
  },
  async execute({ result }) {
    return {
      content: (result as string) ?? '{}',
      control: 'complete' as const,
    };
  },
};
