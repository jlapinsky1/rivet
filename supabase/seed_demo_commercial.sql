-- ============================================================
-- Demo seed: jonathanlapinsky1@gmail.com commercial account
-- Run in Supabase SQL editor (service role / SQL editor bypasses RLS)
-- Safe to re-run: deletes existing demo data first
-- ============================================================

DO $$
DECLARE
  v_user_id       uuid;
  v_client_id     uuid;

  -- property IDs
  p_oakwood       uuid := gen_random_uuid();
  p_riverside     uuid := gen_random_uuid();
  p_peachtree     uuid := gen_random_uuid();
  p_sunset        uuid := gen_random_uuid();
  p_brookhaven    uuid := gen_random_uuid();

  -- job IDs (named for readability)
  j_oak_comp1     uuid := gen_random_uuid();
  j_oak_comp2     uuid := gen_random_uuid();
  j_oak_comp3     uuid := gen_random_uuid();
  j_oak_comp4     uuid := gen_random_uuid();
  j_oak_sched1    uuid := gen_random_uuid();
  j_oak_sched2    uuid := gen_random_uuid();
  j_oak_open1     uuid := gen_random_uuid();
  j_oak_inprog    uuid := gen_random_uuid();
  j_riv_comp1     uuid := gen_random_uuid();
  j_riv_comp2     uuid := gen_random_uuid();
  j_riv_sched1    uuid := gen_random_uuid();
  j_riv_open1     uuid := gen_random_uuid();
  j_riv_cancel1   uuid := gen_random_uuid();
  j_pea_comp1     uuid := gen_random_uuid();
  j_pea_comp2     uuid := gen_random_uuid();
  j_pea_open1     uuid := gen_random_uuid();
  j_pea_open2     uuid := gen_random_uuid();
  j_sun_comp1     uuid := gen_random_uuid();
  j_sun_sched1    uuid := gen_random_uuid();
  j_sun_cancel1   uuid := gen_random_uuid();
  j_brk_comp1     uuid := gen_random_uuid();
  j_brk_inprog    uuid := gen_random_uuid();
  j_brk_open1     uuid := gen_random_uuid();

