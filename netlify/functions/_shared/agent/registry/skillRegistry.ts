import type { Skill } from '../types';

const _SKILLS = new Map<string, Skill>();

export function registerSkill(skill: Skill): void {
  _SKILLS.set(skill.name, skill);
}

export function getSkill(name: string): Skill | undefined {
  return _SKILLS.get(name);
}

/** One-line catalog entries injected into system prompts. */
export function catalogText(skillNames: string[]): string {
  return skillNames
    .map(name => {
      const s = _SKILLS.get(name);
      return s ? `- **${s.name}**: ${s.description}` : null;
    })
    .filter(Boolean)
    .join('\n');
}

/** Full SKILL.md body for a skill. Used by skill_resource tool (Sonnet path). */
export function loadSkillBody(name: string): string {
  const s = _SKILLS.get(name);
  return s ? s.instructions : `Skill '${name}' not found.`;
}

/** Load a specific resource file from a skill. */
export function loadResource(skillName: string, path: string): string {
  const s = _SKILLS.get(skillName);
  if (!s) return `Skill '${skillName}' not found.`;
  if (!s.resources?.[path]) {
    const available = Object.keys(s.resources ?? {}).join(', ');
    return `Resource '${path}' not found in '${skillName}'. Available: ${available || '(none)'}`;
  }
  return s.resources[path];
}

/**
 * Pre-load all skill content (instructions + all resources) into one block.
 * Used by the Haiku path: inject everything into the system prompt, no tool calls needed.
 */
export function preloadContent(skillNames: string[]): string {
  return skillNames
    .map(name => {
      const s = _SKILLS.get(name);
      if (!s) return null;
      const resourceBlocks = s.resources
        ? Object.entries(s.resources)
            .map(([path, content]) => `#### Resource: ${path}\n${content}`)
            .join('\n\n')
        : '';
      return [`### Skill: ${s.name}`, s.instructions, resourceBlocks]
        .filter(Boolean)
        .join('\n\n');
    })
    .filter(Boolean)
    .join('\n\n---\n\n');
}
