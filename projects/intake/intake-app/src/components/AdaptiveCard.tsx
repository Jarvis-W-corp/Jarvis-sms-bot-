import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

interface AdaptiveCardProps {
  dark?: boolean;
  name: string;
  target: number;
}

export default function AdaptiveCard({ dark = true, name, target }: AdaptiveCardProps) {
  return (
    <View style={[styles.container, {
      backgroundColor: dark ? Colors.card : Colors.cardLight,
      borderColor: dark ? 'rgba(52,199,89,0.15)' : 'rgba(52,199,89,0.2)',
    }]}>
      <View style={styles.header}>
        <Text style={{ fontSize: 14 }}>🧠</Text>
        <Text style={[styles.title, { color: dark ? Colors.t1 : Colors.t1Light }]}>
          Adaptive Intelligence
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>WEEK 2</Text>
        </View>
      </View>
      <Text style={[styles.body, { color: dark ? Colors.t2 : Colors.t2Light }]}>
        {name}, I noticed you eat{' '}
        <Text style={{ color: Colors.emberLight, fontWeight: '600' }}>73% of your protein</Text>
        {' '}at dinner. Spreading it across meals improves absorption. I've adjusted your daily target from {target} to {target - 50} kcal based on your weight trend this week.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16, padding: 16, marginBottom: 10,
    borderWidth: 1, borderLeftWidth: 3, borderLeftColor: Colors.green,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 12, fontWeight: '600' },
  badge: {
    marginLeft: 'auto', backgroundColor: Colors.greenDim,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3,
  },
  badgeText: { fontSize: 8, fontWeight: '700', color: Colors.green },
  body: { fontSize: 11, lineHeight: 16.5 },
});