BEGIN

  -- ── 1. Resolve user ─────────────────────────────────────────
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'jonathanlapinsky1@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User jonathanlapinsky1@gmail.com not found in auth.users. Make sure the account exists first.';
  END IF;

  -- ── 2. Upsert commercial_clients profile ────────────────────
  INSERT INTO commercial_clients (user_id, company_name, contact_name, phone)
  VALUES (
    v_user_id,
    'Lapinsky Property Group',
    'Jonathan Lapinsky',
    '(770) 628-2877'
  )
  ON CONFLICT (user_id) DO UPDATE
    SET company_name  = EXCLUDED.company_name,
        contact_name  = EXCLUDED.contact_name,
        phone         = EXCLUDED.phone;

  SELECT id INTO v_client_id
  FROM commercial_clients
  WHERE user_id = v_user_id;

  -- ── 3. Wipe existing demo data for clean re-seed ────────────
  DELETE FROM invoices
  WHERE property_id IN (SELECT id FROM properties WHERE client_id = v_client_id);

  DELETE FROM job_photos
  WHERE job_id IN (
    SELECT j.id FROM jobs j
    JOIN properties p ON p.id = j.property_id
    WHERE p.client_id = v_client_id
  );

  DELETE FROM jobs
  WHERE property_id IN (SELECT id FROM properties WHERE client_id = v_client_id);

  DELETE FROM properties WHERE client_id = v_client_id;


  -- ── 4. Properties ────────────────────────────────────────────

  INSERT INTO properties (id, client_id, name, address, primary_contact_name, primary_contact_phone, primary_contact_email, notes) VALUES

  (p_oakwood, v_client_id,
   'Oakwood Apartment Complex',
   '4210 Oakwood Trail, Marietta, GA 30062',
   'Sandra Holt',
   '(404) 555-0192',
   'sholt@oakwoodapts.com',
   '128 units across 6 buildings. High tenant turnover in Buildings C and D. Dumpster enclosure is keyed - coordinate with Sandra before scheduling.'),

  (p_riverside, v_client_id,
   'Riverside Office Park',
   '890 Riverside Pkwy, Woodstock, GA 30188',
   'Marcus Webb',
   '(770) 555-0341',
   'mwebb@riversideofficepk.com',
   'Three-building office complex. Suite buildouts and tenant move-outs are primary source of debris. Loading dock accessible Mon–Fri 7am–5pm only.'),

  (p_peachtree, v_client_id,
   'Peachtree Plaza Shopping Center',
   '2055 Peachtree Industrial Blvd, Duluth, GA 30097',
   'Diana Cho',
   '(678) 555-0287',
   'dcho@peachtreeplaza.net',
   '22 retail bays. Frequent tenant changeovers. Back-of-house access via service road on east side. Contact Diana 48 hrs in advance for gate code.'),

  (p_sunset, v_client_id,
   'Sunset Self-Storage',
   '741 Sunset Blvd, Canton, GA 30114',
   'Roger Taft',
   '(770) 555-0458',
   'rtaft@sunsetselfstorage.com',
   'Climate-controlled facility, 340 units. Abandoned unit cleanouts are recurring. Manager Roger has master access. Items often include furniture, appliances, and boxes of household goods.'),

  (p_brookhaven, v_client_id,
   'Brookhaven Condos',
   '305 Brookhaven Ave NE, Atlanta, GA 30319',
   'Lisa Okafor',
   '(404) 555-0519',
   'lokafor@brookhavenhoa.org',
   '72-unit HOA-managed condo complex. Common area cleanouts and move-out debris. Freight elevator available - must be reserved with Lisa. No street parking: use rear parking structure.');


  -- ── 5. Jobs ─────────────────────────────────────────────────

  -- OAKWOOD - 8 jobs
  INSERT INTO jobs (id, property_id, status, unit, description, scheduled_date, completed_at, estimate, final_amount, items_removed, completion_notes, access_notes, preferred_date) VALUES

  (j_oak_comp1, p_oakwood, 'completed', 'Unit 14C',
   'Full move-out cleanout. Tenant left behind all furniture and appliances.',
   now() - interval '62 days', now() - interval '61 days',
   425.00, 450.00,
   'Sofa, loveseat, queen bed frame + mattress, dresser, 2x nightstands, microwave, small refrigerator, ~20 boxes of miscellaneous household items',
   'Took 2 trips. Extra charge applied for second truck run. Unit left broom clean.',
   'Key from office. No elevator in Building C - stairs only to 2nd floor.',
   now() - interval '63 days'),

  (j_oak_comp2, p_oakwood, 'completed', 'Unit 7A',
   'Move-out cleanout. Moderate amount of furniture and trash bags.',
   now() - interval '45 days', now() - interval '44 days',
   275.00, 275.00,
   'Twin bed + mattress, desk, office chair, 4x trash bags, old TV (CRT), shelving unit',
   'Single trip. Unit was mostly cleared by tenant - quick job.',
   'Unit on ground floor, east side of Building A.',
   now() - interval '46 days'),

  (j_oak_comp3, p_oakwood, 'completed', 'Building D - Common Area',
   'Quarterly common area cleanout. Lobby and laundry room items.',
   now() - interval '30 days', now() - interval '29 days',
   195.00, 195.00,
   'Broken laundry cart, 2x old benches, assorted lost-and-found furniture, 10 bags of debris',
   'Fast job. All items staged by entrance by management.',
   'Dumpster enclosure key from Sandra in office.',
   now() - interval '31 days'),

  (j_oak_comp4, p_oakwood, 'completed', 'Unit 22B',
   'Eviction cleanout. Full unit.',
   now() - interval '14 days', now() - interval '13 days',
   575.00, 600.00,
   'Full bedroom set, dining table + 4 chairs, couch, large TV + stand, washer/dryer, ~30 bags of trash/clothes, bicycle',
   'Heavy load - 2 trucks needed. Washer/dryer required appliance dolly. Extra charge approved by Sandra.',
   'Coordinate with Sandra for access. Building C, 3rd floor.',
   now() - interval '15 days'),

  (j_oak_sched1, p_oakwood, 'scheduled', 'Unit 31D',
   'Move-out cleanout. Tenant leaving end of month. Estimated medium load.',
   now() + interval '3 days', NULL,
   325.00, NULL,
   NULL, NULL,
   'Key pickup from leasing office morning of job.',
   now() + interval '2 days'),

  (j_oak_sched2, p_oakwood, 'scheduled', 'Unit 18A + 19A',
   'Two adjacent units, both move-outs same day. Coordinate for efficiency.',
   now() + interval '7 days', NULL,
   550.00, NULL,
   NULL, NULL,
   'Both units ground floor Building A. Sandra will have keys ready at 8am.',
   now() + interval '6 days'),

  (j_oak_inprog, p_oakwood, 'in_progress', 'Unit 9C',
   'Eviction cleanout in progress. Crew on site.',
   now(), NULL,
   400.00, NULL,
   NULL, NULL,
   'Building C, 1st floor. Dumpster enclosure open.',
   now()),

  (j_oak_open1, p_oakwood, 'open', 'Building B - Storage Room',
   'Storage room in basement has accumulated years of abandoned tenant items. Needs full cleanout.',
   NULL, NULL,
   NULL, NULL,
   NULL, NULL,
   'Storage room B-lower. Sandra has key. Stairs only - tight stairwell.',
   now() + interval '14 days'),


  -- RIVERSIDE OFFICE PARK - 5 jobs
  (j_riv_comp1, p_riverside, 'completed', 'Suite 210',
   'Tenant move-out. Office furniture and IT equipment debris.',
   now() - interval '55 days', now() - interval '54 days',
   350.00, 350.00,
   '6x office chairs, 4x desks, 2x filing cabinets, printer, server rack (empty), cubicle panels, assorted IT cables/boxes',
   'Filing cabinets were heavy - required 2-man team. All removed cleanly.',
   'Loading dock Building B. Marcus will have dock door open.',
   now() - interval '56 days'),

  (j_riv_comp2, p_riverside, 'completed', 'Suite 105 + 106',
   'Major suite renovation debris. Drywall, flooring, fixtures.',
   now() - interval '20 days', now() - interval '19 days',
   680.00, 720.00,
   'Drywall scraps (~2 cubic yards), old carpet + padding, fluorescent light fixtures (12), ceiling tiles, metal framing scraps, 2x old HVAC vents',
   'Construction debris only - coordinate with contractor was smooth. Slight overage on drywall volume, $40 added.',
   'Loading dock Building A. Contractor (Mike Reeves) will be on site.',
   now() - interval '21 days'),

  (j_riv_sched1, p_riverside, 'scheduled', 'Suite 318',
   'New tenant buildout - old furniture and fixture removal before contractor arrives.',
   now() + interval '5 days', NULL,
   290.00, NULL,
   NULL, NULL,
   'Loading dock Building C. Marcus will meet crew at 7:30am sharp - contractor arrives at 9am.',
   now() + interval '4 days'),

  (j_riv_open1, p_riverside, 'open', 'Suite 402',
   'Tenant downsizing - removing half their furniture. Needs assessment visit first.',
   NULL, NULL,
   NULL, NULL,
   NULL, NULL,
   'Loading dock Building B. Call Marcus to schedule assessment.',
   now() + interval '10 days'),

  (j_riv_cancel1, p_riverside, 'cancelled', 'Suite 215',
   'Tenant requested cleanout but resolved internally before job date.',
   now() - interval '10 days', NULL,
   200.00, NULL,
   NULL, 'Cancelled by client - tenant moved items themselves.',
   NULL,
   now() - interval '12 days'),


  -- PEACHTREE PLAZA - 4 jobs
  (j_pea_comp1, p_peachtree, 'completed', 'Bay 7 - Former Nail Salon',
   'Full retail tenant cleanout. Pedicure chairs, shelving, salon equipment.',
   now() - interval '38 days', now() - interval '37 days',
   520.00, 520.00,
   '8x pedicure chairs, 6x manicure stations, 3x hair dryer chairs, shelving units, mirrors, retail display racks, bags of product inventory',
   'Pedicure chairs are very heavy - required appliance dolly and extra time. Job ran 30 min over but fit within original quote.',
   'Service road east side. Gate code from Diana: 4821. Bay 7 is mid-center.',
   now() - interval '39 days'),

  (j_pea_comp2, p_peachtree, 'completed', 'Bay 14 - Former Restaurant',
   'Restaurant equipment and debris after tenant defaulted.',
   now() - interval '10 days', now() - interval '9 days',
   875.00, 920.00,
   'Commercial refrigerator (x2), prep tables (x4), shelving, hood vent system, deep fryer (x2), dish racks, boxes of miscellaneous kitchen items, ~15 bags of food waste/debris',
   'Food waste bags required extra care - bagged separately. Appliances were heavy - 3-man crew. $45 overage for food waste handling.',
   'Service road east side. Diana met crew at 7am for access.',
   now() - interval '11 days'),

  (j_pea_open1, p_peachtree, 'open', 'Bay 3 - Former Clothing Boutique',
   'Tenant vacated overnight. Left behind display fixtures, clothing racks, boxes.',
   NULL, NULL,
   NULL, NULL,
   NULL, NULL,
   'Service road east side. Gate code from Diana.',
   now() + interval '5 days'),

  (j_pea_open2, p_peachtree, 'open', 'Bay 19 - Parking Lot Debris',
   'Recurring quarterly lot cleanup. Shopping carts, debris, abandoned items near dumpsters.',
   NULL, NULL,
   NULL, NULL,
   NULL, NULL,
   'Open lot access. Diana does not need to be present.',
   now() + interval '8 days'),


  -- SUNSET SELF-STORAGE - 3 jobs
  (j_sun_comp1, p_sunset, 'completed', 'Units 44, 67, 71',
   'Three abandoned unit cleanouts. All past 90-day lien period.',
   now() - interval '25 days', now() - interval '24 days',
   640.00, 640.00,
   'Unit 44: furniture set, appliances. Unit 67: boxes of household items (~40 boxes). Unit 71: exercise equipment, tires, misc tools.',
   'All three units cleared in a single day. Crew of 3. Roger had all units unlocked and ready.',
   'Roger meets crew at front gate at 7am. Master key for all units.',
   now() - interval '26 days'),

  (j_sun_sched1, p_sunset, 'scheduled', 'Units 12, 88',
   'Two more abandoned unit cleanouts - just passed lien period.',
   now() + interval '6 days', NULL,
   380.00, NULL,
   NULL, NULL,
   'Roger will have units cleared for access morning of job.',
   now() + interval '5 days'),

  (j_sun_cancel1, p_sunset, 'cancelled', 'Unit 33',
   'Lien cleanout - tenant paid balance before removal date.',
   now() - interval '5 days', NULL,
   180.00, NULL,
   NULL, 'Cancelled - tenant settled account and removed items.',
   NULL,
   now() - interval '7 days'),


  -- BROOKHAVEN CONDOS - 3 jobs
  (j_brk_comp1, p_brookhaven, 'completed', 'Unit 4B',
   'Move-out cleanout. Full unit including outdoor storage locker.',
   now() - interval '8 days', now() - interval '7 days',
   490.00, 490.00,
   'Queen bed set, dining set (table + 6 chairs), sectional sofa, 2x dressers, outdoor furniture (from storage locker), ~12 bags of household items',
   'Freight elevator reserved by Lisa - smooth access. Storage locker was packed but all one trip.',
   'Freight elevator reservation with Lisa. Unit 4B is 4th floor.',
   now() - interval '9 days'),

  (j_brk_inprog, p_brookhaven, 'in_progress', 'Common Areas - Lobby + Pool Deck',
   'HOA annual common area refresh. Old furniture, planters, and debris removal.',
   now(), NULL,
   310.00, NULL,
   NULL, NULL,
   'Lisa will be on-site. Freight elevator available. Pool deck accessible from rear.',
   now()),

  (j_brk_open1, p_brookhaven, 'open', 'Unit 11A',
   'Pending eviction cleanout - court date next week. Pre-schedule for following week.',
   NULL, NULL,
   NULL, NULL,
   NULL, NULL,
   'Coordinate with Lisa once eviction is confirmed. Freight elevator must be reserved 48 hrs in advance.',
   now() + interval '12 days');


  -- ── 6. Invoices ──────────────────────────────────────────────

  INSERT INTO invoices (invoice_number, job_id, property_id, amount, due_date, status) VALUES

  -- Oakwood (paid historical)
  ('INV-2025-001', j_oak_comp1, p_oakwood, 450.00, (now() - interval '55 days')::date, 'paid'),
  ('INV-2025-002', j_oak_comp2, p_oakwood, 275.00, (now() - interval '38 days')::date, 'paid'),
  ('INV-2025-003', j_oak_comp3, p_oakwood, 195.00, (now() - interval '23 days')::date, 'paid'),
  ('INV-2025-004', j_oak_comp4, p_oakwood, 600.00, (now() - interval '7 days')::date,  'outstanding'),

  -- Riverside (mix of paid + overdue)
  ('INV-2025-005', j_riv_comp1, p_riverside, 350.00, (now() - interval '48 days')::date, 'paid'),
  ('INV-2025-006', j_riv_comp2, p_riverside, 720.00, (now() - interval '12 days')::date, 'overdue'),

  -- Peachtree (paid + outstanding)
  ('INV-2025-007', j_pea_comp1, p_peachtree, 520.00, (now() - interval '31 days')::date, 'paid'),
  ('INV-2025-008', j_pea_comp2, p_peachtree, 920.00, (now() - interval '2 days')::date,  'outstanding'),

  -- Sunset
  ('INV-2025-009', j_sun_comp1, p_sunset, 640.00, (now() - interval '18 days')::date, 'paid'),

  -- Brookhaven
  ('INV-2025-010', j_brk_comp1, p_brookhaven, 490.00, (now() - interval '1 day')::date, 'outstanding'),

  -- Draft invoice for the upcoming Oakwood double-unit job
  ('INV-2025-011', j_oak_sched1, p_oakwood, 325.00, (now() + interval '10 days')::date, 'draft'),
  ('INV-2025-012', j_oak_sched2, p_oakwood, 550.00, (now() + interval '14 days')::date, 'draft');


  RAISE NOTICE 'Demo seed complete for jonathanlapinsky1@gmail.com (client_id: %)', v_client_id;
  RAISE NOTICE 'Properties: 5 | Jobs: 23 | Invoices: 12';

END $$;
