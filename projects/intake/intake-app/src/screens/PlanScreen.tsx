import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';
import { useStore } from '../store/useStore';

const MEALS = [
  { type: 'Breakfast', time: '8:00 AM', name: 'Greek Yogurt Power Bowl', desc: 'Greek yogurt, granola, berries, honey, chia', kcal: 380, p: 28, c: 42 },
  { type: 'Lunch', time: '12:30 PM', name: 'Salmon Poke Bowl', desc: 'Fresh salmon, sushi rice, edamame, avocado', kcal: 620, p: 42, c: 58 },
  { type: 'Dinner', time: '7:00 PM', name: 'Herb Crusted Chicken', desc: 'Roasted chicken, sweet potato, broccoli', kcal: 550, p: 48, c: 40 },
];

export default function PlanScreen() {
  const { dark, subscription } = useStore();
  const cd = dark ? Colors.card : Colors.cardLight;
  const t1 = dark ? Colors.t1 : Colors.t1Light;
  const t3 = dark ? Colors.t3 : Colors.t3Light;
  const bd = dark ? Colors.border : Colors.borderLight;

  return (
    <View style={[styles.container, { backgroundColor: dark ? Colors.bg : Colors.bgLight }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: t1 }]}>Meal Plan</Text>
        <View style={styles.dayHeader}>
          <Text style={[styles.dayText, { color: t1 }]}>Monday</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>On Track</Text>
          </View>
        </View>

        {MEALS.map((m, i) => (
          <View key={i} style={[styles.mealCard, { backgroundColor: cd, borderColor: bd }]}>
            <Text style={styles.mealType}>{m.type} · {m.time}</Text>
            <Text style={[styles.mealName, { color: t1 }]}>{m.name}</Text>
            <Text style={{ fontSize: 10, color: t3, marginBottom: 6 }}>{m.desc}</Text>
            <View style={styles.mealMacros}>
              <Text style={{ fontSize: 10, color: dark ? Colors.t2 : Colors.t2Light }}>
                <Text style={{ fontWeight: '600', color: t1 }}>{m.kcal}</Text> kcal
              </Text>
              <Text style={{ fontSize: 10, color: dark ? Colors.t2 : Colors.t2Light }}>
                <Text style={{ fontWeight: '600', color: t1 }}>{m.p}g</Text> protein
              </Text>
            </View>
            <View style={styles.mealActions}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.purpleDim }]}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: Colors.purple }}>👨‍🍳 Recipe</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.emberDim }]}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: Colors.emberLight }}>✓ Log</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <TouchableOpacity style={[styles.linkCard, { backgroundColor: cd, borderColor: bd }]}>
          <Text style={{ fontSize: 18 }}>🛒</Text>
          <View style={{ flex: 1 }}>
            <Text style={[{ fontSize: 12, fontWeight: '600' }, { color: t1 }]}>Grocery List</Text>
            <Text style={{ fontSize: 10, color: t3 }}>12 items for this week</Text>
          </View>
          <Text style={{ fontSize: 12, color: Colors.purple, fontWeight: '600' }}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.linkCard, { backgroundColor: cd, borderColor: bd }]}>
          <Text style={{ fontSize: 18 }}>🍔</Text>
          <View style={{ flex: 1 }}>
            <Text style={[{ fontSize: 12, fontWeight: '600' }, { color: t1 }]}>Restaurant Menus</Text>
            <Text style={{ fontSize: 10, color: t3 }}>Search Chipotle, Sweetgreen & more</Text>
          </View>
          <Text style={{ fontSize: 12, color: Colors.emberLight }}>→</Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Pro lock overlay */}
      {subscription !== 'pro' && (
        <View style={styles.lockOverlay}>
          <Text style={{ fontSize: 28 }}>🔒</Text>
          <Text style={[{ fontSize: 14, fontWeight: '600' }, { color: t1 }]}>Pro Feature</Text>
          <Text style={{ fontSize: 11, color: dark ? Colors.t2 : Colors.t2Light }}>AI meal plans, recipes & grocery lists</Text>
          <TouchableOpacity style={styles.upgradeBtn}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Upgrade to Pro</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  content: { padding: 20, paddingTop: 58, paddingBottom: 100 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  dayText: { fontSize: 18, fontWeight: '700' },
  badge: { backgroundColor: Colors.greenDim, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '600', color: Colors.green },
  mealCard: { borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1 },
  mealType: {
    fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.7,
    color: Colors.emberLight, fontWeight: '600', marginBottom: 5,
  },
  mealName: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  mealMacros: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  mealActions: {
    flexDirection: 'row', gap: 6, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)',
  },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  linkCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 13, paddingHorizontal: 14, borderRadius: 14, marginBottom: 8, borderWidth: 1,
  },
  lockOverlay: {
    position: 'absolute', top: 100, left: 0, right: 0, bottom: 84,
    backgroundColor: 'rgba(13,13,15,0.75)',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  upgradeBtn: {
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 10, backgroundColor: Colors.purple,
  },
});
