-- Normalize existing category values to Spanish display names
UPDATE offers SET category = 'Panadería' WHERE category ILIKE 'bakery';
UPDATE offers SET category = 'Restaurante' WHERE category ILIKE 'restaurant';
UPDATE offers SET category = 'Café' WHERE category ILIKE 'cafe';
UPDATE offers SET category = 'Mercado' WHERE category ILIKE 'grocery';
UPDATE offers SET category = 'Pastelería' WHERE category ILIKE 'pastry';
UPDATE offers SET category = 'Asiática' WHERE category ILIKE 'asian';
UPDATE offers SET category = 'Italiana' WHERE category ILIKE 'italian';
UPDATE offers SET category = 'Saludable' WHERE category ILIKE 'healthy';
UPDATE offers SET category = 'Japonesa' WHERE category ILIKE 'japanese';

-- Migrate user_preferences favorite_categories using a subquery
UPDATE user_preferences
SET favorite_categories = (
  SELECT array_agg(
    CASE
      WHEN lower(cat) = 'bakery' THEN 'Panadería'
      WHEN lower(cat) = 'restaurant' THEN 'Restaurante'
      WHEN lower(cat) = 'cafe' THEN 'Café'
      WHEN lower(cat) = 'grocery' THEN 'Mercado'
      WHEN lower(cat) = 'pastry' THEN 'Pastelería'
      WHEN lower(cat) = 'asian' THEN 'Asiática'
      WHEN lower(cat) = 'italian' THEN 'Italiana'
      WHEN lower(cat) = 'healthy' THEN 'Saludable'
      WHEN lower(cat) = 'japanese' THEN 'Japonesa'
      ELSE cat
    END
  )
  FROM unnest(favorite_categories) AS cat
)
WHERE favorite_categories IS NOT NULL;