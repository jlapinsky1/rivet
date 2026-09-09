-- Mason Home Services: business + membership + work items + customers + companies
-- Run AFTER all migrations and seed-demo-user.sql
--
-- This seeds the demo account's data into Supabase tables so it's
-- scoped to Mason's business_id via RLS — NOT shared with other accounts.

-- ─── Business ───
-- Uses a deterministic UUID so seed SQL for work items can reference it

INSERT INTO businesses (id, owner_user_id, name, slug, vertical, timezone, settings)
SELECT
  'a0000000-0000-0000-0000-000000000001'::uuid,
  id,
  'Mason Home Services',
  'mason-home-services',
  'handyman',
  'America/Chicago',
  '{"serviceArea": "Nashville, TN", "serviceRadius": 25}'::jsonb
FROM auth.users WHERE email = 'mason@myrivet.io'
ON CONFLICT (id) DO NOTHING;

-- ─── Business Membership ───

INSERT INTO business_memberships (business_id, user_id, role)
SELECT
  'a0000000-0000-0000-0000-000000000001'::uuid,
  id,
  'owner'
FROM auth.users WHERE email = 'mason@myrivet.io'
ON CONFLICT (business_id, user_id) DO NOTHING;

-- ─── Update user metadata with display_name ───

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"display_name": "Mason"}'::jsonb
WHERE email = 'mason@myrivet.io';

-- ─── Individual Customers ───

INSERT INTO customers (business_id, name, phone, email, address, job_count, total_revenue) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Karen Mitchell', '(615) 555-0134', 'karen.m@email.com', '214 Maple Ridge Dr, Nashville, TN', 4, 3840),
  ('a0000000-0000-0000-0000-000000000001', 'Tom Bradley', '(615) 555-0187', 'tbradley@email.com', '88 Creekwood Ln, Nashville, TN', 2, 1560),
  ('a0000000-0000-0000-0000-000000000001', 'Angela Reeves', '(615) 555-0212', 'angela.r@email.com', '1401 Belmont Blvd, Nashville, TN', 3, 2750),
  ('a0000000-0000-0000-0000-000000000001', 'Derek Nguyen', '(615) 555-0156', 'derek.n@email.com', '309 Woodland St, Nashville, TN', 1, 480),
  ('a0000000-0000-0000-0000-000000000001', 'Stacy Caldwell', '(615) 555-0298', 'stacy.c@email.com', '72 Hillsboro Pike, Nashville, TN', 5, 4200),
  ('a0000000-0000-0000-0000-000000000001', 'Marcus Coleman', '(615) 555-0341', 'marcus.coleman@email.com', '555 Eastland Ave, Nashville, TN', 2, 1180),
  ('a0000000-0000-0000-0000-000000000001', 'Lisa Chen', '(615) 555-0177', 'lisa.chen@email.com', '1825 West End Ave, Nashville, TN', 1, 720),
  ('a0000000-0000-0000-0000-000000000001', 'Brian Hargrove', '(615) 555-0423', 'bhargrove@email.com', '402 Shelby Ave, Nashville, TN', 3, 2380),
  ('a0000000-0000-0000-0000-000000000001', 'Rachel Park', '(615) 555-0511', 'rpark@email.com', '1180 Lischey Ave, Nashville, TN', 2, 1440),
  ('a0000000-0000-0000-0000-000000000001', 'James Whitfield', '(615) 555-0389', 'jwhitfield@email.com', '637 Fatherland St, Nashville, TN', 1, 575),
  ('a0000000-0000-0000-0000-000000000001', 'Denise Morales', '(615) 555-0267', 'dmorales@email.com', '2240 Elliston Pl, Nashville, TN', 2, 1620),
  ('a0000000-0000-0000-0000-000000000001', 'Greg Patterson', '(615) 555-0144', 'gpatt@email.com', '891 Dickerson Pike, Nashville, TN', 1, 350),
  ('a0000000-0000-0000-0000-000000000001', 'Yolanda Freeman', '(615) 555-0478', 'yfreeman@email.com', '3310 Charlotte Ave, Nashville, TN', 3, 2860)
ON CONFLICT DO NOTHING;

-- ─── Companies ───

INSERT INTO companies (business_id, name, contact_name, contact_role, phone, email, total_revenue) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Greenway Property Management', 'David Chen', 'Maintenance Director', '(615) 555-0600', 'd.chen@greenwaymgmt.com', 12400),
  ('a0000000-0000-0000-0000-000000000001', 'Horizon Real Estate Group', 'Amanda Torres', 'Property Manager', '(615) 555-0750', 'a.torres@horizonre.com', 6200)
ON CONFLICT DO NOTHING;

-- ─── Properties ───
-- Uses subqueries to get company IDs since they're auto-generated

INSERT INTO properties (company_id, business_id, name, address, unit_count, work_order_count, units)
SELECT c.id, 'a0000000-0000-0000-0000-000000000001'::uuid, vals.name, vals.address, vals.unit_count, vals.work_order_count, vals.units::jsonb
FROM (VALUES
  ('Greenway Property Management', 'Riverside Commons', '2100 River Rd, Nashville, TN', 24, 5, '["Unit 4B", "Unit 12A", "Unit 18C", "Common Area"]'),
  ('Greenway Property Management', 'Summit Place Condos', '450 Summit Hill Dr, Nashville, TN', 16, 3, '["Unit 6", "Unit 11", "Common Area"]'),
  ('Horizon Real Estate Group', 'Midtown Lofts', '820 Division St, Nashville, TN', 12, 2, '["Unit 3A", "Unit 8B"]')
) AS vals(company_name, name, address, unit_count, work_order_count, units)
JOIN companies c ON c.name = vals.company_name AND c.business_id = 'a0000000-0000-0000-0000-000000000001'::uuid;
