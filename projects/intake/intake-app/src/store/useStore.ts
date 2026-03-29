import { create } from 'zustand';
import {
  UserProfile, MealEntry, WorkoutEntry, DailySummary,
  SubscriptionTier, Goal, ActivityLevel, Priority, MealSlot,
} from '../types';
import { Colors } from '../constants/theme';

interface RecentFood {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface AppState {
  // Auth
  user: UserProfile | null;
  session: any | null;
  setUser: (user: UserProfile | null) => void;
  setSession: (session: any | null) => void;

  // Onboarding (temporary state during setup)
  onboarding: {
    name: string;
    age: number;
    units: 'imp' | 'met';
    height: number;
    weight: number;
    goalWeight: number;
    goal: Goal;
    activity: ActivityLevel;
    diet: string[];
    meals: number;
    snack: 'yes' | 'sometimes' | 'no';
    exp: 'new' | 'tried' | 'onoff' | 'expert';
    priorities: Priority[];
    tier: SubscriptionTier;
    billing: 'annual' | 'monthly';
  };
  updateOnboarding: (key: string, value: any) => void;

  // Daily tracking
  todayMeals: MealEntry[];
  todayWorkouts: WorkoutEntry[];
  todaySummary: DailySummary | null;
  setTodayMeals: (meals: MealEntry[]) => void;
  addMeal: (meal: MealEntry) => void;
  removeMeal: (id: string) => void;
  setTodayWorkouts: (workouts: WorkoutEntry[]) => void;
  addWorkout: (workout: WorkoutEntry) => void;

  // Water
  water: number;
  addWater: () => void;

  // Subscription
  subscription: SubscriptionTier;
  setSubscription: (tier: SubscriptionTier) => void;

  // Recent foods
  recentFoods: RecentFood[];
  addRecentFood: (food: RecentFood) => void;

  // UI
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  dark: boolean;
  toggleTheme: () => void;

  // Streak
  streak: number;
  setStreak: (streak: number) => void;

  // Helpers
  getMealSlots: () => MealSlot[];
  getEaten: () => { calories: number; protein: number; carbs: number; fat: number };
  getBurned: () => number;
}

const today = new Date().toISOString().split('T')[0];

export const useStore = create<AppState>((set, get) => ({
  // Auth
  user: null,
  session: null,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),

  // Onboarding
  onboarding: {
    name: '',
    age: 28,
    units: 'imp',
    height: 70,
    weight: 185,
    goalWeight: 175,
    goal: 'maintain',
    activity: 1.55,
    diet: [],
    meals: 3,
    snack: 'sometimes',
    exp: 'onoff',
    priorities: [],
    tier: 'free',
    billing: 'annual',
  },
  updateOnboarding: (key, value) => set((s) => ({
    onboarding: { ...s.onboarding, [key]: value },
  })),

  // Daily tracking
  todayMeals: [],
  todayWorkouts: [],
  todaySummary: null,
  setTodayMeals: (meals) => set({ todayMeals: meals }),
  addMeal: (meal) => set((s) => ({ todayMeals: [...s.todayMeals, meal] })),
  removeMeal: (id) => set((s) => ({
    todayMeals: s.todayMeals.filter((m) => m.id !== id),
  })),
  setTodayWorkouts: (workouts) => set({ todayWorkouts: workouts }),
  addWorkout: (workout) => set((s) => ({
    todayWorkouts: [...s.todayWorkouts, workout],
  })),

  // Water
  water: 0,
  addWater: () => set((s) => ({ water: s.water + 1 })),

  // Subscription
  subscription: 'free',
  setSubscription: (tier) => set({ subscription: tier }),

  // Recent foods
  recentFoods: [],
  addRecentFood: (food) => set((s) => {
    const filtered = s.recentFoods.filter((f) => f.name !== food.name);
    return { recentFoods: [food, ...filtered].slice(0, 20) };
  }),

  // UI
  selectedDate: today,
  setSelectedDate: (date) => set({ selectedDate: date }),
  dark: true,
  toggleTheme: () => set((s) => ({ dark: !s.dark })),

  // Streak
  streak: 0,
  setStreak: (streak) => set({ streak }),

  // Helpers
  getMealSlots: () => {
    const { user, onboarding, todayMeals } = get();
    const meals = user?.meals || onboarding.meals;
    const snack = user?.snack || onboarding.snack;

    const slots: MealSlot[] = [
      { name: 'Breakfast', time: '8:15 AM', icon: '🥑', bg: Colors.emberDim },
      { name: 'Lunch', time: '12:30 PM', icon: '🥗', bg: Colors.blueDim },
      { name: 'Dinner', time: '7:00 PM', icon: '🍽️', bg: Colors.emberDim },
    ];

    const result = slots.slice(0, Math.min(meals, 3));
    if (meals >= 4) result.push({ name: 'Meal 4', time: '4:00 PM', icon: '🥤', bg: Colors.purpleDim });
    if (snack === 'yes' || snack === 'sometimes') {
      result.push({ name: 'Snack', time: '3:00 PM', icon: '🍎', bg: Colors.greenDim });
    }

    // Fill in logged meals
    return result.map((slot) => {
      const logged = todayMeals.find((m) => m.slot === slot.name);
      if (logged) {
        return {
          ...slot,
          food: logged.food,
          kcal: logged.calories,
          ai: logged.method === 'ai',
        };
      }
      return slot;
    });
  },

  getEaten: () => {
    const { todayMeals } = get();
    return {
      calories: todayMeals.reduce((s, m) => s + m.calories, 0),
      protein: todayMeals.reduce((s, m) => s + m.protein, 0),
      carbs: todayMeals.reduce((s, m) => s + m.carbs, 0),
      fat: todayMeals.reduce((s, m) => s + m.fat, 0),
    };
  },

  getBurned: () => {
    const { todayWorkouts } = get();
    return todayWorkouts.reduce((s, w) => s + w.calories_burned, 0);
  },
}));

// TDEE Calculation
export function calculateTargets(
  weight: number, height: number, age: number,
  goal: Goal, activity: ActivityLevel, units: 'imp' | 'met',
) {
  const wKg = units === 'imp' ? weight * 0.453592 : weight;
  const hCm = units === 'imp' ? height * 2.54 : height;
  const bmr = 10 * wKg + 6.25 * hCm - 5 * age + 5; // Mifflin-St Jeor (male)
  const tdee = Math.round(bmr * activity);

  let target = tdee;
  if (goal === 'lose') target = tdee - 500;
  if (goal === 'gain') target = tdee + 300;
  target = Math.round(target / 50) * 50;

  let protein: number, fat: number;
  if (goal === 'gain') {
    protein = Math.round(wKg * 2.0);
    fat = Math.round(target * 0.25 / 9);
  } else if (goal === 'lose') {
    protein = Math.round(wKg * 1.8);
    fat = Math.round(target * 0.25 / 9);
  } else {
    protein = Math.round(wKg * 1.6);
    fat = Math.round(target * 0.28 / 9);
  }
  const carbs = Math.round((target - protein * 4 - fat * 9) / 4);

  return { tdee, target, protein, carbs, fat };
}
