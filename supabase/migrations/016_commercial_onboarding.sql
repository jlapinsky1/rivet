-- Migration 016: Add onboarding tracking columns to commercial_clients
-- These support the /portal/start 5-step onboarding wizard.
-- Records are written to the existing commercial_clients / properties / jobs tables
-- throughout the wizard - no separate onboarding table is needed.

alter table commercial_clients
  add column if not exists job_title text,
  add column if not exists onboarding_status text not null default 'in_progress',
  add column if not exists last_onboarding_step int not null default 1,
  add column if not exists continuation_token_hash text,
  add column if not exists continuation_token_expires_at timestamptz,
  add column if not exists attribution jsonb;

-- onboarding_status values: 'in_progress' | 'complete'
-- attribution keys: utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_page
