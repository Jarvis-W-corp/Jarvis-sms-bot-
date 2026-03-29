import { supabase } from './supabase';
import { WorkoutEntry } from '../types';

export async function logWorkout(entry: Omit<WorkoutEntry, 'id'>): Promise<WorkoutEntry> {
  const { data, error } = await supabase
    .from('intake_workout_entries')
    .insert(entry)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getWorkouts(userId: string, date: string): Promise<WorkoutEntry[]> {
  const { data, error } = await supabase
    .from('intake_workout_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('date', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function deleteWorkout(id: string): Promise<void> {
  const { error } = await supabase.from('intake_workout_entries').delete().eq('id', id);
  if (error) throw error;
}
