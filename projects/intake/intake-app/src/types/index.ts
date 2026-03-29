export type Goal = 'lose' | 'maintain' | 'gain' | 'health';
export type ActivityLevel = 1.2 | 1.375 | 1.55 | 1.725;
export type SnackHabit = 'yes' | 'sometimes' | 'no';
export type TrackingExp = 'new' | 'tried' | 'onoff' | 'expert';
export type Priority = 'accuracy' | 'speed' | 'learning' | 'planning' | 'macros';
export type SubscriptionTier = 'free' | 'plus' | 'pro';
export type BillingCycle = 'annual' | 'monthly';
export type Units = 'imp' | 'met';
export type MealSlotType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Meal 4';
export type LogMethod = 'ai' | 'barcode' | 'search' | 'voice' | 'template' | 'restaurant' | 'manual';

export interface UserProfile {
  id: string;
  name: string;
  age: number;
  units: Units;
  height: number; // inches if imp, cm if met
  weight: number; // lbs if imp, kg if met
  goalWeight: number;
  goal: Goal;
  activity: ActivityLevel;
  diet: string[];
  meals: number;
  snack: SnackHabit;
  exp: TrackingExp;
  priorities: Priority[];
  tier: SubscriptionTier;
  billing: BillingCycle;
  // Computed
  tdee: number;
  target: number;
  protein: number;
  carbs: number;
  fat: number;
  waterGoal: number;
  email: string;
  created_at: string;
}

export interface MealEntry {
  id: string;
  user_id: string;
  date: string;
  slot: MealSlotType;
  food: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  method: LogMethod;
  confidence?: number;
  image_url?: string;
  logged_at: string;
}

export interface WeightEntry {
  id: string;
  user_id: string;
  weight: number;
  date: string;
}

export interface WorkoutEntry {
  id: string;
  user_id: string;
  date: string;
  name: string;
  sets?: string;
  weight_used?: string;
  calories_burned: number;
  duration_min: number;
  is_pr: boolean;
}

export interface MealTemplate {
  id: string;
  user_id: string;
  name: string;
  food: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  use_count: number;
}

export interface DailySummary {
  date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  water: number;
  steps: number;
  calories_burned: number;
}

export interface ScanResult {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  serving_size?: string;
  portion_grams?: number;
  dietary_warnings?: string[];
  depth_active?: boolean;
}

export interface MealSlot {
  name: MealSlotType;
  time: string;
  icon: string;
  bg: string;
  food?: string;
  kcal?: number;
  ai?: boolean;
}

export interface TDEEData {
  estimated_tdee: number;
  confidence: number;
  data_points: number;
  adjustment: number; // difference from static calculation
  last_updated: string;
}
