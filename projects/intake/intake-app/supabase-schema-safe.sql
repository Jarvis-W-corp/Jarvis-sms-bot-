-- =============================================================
-- Intake App Database Schema (SAFE RE-RUN VERSION)
-- Drops existing policies before recreating
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Tables (IF NOT EXISTS = safe to re-run)
CREATE TABLE IF NOT EXISTS intake_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  age INTEGER,
  gender TEXT DEFAULT 'male',
  height_inches INTEGER,
  weight_lbs DECIMAL,
  goal TEXT DEFAULT 'lose' CHECK (goal IN ('lose', 'maintain', 'gain')),
  activity_level TEXT DEFAULT 'moderate' CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  calorie_target INTEGER DEFAULT 2000,
  protein_target INTEGER DEFAULT 150,
  carb_target INTEGER DEFAULT 200,
  fat_target INTEGER DEFAULT 65,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'plus', 'pro')),
  streak INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intake_food_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES intake_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  serving_size TEXT DEFAULT '1 serving',
  servings DECIMAL DEFAULT 1,
  calories INTEGER DEFAULT 0,
  protein DECIMAL DEFAULT 0,
  carbs DECIMAL DEFAULT 0,
  fat DECIMAL DEFAULT 0,
  fiber DECIMAL,
  sugar DECIMAL,
  sodium DECIMAL,
  meal_type TEXT DEFAULT 'snack' CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'scan', 'barcode', 'search', 'template', 'restaurant')),
  image_url TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intake_weight_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES intake_profiles(id) ON DELETE CASCADE,
  weight_lbs DECIMAL NOT NULL,
  body_fat_pct DECIMAL,
  notes TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intake_water_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES intake_profiles(id) ON DELETE CASCADE,
  amount_oz DECIMAL NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intake_workout_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES intake_profiles(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'strength' CHECK (type IN ('strength', 'cardio')),
  name TEXT NOT NULL,
  duration_min INTEGER,
  calories_burned INTEGER,
  exercises JSONB DEFAULT '[]',
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intake_meal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES intake_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  foods JSONB DEFAULT '[]',
  total_calories INTEGER DEFAULT 0,
  total_protein DECIMAL DEFAULT 0,
  total_carbs DECIMAL DEFAULT 0,
  total_fat DECIMAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intake_food_database (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT,
  serving_size TEXT DEFAULT '100g',
  calories INTEGER DEFAULT 0,
  protein DECIMAL DEFAULT 0,
  carbs DECIMAL DEFAULT 0,
  fat DECIMAL DEFAULT 0,
  fiber DECIMAL,
  sugar DECIMAL,
  sodium DECIMAL,
  category TEXT,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_intake_food_entries_user_date ON intake_food_entries(user_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_intake_weight_entries_user_date ON intake_weight_entries(user_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_intake_water_entries_user_date ON intake_water_entries(user_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_intake_workout_entries_user_date ON intake_workout_entries(user_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_intake_food_database_name ON intake_food_database USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_intake_food_database_barcode ON intake_food_database(barcode);
CREATE INDEX IF NOT EXISTS idx_intake_meal_templates_user ON intake_meal_templates(user_id);

-- ROW LEVEL SECURITY
ALTER TABLE intake_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_food_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_weight_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_water_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_workout_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_meal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_food_database ENABLE ROW LEVEL SECURITY;

-- DROP ALL EXISTING POLICIES FIRST
DROP POLICY IF EXISTS "Users can view own profile" ON intake_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON intake_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON intake_profiles;
DROP POLICY IF EXISTS "Users can view own food entries" ON intake_food_entries;
DROP POLICY IF EXISTS "Users can insert own food entries" ON intake_food_entries;
DROP POLICY IF EXISTS "Users can delete own food entries" ON intake_food_entries;
DROP POLICY IF EXISTS "Users can update own food entries" ON intake_food_entries;
DROP POLICY IF EXISTS "Users can view own weight entries" ON intake_weight_entries;
DROP POLICY IF EXISTS "Users can insert own weight entries" ON intake_weight_entries;
DROP POLICY IF EXISTS "Users can view own water entries" ON intake_water_entries;
DROP POLICY IF EXISTS "Users can insert own water entries" ON intake_water_entries;
DROP POLICY IF EXISTS "Users can view own workouts" ON intake_workout_entries;
DROP POLICY IF EXISTS "Users can insert own workouts" ON intake_workout_entries;
DROP POLICY IF EXISTS "Users can delete own workouts" ON intake_workout_entries;
DROP POLICY IF EXISTS "Users can view own templates" ON intake_meal_templates;
DROP POLICY IF EXISTS "Users can insert own templates" ON intake_meal_templates;
DROP POLICY IF EXISTS "Users can delete own templates" ON intake_meal_templates;
DROP POLICY IF EXISTS "Anyone can search food database" ON intake_food_database;

-- RECREATE POLICIES
CREATE POLICY "Users can view own profile" ON intake_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON intake_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON intake_profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own food entries" ON intake_food_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own food entries" ON intake_food_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own food entries" ON intake_food_entries FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update own food entries" ON intake_food_entries FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own weight entries" ON intake_weight_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own weight entries" ON intake_weight_entries FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own water entries" ON intake_water_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own water entries" ON intake_water_entries FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own workouts" ON intake_workout_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own workouts" ON intake_workout_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own workouts" ON intake_workout_entries FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own templates" ON intake_meal_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own templates" ON intake_meal_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates" ON intake_meal_templates FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Anyone can search food database" ON intake_food_database FOR SELECT USING (auth.role() = 'authenticated');

-- JARVIS CEO DASHBOARD VIEWS
CREATE OR REPLACE VIEW intake_business_metrics AS
SELECT
  (SELECT COUNT(*) FROM intake_profiles) AS total_users,
  (SELECT COUNT(*) FROM intake_profiles WHERE created_at > NOW() - INTERVAL '24 hours') AS signups_today,
  (SELECT COUNT(*) FROM intake_profiles WHERE created_at > NOW() - INTERVAL '7 days') AS signups_this_week,
  (SELECT COUNT(*) FROM intake_profiles WHERE subscription_tier = 'plus') AS plus_subscribers,
  (SELECT COUNT(*) FROM intake_profiles WHERE subscription_tier = 'pro') AS pro_subscribers,
  (SELECT COUNT(*) FROM intake_profiles WHERE subscription_tier != 'free') AS total_paying,
  (SELECT COUNT(DISTINCT user_id) FROM intake_food_entries WHERE logged_at > NOW() - INTERVAL '24 hours') AS active_users_today,
  (SELECT COUNT(DISTINCT user_id) FROM intake_food_entries WHERE logged_at > NOW() - INTERVAL '7 days') AS active_users_week,
  (SELECT COUNT(*) FROM intake_food_entries WHERE source = 'scan' AND logged_at > NOW() - INTERVAL '24 hours') AS ai_scans_today,
  (SELECT COUNT(*) FROM intake_food_entries) AS total_food_entries,
  (SELECT COALESCE(SUM(CASE WHEN subscription_tier = 'plus' THEN 4.99 WHEN subscription_tier = 'pro' THEN 9.99 ELSE 0 END), 0) FROM intake_profiles) AS monthly_revenue_estimate;

CREATE OR REPLACE VIEW intake_daily_active_users AS
SELECT DATE(logged_at) AS day, COUNT(DISTINCT user_id) AS active_users, COUNT(*) AS total_entries
FROM intake_food_entries WHERE logged_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(logged_at) ORDER BY day DESC;

CREATE OR REPLACE VIEW intake_feature_usage AS
SELECT source, COUNT(*) AS total_uses, COUNT(DISTINCT user_id) AS unique_users,
  COUNT(*) FILTER (WHERE logged_at > NOW() - INTERVAL '7 days') AS uses_this_week
FROM intake_food_entries GROUP BY source ORDER BY total_uses DESC;

CREATE OR REPLACE VIEW intake_conversion_funnel AS
SELECT
  (SELECT COUNT(*) FROM intake_profiles) AS total_signups,
  (SELECT COUNT(DISTINCT user_id) FROM intake_food_entries) AS users_with_first_log,
  (SELECT COUNT(DISTINCT fe.user_id) FROM intake_food_entries fe JOIN intake_profiles p ON fe.user_id = p.id WHERE fe.logged_at > p.created_at + INTERVAL '7 days') AS retained_7_days,
  (SELECT COUNT(*) FROM intake_profiles WHERE subscription_tier != 'free') AS converted_to_paid;

-- SEED DATA (ON CONFLICT DO NOTHING = safe to re-run)
INSERT INTO intake_food_database (name, serving_size, calories, protein, carbs, fat, category, verified) VALUES
  ('Chicken Breast (grilled)', '4 oz', 187, 35, 0, 4, 'protein', true),
  ('Brown Rice', '1 cup cooked', 216, 5, 45, 2, 'grain', true),
  ('Broccoli', '1 cup', 55, 4, 11, 1, 'vegetable', true),
  ('Banana', '1 medium', 105, 1, 27, 0, 'fruit', true),
  ('Eggs (whole)', '1 large', 72, 6, 0, 5, 'protein', true),
  ('Greek Yogurt (plain)', '1 cup', 130, 22, 8, 0, 'dairy', true),
  ('Salmon (baked)', '4 oz', 234, 25, 0, 14, 'protein', true),
  ('Sweet Potato', '1 medium', 103, 2, 24, 0, 'vegetable', true),
  ('Oatmeal', '1 cup cooked', 154, 5, 27, 3, 'grain', true),
  ('Almonds', '1 oz (23 nuts)', 164, 6, 6, 14, 'nuts', true),
  ('Avocado', '1/2 medium', 120, 2, 6, 11, 'fruit', true),
  ('Ground Turkey (93/7)', '4 oz', 170, 21, 0, 9, 'protein', true),
  ('White Rice', '1 cup cooked', 206, 4, 45, 0, 'grain', true),
  ('Peanut Butter', '2 tbsp', 188, 7, 6, 16, 'nuts', true),
  ('Whey Protein Shake', '1 scoop', 120, 24, 3, 1, 'supplement', true),
  ('Apple', '1 medium', 95, 0, 25, 0, 'fruit', true),
  ('Spinach (raw)', '2 cups', 14, 2, 2, 0, 'vegetable', true),
  ('Olive Oil', '1 tbsp', 119, 0, 0, 14, 'fat', true),
  ('Cottage Cheese (2%)', '1 cup', 183, 24, 10, 5, 'dairy', true),
  ('Steak (sirloin)', '6 oz', 276, 46, 0, 9, 'protein', true),
  ('Whole Wheat Bread', '1 slice', 81, 4, 14, 1, 'grain', true),
  ('Black Beans', '1/2 cup', 114, 8, 20, 0, 'legume', true),
  ('Protein Bar (avg)', '1 bar', 210, 20, 22, 7, 'supplement', true),
  ('Orange', '1 medium', 62, 1, 15, 0, 'fruit', true)
ON CONFLICT DO NOTHING;

-- AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_intake_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.intake_profiles (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_intake_user_created ON auth.users;
CREATE TRIGGER on_intake_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_intake_new_user();
