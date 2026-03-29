import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';
import { useStore } from '../store/useStore';

const GOAL_LABELS: Record<string, string> = {
  lose: 'Weight loss deficit', maintain: 'Maintenance calories',
  gain: 'Muscle building surplus', health: 'Balanced nutrition',
};
const EXP_LABELS: Record<string, string> = {
  new: 'Beginner guidance ON', tried: 'Helpful tips enabled',
  onoff: 'Standard mode', expert: 'Streamlined — minimal tips',
};

export default function ResultsScreen({ navigation }: any) {
  const { onboarding: ob } = useStore();
  const dietLabel = ob.diet.filter((d: string) => d !== 'none').join(', ') || 'No restrictions';

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.emoji}>✨</Text>
          <Text style={styles.title}>Your Snack AI is ready, {ob.name || 'Mark'}!</Text>
          <Text style={styles.sub}>Personalized targets based on your answers.</Text>
        </View>

        {/* Macro grid */}
        <View style={styles.card}>
          <View style={styles.grid}>
            {[
              [(ob as any).target || 2400, 'daily calories', Colors.emberLight],
              [`${(ob as any).protein || 150}g`, 'protein', Colors.blue],
              [`${(ob as any).carbs || 200}g`, 'carbs', Colors.emberLight],
              [`${(ob as any).fat || 65}g`, 'fat', Colors.purple],
            ].map(([val, label, color], i) => (
              <View key={i} style={styles.cell}>
                <Text style={[styles.cellVal, { color: color as string }]}>
                  {typeof val === 'number' ? val.toLocaleString() : val}
                </Text>
                <Text style={styles.cellLabel}>{label as string}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Feature items */}
        {[
          ['🎯', `${GOAL_LABELS[ob.goal]} — ${(ob as any).target || 2400} kcal/day`],
          ['🍽️', `${ob.meals} meals configured`],
          ['🥗', dietLabel],
          ['📱', EXP_LABELS[ob.exp]],
          ['📷', '3 free AI scans ready today'],
        ].map(([ic, tx], i) => (
          <View key={i} style={styles.fpItem}>
            <Text style={{ fontSize: 14 }}>{ic}</Text>
            <Text style={styles.fpText}>{tx}</Text>
            <Text style={styles.fpCheck}>✓</Text>
          </View>
        ))}

        <View style={styles.safeNote}>
          <Text style={styles.safeTitle}>No hidden fees. No trials that auto-charge.</Text>
          <Text style={styles.safeSub}>Upgrade when you're ready — or don't.</Text>
        </View>
      </View>

      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.nextBtn} onPress={() => navigation.navigate('TierSelect')}>
          <Text style={styles.nextBtnText}>Continue →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { flex: 1, padding: 24, paddingTop: 60 },
  header: { alignItems: 'center', marginBottom: 16 },
  emoji: { fontSize: 44, marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.t1, textAlign: 'center' },
  sub: { fontSize: 13, color: Colors.t3, textAlign: 'center', marginTop: 5 },
  card: {
    backgroundColor: Colors.card, borderRadius: 18, padding: 20,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    width: '48%', alignItems: 'center', padding: 14,
    backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12,
  },
  cellVal: { fontSize: 26, fontWeight: '700' },
  cellLabel: { fontSize: 9, color: Colors.t3, marginTop: 2 },
  fpItem: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    padding: 9, paddingHorizontal: 12, backgroundColor: Colors.card,
    borderRadius: 11, borderWidth: 1, borderColor: Colors.border, marginBottom: 6,
  },
  fpText: { flex: 1, fontSize: 11, color: Colors.t2 },
  fpCheck: { fontSize: 10, color: Colors.green },
  safeNote: { alignItems: 'center', marginTop: 12, marginBottom: 8 },
  safeTitle: { fontSize: 12, fontWeight: '600', color: Colors.t1 },
  safeSub: { fontSize: 10, color: Colors.t3, marginTop: 3 },
  btnRow: { paddingHorizontal: 24, paddingBottom: 32 },
  nextBtn: {
    padding: 15, borderRadius: 14, backgroundColor: Colors.ember,
    alignItems: 'center', shadowColor: Colors.ember,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 18,
  },
  nextBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
