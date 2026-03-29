import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { Colors, MacroColors } from '../constants/theme';
import { useStore } from '../store/useStore';
import CalRing from '../components/CalRing';
import MacroBar from '../components/MacroBar';
import WaterTracker from '../components/WaterTracker';
import MealSlotCard from '../components/MealSlotCard';
import CoachInsight from '../components/CoachInsight';
import AdaptiveCard from '../components/AdaptiveCard';

export default function HomeScreen({ navigation }: any) {
  const {
    user, onboarding: ob, dark, toggleTheme, subscription,
    water, addWater, getMealSlots, getEaten, getBurned, streak,
  } = useStore();

  const name = user?.name || ob.name || 'Mark';
  const target = user?.target || (ob as any).target || 2400;
  const proteinTarget = user?.protein || (ob as any).protein || 150;
  const carbsTarget = user?.carbs || (ob as any).carbs || 200;
  const fatTarget = user?.fat || (ob as any).fat || 65;
  const priorities = user?.priorities || ob.priorities;
  const tier = subscription;

  const eaten = getEaten();
  const burned = getBurned();
  const meals = getMealSlots();

  const demoEaten = eaten.calories;
  const demoProtein = eaten.protein;
  const demoCarbs = eaten.carbs;
  const demoFat = eaten.fat;

  return (
    <View style={[styles.container, { backgroundColor: dark ? Colors.bg : Colors.bgLight }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: dark ? Colors.t2 : Colors.t2Light }]}>Good afternoon,</Text>
            <Text style={[styles.name, { color: dark ? Colors.t1 : Colors.t1Light }]}>{name} 👋</Text>
          </View>
          <TouchableOpacity onPress={toggleTheme} style={[styles.themeBtn, {
            backgroundColor: dark ? Colors.card : Colors.cardLight,
            borderColor: dark ? Colors.border : Colors.borderLight,
          }]}>
            <Text style={{ fontSize: 16 }}>{dark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
        </View>

        {/* Tier pill */}
        <View style={[styles.tierPill, {
          backgroundColor: tier === 'free' ? Colors.greenDim : tier === 'plus' ? Colors.blueDim : Colors.purpleDim,
        }]}>
          <Text style={[styles.tierText, {
            color: tier === 'free' ? Colors.green : tier === 'plus' ? Colors.blue : Colors.purple,
          }]}>
            {tier === 'free' ? '☀️ Free' : tier === 'plus' ? '⚡ Plus' : '👑 Pro'} · Snack AI
          </Text>
        </View>

        {/* Scan counter (free only) */}
        {tier === 'free' && (
          <View style={[styles.scanCounter, { backgroundColor: dark ? Colors.card : Colors.cardLight }]}>
            <Text style={{ fontSize: 11, color: dark ? Colors.t2 : Colors.t2Light }}>
              AI Scans: <Text style={{ color: Colors.emberLight, fontWeight: '700' }}>1 / 2</Text>
            </Text>
            <View style={styles.scanDots}>
              <View style={[styles.scanDot, { backgroundColor: Colors.ember }]} />
              <View style={[styles.scanDot, { backgroundColor: dark ? '#2A2A2E' : '#E0E0E5' }]} />
            </View>
          </View>
        )}

        {/* Adaptive Intelligence (Plus/Pro) */}
        {tier !== 'free' && <AdaptiveCard dark={dark} name={name} target={target} />}

        {/* Priority-based insights */}
        {priorities.includes('accuracy') && (
          <CoachInsight dark={dark} emoji="🎯" title="Accuracy Insight"
            body={`Your scans hit 96% confidence across all 5 AI layers. Depth estimation improved portions by 12%.`} />
        )}
        {priorities.includes('macros') && (
          <CoachInsight dark={dark} emoji="💪" title="Macro Check"
            body={`You're at ${Math.round((demoProtein / proteinTarget) * 100)}% protein with ${meals.filter(m => !m.food).length} meals left. A high-protein dinner would close the gap.`} />
        )}
        {priorities.includes('learning') && (
          <CoachInsight dark={dark} emoji="📚" title="Did You Know?"
            body="Your lunch salad had 8g of fiber — 28% of your daily target. Fiber supports digestion and satiety." />
        )}

        {/* Calorie + Macro card */}
        <View style={[styles.calCard, {
          backgroundColor: dark ? Colors.card : Colors.cardLight,
          borderColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
        }]}>
          <View style={styles.calRow}>
            <CalRing eaten={demoEaten} burned={burned} target={target} dark={dark} />
            <View style={styles.macros}>
              <MacroBar label="Protein" current={demoProtein} target={proteinTarget} color={MacroColors.protein} dark={dark} />
              <MacroBar label="Carbs" current={demoCarbs} target={carbsTarget} color={MacroColors.carbs} dark={dark} />
              <MacroBar label="Fat" current={demoFat} target={fatTarget} color={MacroColors.fat} dark={dark} />
            </View>
          </View>
        </View>

        {/* Water */}
        <WaterTracker count={water} goal={8} onAdd={addWater} dark={dark} />

        {/* WSIE card */}
        <View style={[styles.wsieCard, {
          backgroundColor: dark ? Colors.card : Colors.cardLight,
          borderColor: dark ? Colors.border : Colors.borderLight,
        }]}>
          <Text style={{ fontSize: 20 }}>🤖</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.wsieTitle, { color: dark ? Colors.t1 : Colors.t1Light }]}>"What should I eat?"</Text>
            <Text style={{ fontSize: 10, color: dark ? Colors.t3 : Colors.t3Light }}>
              3 suggestions to hit remaining {Math.max(0, proteinTarget - demoProtein)}g protein
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: Colors.purple, fontWeight: '600' }}>→</Text>
          {tier === 'free' && (
            <View style={styles.wsielock}>
              <Text style={{ fontSize: 14 }}>🔒</Text>
              <Text style={{ fontSize: 10, fontWeight: '600', color: Colors.t2 }}>Pro</Text>
            </View>
          )}
        </View>

        {/* Meals */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: dark ? Colors.t1 : Colors.t1Light }]}>Today's Meals</Text>
          <Text style={styles.sectionLink}>+ Add</Text>
        </View>
        {meals.map((m, i) => (
          <MealSlotCard key={i} meal={m} dark={dark} onScan={() => navigation.navigate('Scan')} />
        ))}

        {/* Weekly summary (Plus/Pro) */}
        {tier !== 'free' && (
          <View style={styles.weeklySummary}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Text>📊</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: dark ? Colors.t1 : Colors.t1Light }}>Weekly Summary</Text>
            </View>
            <Text style={{ fontSize: 11, color: dark ? Colors.t2 : Colors.t2Light, lineHeight: 16.5 }}>
              You've logged <Text style={{ color: Colors.emberLight, fontWeight: '600' }}>18 meals</Text> and hit your calorie goal{' '}
              <Text style={{ color: Colors.green, fontWeight: '600' }}>5 of 7 days</Text>. Your protein consistency improved 12% from last week.
            </Text>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 58, paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  greeting: { fontSize: 13 },
  name: { fontSize: 26, fontWeight: '700' },
  themeBtn: {
    width: 36, height: 36, borderRadius: 10,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  tierPill: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 7, marginBottom: 14,
  },
  tierText: { fontSize: 10, fontWeight: '700' },
  scanCounter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 9, borderRadius: 11, marginBottom: 12,
  },
  scanDots: { flexDirection: 'row', gap: 3 },
  scanDot: { width: 7, height: 7, borderRadius: 3.5 },
  calCard: {
    borderRadius: 22, padding: 22, marginBottom: 10,
    borderWidth: 1, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 20,
  },
  calRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  macros: { flex: 1, gap: 9 },
  wsieCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 13, paddingHorizontal: 14, borderRadius: 14,
    marginBottom: 10, borderWidth: 1, position: 'relative',
  },
  wsieTitle: { fontSize: 13, fontWeight: '600' },
  wsielock: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,13,15,0.7)',
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 6,
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 14, marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  sectionLink: { fontSize: 12, color: Colors.ember },
  weeklySummary: {
    borderRadius: 14, padding: 14, marginTop: 12,
    backgroundColor: 'rgba(232,98,44,0.06)',
    borderWidth: 1, borderColor: 'rgba(232,98,44,0.2)',
  },
});
