import { supabase } from './supabase';
import { MealEntry } from '../types';

export async function logFood(entry: Omit<MealEntry, 'id' | 'logged_at'>): Promise<MealEntry> {
  const { data, error } = await supabase
    .from('intake_food_entries')
    .insert({ ...entry, logged_at: new Date().toISOString() })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getFoodEntries(userId: string, date: string): Promise<MealEntry[]> {
  const startOfDay = `${date}T00:00:00`;
  const endOfDay = `${date}T23:59:59`;

  const { data, error } = await supabase
    .from('intake_food_entries')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_at', startOfDay)
    .lte('logged_at', endOfDay)
    .order('logged_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function deleteFood(id: string): Promise<void> {
  const { error } = await supabase.from('intake_food_entries').delete().eq('id', id);
  if (error) throw error;
}

export async function searchFoods(query: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('intake_food_database')
    .select('*')
    .ilike('name', `%${query}%`)
    .limit(20);

  if (error) throw error;
  return data || [];
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://jarvis-sms-bot.onrender.com';

export async function scanFoodWithAI(imageBase64: string): Promise<{
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  serving_size?: string;
}> {
  const res = await fetch(`${API_URL}/api/bitelens/scan-food`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 }),
  });
  if (!res.ok) throw new Error('Scan failed: ' + res.status);
  return res.json();
}

export async function parseFoodWithAI(text: string): Promise<{
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  serving_size?: string;
}> {
  const res = await fetch(`${API_URL}/api/bitelens/parse-food`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Parse failed: ' + res.status);
  return res.json();
}

export async function lookupBarcode(upc: string): Promise<any | null> {
  const { data } = await supabase
    .from('intake_food_database')
    .select('*')
    .eq('barcode', upc)
    .single();

  if (data) return data;

  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${upc}.json`);
    const json = await res.json();
    if (json.status === 1 && json.product) {
      const p = json.product;
      const n = p.nutriments || {};
      return {
        name: p.product_name || 'Unknown Product',
        brand: p.brands || '',
        barcode: upc,
        serving_size: p.serving_size || '1 serving',
        calories: Math.round(n['energy-kcal_serving'] || n['energy-kcal_100g'] || 0),
        protein: Math.round(n.proteins_serving || n.proteins_100g || 0),
        carbs: Math.round(n.carbohydrates_serving || n.carbohydrates_100g || 0),
        fat: Math.round(n.fat_serving || n.fat_100g || 0),
      };
    }
  } catch { /* user can manually enter */ }
  return null;
}
