import type { Agent } from '../types';

const _AGENTS = new Map<string, Agent>();

export function registerAgent(agent: Agent): void {
  _AGENTS.set(agent.id, agent);
}

export function getAgent(id: string): Agent | undefined {
  return _AGENTS.get(id);
}

export function listAgents(): Agent[] {
  return Array.from(_AGENTS.values());
}
