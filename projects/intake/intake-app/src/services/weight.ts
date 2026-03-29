import { supabase } from './supabase';
import { WeightEntry } from '../types';

export async function logWeight(userId: string, weight: number): Promise<WeightEntry> {
  const { data, error } = await supabase
    .from('intake_weight_entries')
    .insert({
      user_id: userId,
      weight,
      date: new Date().toISOString().split('T')[0],
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getWeightHistory(userId: string, days: number = 90): Promise<WeightEntry[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('intake_weight_entries')
    .select('*')
    .eq('user_id', userId)
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Adaptive TDEE calculation
export function calculateAdaptiveTDEE(
  weightHistory: WeightEntry[],
  calorieHistory: { date: string; calories: number }[],
) {
  if (weightHistory.length < 14 || calorieHistory.length < 14) return null;

  const recent = weightHistory.slice(-7);
  const prior = weightHistory.slice(-14, -7);
  const recentAvg = recent.reduce((s, w) => s + w.weight, 0) / recent.length;
  const priorAvg = prior.reduce((s, w) => s + w.weight, 0) / prior.length;
  const weeklyChange = recentAvg - priorAvg;
  const dailySurplusDeficit = (weeklyChange * 3500) / 7;

  const recentCalories = calorieHistory.slice(-14);
  const avgIntake = recentCalories.reduce((s, c) => s + c.calories, 0) / recentCalories.length;

  return {
    estimated_tdee: Math.round(avgIntake - dailySurplusDeficit),
    confidence: Math.min(0.95, 0.5 + (weightHistory.length / 100)),
    data_points: weightHistory.length,
    adjustment: 0,
    last_updated: new Date().toISOString(),
  };
}
