/**
 * Re-export of pure orchestrator functions for unit testing.
 * The authoritative source is netlify/functions/_shared/enrichmentOrchestrator.js.
 */
export {
  extractionFingerprint,
  evaluateTriggers,
  validateResearchBrief,
  validateBom,
} from '../../netlify/functions/_shared/enrichmentOrchestrator.js';
