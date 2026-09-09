-- Create Mason Home Services demo user
-- Run this in Supabase SQL Editor AFTER schema.sql
--
-- Login credentials:
--   Email:    mason@myrivet.io
--   Password: MasonDemo2024!

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'mason@myrivet.io',
  crypt('MasonDemo2024!', gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"business_id": "mason-home-services", "display_name": "Mason"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
);

-- Also insert into auth.identities (required by Supabase Auth)
insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  id,
  jsonb_build_object('sub', id::text, 'email', email),
  'email',
  id::text,
  now(),
  now(),
  now()
from auth.users
where email = 'mason@myrivet.io';
