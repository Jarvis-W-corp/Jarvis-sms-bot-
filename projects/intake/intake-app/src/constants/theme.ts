// Snack AI Design System
export const Colors = {
  // Brand
  ember: '#E8622C',
  emberLight: '#F07A3F',
  emberDark: '#C94E1E',

  // Backgrounds
  bg: '#0D0D0F',
  bgLight: '#F5F5F7',
  card: '#1A1A1E',
  cardLight: '#FFFFFF',
  cardHover: '#222226',
  cardHoverLight: '#F0F0F2',
  elevated: '#252529',

  // Text
  t1: '#F5F5F7',
  t1Light: '#1A1A1E',
  t2: '#9D9DA3',
  t2Light: '#6B6B73',
  t3: '#6B6B73',
  t3Light: '#9D9DA3',

  // Semantic
  green: '#34C759',
  blue: '#5AC8FA',
  purple: '#BF5AF2',
  yellow: '#FFD60A',
  red: '#FF453A',
  cyan: '#64D2FF',

  // Dim variants (12% opacity backgrounds)
  greenDim: 'rgba(52,199,89,0.12)',
  blueDim: 'rgba(90,200,250,0.12)',
  purpleDim: 'rgba(191,90,242,0.12)',
  yellowDim: 'rgba(255,214,10,0.12)',
  emberDim: 'rgba(232,98,44,0.12)',
  redDim: 'rgba(255,69,58,0.12)',
  cyanDim: 'rgba(100,210,255,0.12)',

  // Borders
  border: 'rgba(255,255,255,0.04)',
  borderLight: 'rgba(0,0,0,0.06)',
  borderEmber: 'rgba(232,98,44,0.2)',
};

// Macro colors (consistent across all screens)
export const MacroColors = {
  calories: Colors.emberLight,
  protein: Colors.blue,
  carbs: Colors.emberLight,
  fat: Colors.purple,
  burned: Colors.cyan,
  water: Colors.blue,
};

export const Spacing = {
  xs: 3,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const FontSize = {
  micro: 8,
  xs: 9,
  sm: 10,
  md: 11,
  body: 12,
  lg: 13,
  xl: 14,
  xxl: 16,
  h3: 18,
  h2: 22,
  h1: 26,
  hero: 34,
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const BorderRadius = {
  xs: 3,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 14,
  card: 16,
  hero: 22,
  pill: 7,
  full: 999,
};

// Tier colors
export const TierColors = {
  free: { color: Colors.green, bg: Colors.greenDim, label: '☀️ Snack AI Free', badge: 'FOREVER' },
  plus: { color: Colors.blue, bg: Colors.blueDim, label: '⚡ Snack AI Plus', badge: 'MOST POPULAR' },
  pro: { color: Colors.purple, bg: Colors.purpleDim, label: '👑 Snack AI Pro', badge: 'BEST VALUE' },
};

// Gradient helpers
export const Gradients = {
  ember: ['#E8622C', '#C94E1E'] as [string, string],
  plus: ['#4A9CF5', '#5AC8FA'] as [string, string],
  pro: ['#9B59F2', '#BF5AF2'] as [string, string],
  insight: ['rgba(232,98,44,0.08)', 'rgba(191,90,242,0.06)'] as [string, string],
};
