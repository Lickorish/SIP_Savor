-- Sip & Savour database schema
-- Run this once against your Railway Postgres instance, or let the app auto-migrate on start

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS establishments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('coffee', 'restaurant', 'pub', 'bakery', 'bar', 'cafe', 'other')),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100) DEFAULT 'UK',
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  added_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER REFERENCES establishments(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  visited_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_photos (
  id SERIAL PRIMARY KEY,
  review_id INTEGER REFERENCES reviews(id) ON DELETE CASCADE,
  cloudinary_url TEXT NOT NULL,
  cloudinary_public_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for geo searches
CREATE INDEX IF NOT EXISTS idx_establishments_lat_lng ON establishments(lat, lng);
CREATE INDEX IF NOT EXISTS idx_establishments_name ON establishments USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_establishments_city ON establishments(city);
CREATE INDEX IF NOT EXISTS idx_reviews_establishment ON reviews(establishment_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
