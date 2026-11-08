/**
 * Tool registration — import this module once to register all tools with the registry.
 * Adding a new tool: create the file, import it here, call addTool().
 */
import { addTool } from '../registry/toolRegistry';
import { skillResourceTool } from './skillResource';
import { completeTaskTool } from './completeTask';

addTool(skillResourceTool);
addTool(completeTaskTool);
