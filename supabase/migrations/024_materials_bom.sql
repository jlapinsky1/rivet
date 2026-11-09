-- Materials BOM: stores Exa-sourced Bill of Materials per work item.
-- Written by the material-pricer agent, read by the UI.

ALTER TABLE work_items
  ADD COLUMN IF NOT EXISTS materials_bom JSONB;

COMMENT ON COLUMN work_items.materials_bom IS
  'Bill of Materials from material-pricer agent. JSON: { materials: [...], total_low, total_mid, total_high, region, notes }';
