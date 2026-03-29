import { supabase } from './supabase';

export async function logWater(userId: string, amountOz: number) {
  const { data, error } = await supabase
    .from('intake_water_entries')
    .insert({
      user_id: userId,
      amount_oz: amountOz,
      logged_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getWaterToday(userId: string, date: string): Promise<number> {
  const { data, error } = await supabase
    .from('intake_water_entries')
    .select('amount_oz')
    .eq('user_id', userId)
    .gte('logged_at', `${date}T00:00:00`)
    .lte('logged_at', `${date}T23:59:59`);

  if (error) throw error;
  return (data || []).reduce((sum, e) => sum + e.amount_oz, 0);
}
