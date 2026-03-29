import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

interface WaterTrackerProps {
  count: number;
  goal: number;
  onAdd: () => void;
  dark?: boolean;
}

export default function WaterTracker({ count, goal, onAdd, dark = true }: WaterTrackerProps) {
  return (
    <View style={[styles.container, {
      backgroundColor: dark ? Colors.card : Colors.cardLight,
      borderColor: dark ? Colors.border : Colors.borderLight,
    }]}>
      <Text style={{ fontSize: 20 }}>💧</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: dark ? Colors.t1 : Colors.t1Light }]}>
          {count} / {goal} glasses
        </Text>
        <View style={styles.dots}>
          {Array.from({ length: goal }).map((_, i) => (
            <View key={i} style={[styles.dot, {
              backgroundColor: i < count ? Colors.blue : (dark ? '#2A2A2E' : '#E0E0E5'),
            }]} />
          ))}
        </View>
      </View>
      <TouchableOpacity onPress={onAdd} style={styles.addBtn}>
        <Text style={styles.addText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, paddingHorizontal: 14, borderRadius: 14,
    marginBottom: 10, borderWidth: 1,
  },
  label: { fontSize: 11, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 3, marginTop: 4 },
  dot: { width: 14, height: 14, borderRadius: 4 },
  addBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.blueDim, alignItems: 'center', justifyContent: 'center',
  },
  addText: { fontSize: 16, color: Colors.blue, fontWeight: '700' },
});
