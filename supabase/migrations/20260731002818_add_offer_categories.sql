-- Create missing categories that exist as text in offers
INSERT INTO categories (id, name, slug, active, created_at)
VALUES
  (gen_random_uuid(), 'Café',     'cafe',     true, now()),
  (gen_random_uuid(), 'Italiana', 'italiana', true, now()),
  (gen_random_uuid(), 'Japonesa', 'japonesa', true, now()),
  (gen_random_uuid(), 'Sorpresa', 'sorpresa', true, now())
ON CONFLICT (slug) DO NOTHING;

-- Create junction table
CREATE TABLE offer_categories (
  offer_id    uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (offer_id, category_id)
);

-- Migrate existing data: map text category → category_id
INSERT INTO offer_categories (offer_id, category_id)
SELECT o.id, c.id
FROM offers o
JOIN categories c ON o.category = c.name;

-- Drop old text column
ALTER TABLE offers DROP COLUMN category;
