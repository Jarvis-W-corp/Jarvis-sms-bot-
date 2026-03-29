import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

interface MacroBarProps {
  label: string;
  current: number;
  target: number;
  color: string;
  dark?: boolean;
}

export default function MacroBar({ label, current, target, color, dark = true }: MacroBarProps) {
  const pct = Math.min(Math.round((current / target) * 100), 100);

  return (
    <View>
      <Text style={[styles.label, { color: dark ? Colors.t2 : Colors.t2Light }]}>{label}</Text>
      <View style={[styles.bar, { backgroundColor: dark ? '#2A2A2E' : '#E0E0E5' }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.value, { color: dark ? Colors.t1 : Colors.t1Light }]}>
        {current}g <Text style={{ color: dark ? Colors.t3 : Colors.t3Light, fontWeight: '400' }}>/ {target}g</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 10, marginBottom: 2 },
  bar: { height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 2 },
  fill: { height: '100%', borderRadius: 3 },
  value: { fontSize: 11, fontWeight: '600' },
});
