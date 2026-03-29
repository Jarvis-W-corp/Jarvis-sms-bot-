import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';
import { MealSlot } from '../types';

interface MealSlotCardProps {
  meal: MealSlot;
  dark?: boolean;
  onScan?: () => void;
  onPress?: () => void;
}

export default function MealSlotCard({ meal, dark = true, onScan, onPress }: MealSlotCardProps) {
  const filled = !!meal.food;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.container, {
        backgroundColor: dark ? Colors.card : Colors.cardLight,
        borderColor: dark ? Colors.border : Colors.borderLight,
        borderStyle: filled ? 'solid' : 'dashed',
        opacity: filled ? 1 : 0.55,
      }]}
    >
      <View style={[styles.icon, { backgroundColor: meal.bg }]}>
        <Text style={{ fontSize: 18 }}>{meal.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, {
          color: filled ? (dark ? Colors.t1 : Colors.t1Light) : (dark ? Colors.t3 : Colors.t3Light),
        }]}>
          {filled ? meal.food : meal.name}
        </Text>
        <View style={styles.meta}>
          <Text style={{ fontSize: 10, color: dark ? Colors.t3 : Colors.t3Light }}>
            {meal.name} · {meal.time}
          </Text>
          {meal.ai && (
            <View style={styles.aiTag}>
              <Text style={styles.aiTagText}>📷 AI · 96%</Text>
            </View>
          )}
        </View>
      </View>
      {filled ? (
        <Text style={styles.kcal}>{meal.kcal}</Text>
      ) : (
        <View style={styles.quickActions}>
          {['📷', '🔲', '🔍', '↻'].map((ic, i) => (
            <TouchableOpacity
              key={i}
              onPress={i === 0 ? onScan : undefined}
              style={[styles.quickBtn, {
                backgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
              }]}
            >
              <Text style={{ fontSize: 12 }}>{ic}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, paddingHorizontal: 14, borderRadius: 14,
    marginBottom: 7, borderWidth: 1,
  },
  icon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: 13, fontWeight: '600', marginBottom: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiTag: {
    backgroundColor: Colors.emberDim, paddingHorizontal: 5,
    paddingVertical: 2, borderRadius: 3,
  },
  aiTagText: { fontSize: 8, fontWeight: '700', color: Colors.emberLight },
  kcal: { fontSize: 13, fontWeight: '600', color: Colors.emberLight },
  quickActions: { flexDirection: 'row', gap: 4 },
  quickBtn: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
});
