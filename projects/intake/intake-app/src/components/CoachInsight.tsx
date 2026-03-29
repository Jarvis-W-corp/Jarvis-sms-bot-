import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

interface CoachInsightProps {
  emoji: string;
  title: string;
  body: string;
  dark?: boolean;
}

export default function CoachInsight({ emoji, title, body, dark = true }: CoachInsightProps) {
  return (
    <View style={[styles.container, {
      borderColor: dark ? 'rgba(232,98,44,0.12)' : 'rgba(232,98,44,0.1)',
    }]}>
      <View style={styles.header}>
        <Text style={{ fontSize: 14 }}>{emoji}</Text>
        <Text style={[styles.title, { color: dark ? Colors.t1 : Colors.t1Light }]}>{title}</Text>
      </View>
      <Text style={[styles.body, { color: dark ? Colors.t2 : Colors.t2Light }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1,
    // gradient background approximation
    backgroundColor: 'rgba(232,98,44,0.06)',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 12, fontWeight: '600' },
  body: { fontSize: 11, lineHeight: 16.5 },
});
