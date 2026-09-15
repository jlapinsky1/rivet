-- Location geocode cache (no full PII - address lives on booking)
CREATE TABLE location_cache (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address_hash      TEXT NOT NULL UNIQUE,
  lat               NUMERIC(10,7),
  lng               NUMERIC(10,7),
  formatted_address TEXT,
  provider          TEXT DEFAULT 'google',
  cached_at         TIMESTAMPTZ DEFAULT now()
);

-- Directional travel cache (A→B may differ from B→A)
CREATE TABLE travel_cache (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_hash      TEXT NOT NULL,
  destination_hash TEXT NOT NULL,
  distance_miles   NUMERIC(8,1),
  duration_minutes INTEGER,
  cached_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(origin_hash, destination_hash)
);

-- Geocoding status on bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS geocoded_lat NUMERIC(10,7);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS geocoded_lng NUMERIC(10,7);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS geocoding_status TEXT DEFAULT 'pending'
  CHECK (geocoding_status IN ('pending','success','failed'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS geocoding_attempted_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS geocoding_error TEXT;

-- RLS: admin read only (writes via service role in Netlify functions)
ALTER TABLE location_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read_location" ON location_cache
  FOR SELECT USING (auth.uid() IN (SELECT user_id FROM admin_users));

ALTER TABLE travel_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read_travel" ON travel_cache
  FOR SELECT USING (auth.uid() IN (SELECT user_id FROM admin_users));
