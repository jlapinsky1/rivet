import type { AgentTool } from '../types';
import { getSkill, loadSkillBody, loadResource } from '../registry/skillRegistry';

/**
 * skill_resource — universal control tool for the Sonnet (tool-use) path.
 * Agents load skill instructions and resource files on demand.
 * Logic lives in the .md resource files, not here.
 */
export const skillResourceTool: AgentTool = {
  name: 'skill_resource',
  description:
    "Access skill instructions and resource files. Use action='load' to get the skill body, action='resource' to load a specific file, action='list' to see available resources.",
  inputSchema: {
    type: 'object',
    properties: {
      skill_name: {
        type: 'string',
        description: 'Name of the skill to access.',
      },
      action: {
        type: 'string',
        description: "'load' — full skill instructions. 'resource' — a specific resource file. 'list' — list available resource paths.",
      },
      path: {
        type: 'string',
        description: "Resource file path. Required for action='resource' (e.g. 'resources/question-patterns.md').",
      },
    },
    required: ['skill_name', 'action'],
  },
  async execute({ skill_name, action, path }) {
    const name = skill_name as string;
    const act = action as string;
    const resourcePath = path as string | undefined;

    if (act === 'load') {
      return { content: loadSkillBody(name) };
    }

    if (act === 'list') {
      const skill = getSkill(name);
      if (!skill) return { content: `Skill '${name}' not found.`, isError: true };
      const paths = Object.keys(skill.resources ?? {});
      return { content: paths.length ? paths.join('\n') : '(no resource files)' };
    }

    if (act === 'resource') {
      if (!resourcePath) {
        return { content: "path is required for action='resource'", isError: true };
      }
      return { content: loadResource(name, resourcePath) };
    }

    return {
      content: `Unknown action '${act}'. Valid actions: load, list, resource`,
      isError: true,
    };
  },
};
