import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { Colors } from '../constants/theme';
import { useStore, calculateTargets } from '../store/useStore';
import { Goal, ActivityLevel } from '../types';

const STEPS = [
  { emoji: '👋', title: 'What should we call you?', sub: 'This personalizes your entire experience.' },
  { emoji: '📏', title: 'Your body metrics', sub: 'For accurate calorie calculations. Private and secure.' },
  { emoji: '🎯', title: "What's your goal?", sub: 'This shapes your calorie target and AI coaching tone.' },
  { emoji: '🏃', title: 'How active are you?', sub: 'This directly affects your daily calorie target.' },
  { emoji: '🥗', title: 'Any dietary needs?', sub: 'Select all that apply. The AI will flag foods that don\'t match.' },
  { emoji: '🍽️', title: 'How do you usually eat?', sub: 'Sets up your daily meal slots and reminders.' },
  { emoji: '📱', title: 'Tracked nutrition before?', sub: 'Calibrates guidance to your comfort level.' },
  { emoji: '⭐', title: 'What matters most?', sub: 'Pick 2. This shapes what the AI highlights for you.' },
];

const GOALS = [
  { v: 'lose' as Goal, ic: '🔥', bg: Colors.greenDim, n: 'Lose weight', d: 'Calorie deficit with balanced nutrition' },
  { v: 'maintain' as Goal, ic: '⚖️', bg: Colors.blueDim, n: 'Maintain weight', d: 'Stay steady, eat smarter' },
  { v: 'gain' as Goal, ic: '💪', bg: Colors.purpleDim, n: 'Build muscle', d: 'Calorie surplus, high protein' },
  { v: 'health' as Goal, ic: '🌱', bg: Colors.emberDim, n: 'Just eat healthier', d: 'Track and understand my food' },
];

const ACTIVITIES = [
  { v: 1.2 as ActivityLevel, ic: '🪑', n: 'Mostly sedentary', d: 'Desk job, little exercise' },
  { v: 1.375 as ActivityLevel, ic: '🚶', bg: Colors.greenDim, n: 'Lightly active', d: 'Light exercise 1-2x/week' },
  { v: 1.55 as ActivityLevel, ic: '🏋️', bg: Colors.blueDim, n: 'Moderately active', d: 'Exercise 3-4x/week' },
  { v: 1.725 as ActivityLevel, ic: '⚡', bg: Colors.emberDim, n: 'Very active', d: 'Intense training 5-6x/week' },
];

const DIETS = [
  { v: 'vegetarian', ic: '🌿' }, { v: 'vegan', ic: '🌱' }, { v: 'gluten-free', ic: '🌾' },
  { v: 'dairy-free', ic: '🥛' }, { v: 'nut-allergy', ic: '🥜' }, { v: 'keto', ic: '🥩' },
  { v: 'halal', ic: '☪️' }, { v: 'none', ic: '✅' },
];

const EXPERIENCE = [
  { v: 'new', ic: '🌟', bg: Colors.greenDim, n: 'First time', d: 'Never tracked food before' },
  { v: 'tried', ic: '🔄', bg: Colors.blueDim, n: 'Tried it, didn\'t stick', d: 'Used apps before but stopped' },
  { v: 'onoff', ic: '📊', bg: Colors.emberDim, n: 'On and off', d: 'Track during focused periods' },
  { v: 'expert', ic: '🧠', bg: Colors.purpleDim, n: 'Experienced', d: 'Know my macros, need a better tool' },
];

const PRIORITIES = [
  { v: 'accuracy', ic: '🎯', n: 'Accuracy' },
  { v: 'speed', ic: '⚡', n: 'Speed & convenience' },
  { v: 'learning', ic: '📚', n: 'Learning about nutrition' },
  { v: 'planning', ic: '📋', n: 'Meal planning' },
  { v: 'macros', ic: '💪', n: 'Hitting macro targets' },
];

function OptionCard({ item, selected, onPress }: { item: any; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.opt, selected && styles.optSel]}>
      {item.ic && (
        <View style={[styles.optIcon, { backgroundColor: item.bg || 'rgba(255,255,255,0.04)' }]}>
          <Text style={{ fontSize: 24 }}>{item.ic}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.optName}>{item.n}</Text>
        {item.d && <Text style={styles.optDesc}>{item.d}</Text>}
      </View>
      <View style={[styles.optCheck, selected && styles.optCheckSel]}>
        {selected && <Text style={{ color: '#fff', fontSize: 11 }}>✓</Text>}
      </View>
    </TouchableOpacity>
  );
}

export default function OnboardingScreen({ navigation }: any) {
  const [step, setStep] = useState(0);
  const { onboarding, updateOnboarding } = useStore();
  const ob = onboarding;

  function next() {
    if (step < 7) setStep(step + 1);
    else {
      // Calculate and go to results
      const targets = calculateTargets(ob.weight, ob.height || 70, ob.age, ob.goal, ob.activity, ob.units);
      updateOnboarding('tdee', targets.tdee);
      updateOnboarding('target', targets.target);
      updateOnboarding('protein', targets.protein);
      updateOnboarding('carbs', targets.carbs);
      updateOnboarding('fat', targets.fat);
      navigation.navigate('Results');
    }
  }

  function back() {
    if (step > 0) setStep(step - 1);
    else navigation.goBack();
  }

  const s = STEPS[step];

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progress}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={[styles.progDot,
            i < step && styles.progDone,
            i === step && styles.progNow,
          ]} />
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.emoji}>{s.emoji}</Text>
        <Text style={styles.title}>{s.title}</Text>
        <Text style={styles.sub}>{s.sub}</Text>

        {/* Step 0: Name + Age */}
        {step === 0 && (
          <>
            <Text style={styles.label}>First name</Text>
            <TextInput
              style={styles.input} placeholder="e.g. Mark" placeholderTextColor={Colors.t3}
              value={ob.name} onChangeText={(v) => updateOnboarding('name', v)}
            />
            <Text style={styles.label}>Age</Text>
            <TextInput
              style={styles.input} placeholder="28" placeholderTextColor={Colors.t3}
              value={ob.age ? String(ob.age) : ''} keyboardType="number-pad"
              onChangeText={(v) => updateOnboarding('age', parseInt(v) || 0)}
            />
          </>
        )}

        {/* Step 1: Body metrics */}
        {step === 1 && (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Height (inches)</Text>
                <TextInput
                  style={styles.input} placeholder="70" placeholderTextColor={Colors.t3}
                  value={ob.height ? String(ob.height) : ''} keyboardType="number-pad"
                  onChangeText={(v) => updateOnboarding('height', parseInt(v) || 0)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Weight (lbs)</Text>
                <TextInput
                  style={styles.input} placeholder="185" placeholderTextColor={Colors.t3}
                  value={ob.weight ? String(ob.weight) : ''} keyboardType="number-pad"
                  onChangeText={(v) => updateOnboarding('weight', parseInt(v) || 0)}
                />
              </View>
            </View>
            <Text style={styles.label}>Goal weight (lbs) — optional</Text>
            <TextInput
              style={styles.input} placeholder="175" placeholderTextColor={Colors.t3}
              value={ob.goalWeight ? String(ob.goalWeight) : ''} keyboardType="number-pad"
              onChangeText={(v) => updateOnboarding('goalWeight', parseInt(v) || 0)}
            />
          </>
        )}

        {/* Step 2: Goal */}
        {step === 2 && (
          <View style={{ gap: 7 }}>
            {GOALS.map((g) => (
              <OptionCard key={g.v} item={g} selected={ob.goal === g.v}
                onPress={() => updateOnboarding('goal', g.v)} />
            ))}
          </View>
        )}

        {/* Step 3: Activity */}
        {step === 3 && (
          <View style={{ gap: 7 }}>
            {ACTIVITIES.map((a) => (
              <OptionCard key={a.v} item={a} selected={ob.activity === a.v}
                onPress={() => updateOnboarding('activity', a.v)} />
            ))}
          </View>
        )}

        {/* Step 4: Diet */}
        {step === 4 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {DIETS.map((d) => {
              const sel = ob.diet.includes(d.v);
              return (
                <TouchableOpacity key={d.v} onPress={() => {
                  if (d.v === 'none') updateOnboarding('diet', ['none']);
                  else {
                    const filtered = ob.diet.filter((x: string) => x !== 'none');
                    updateOnboarding('diet', sel ? filtered.filter((x: string) => x !== d.v) : [...filtered, d.v]);
                  }
                }} style={[styles.chip, sel && styles.chipSel]}>
                  <Text style={[styles.chipText, sel && { color: Colors.emberLight }]}>
                    {d.ic} {d.v.charAt(0).toUpperCase() + d.v.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Step 5: Meals */}
        {step === 5 && (
          <>
            <Text style={styles.label}>Meals per day</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {[2, 3, 4, 5].map((n) => {
                const sel = ob.meals === n;
                return (
                  <TouchableOpacity key={n} onPress={() => updateOnboarding('meals', n)}
                    style={[styles.mealCount, sel && styles.mealCountSel]}>
                    <Text style={[styles.mealCountNum, { color: Colors.t1 }]}>{n}{n === 5 ? '+' : ''}</Text>
                    <Text style={{ fontSize: 9, color: Colors.t3 }}>meals</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.label, { marginBottom: 8 }]}>Do you snack?</Text>
            <View style={{ gap: 7 }}>
              {[
                { v: 'yes', ic: '🍎', n: 'Yes, regularly' },
                { v: 'sometimes', ic: '🤷', n: 'Sometimes' },
                { v: 'no', ic: '🚫', n: 'Rarely' },
              ].map((s) => (
                <OptionCard key={s.v} item={s} selected={ob.snack === s.v}
                  onPress={() => updateOnboarding('snack', s.v)} />
              ))}
            </View>
          </>
        )}

        {/* Step 6: Experience */}
        {step === 6 && (
          <View style={{ gap: 7 }}>
            {EXPERIENCE.map((e) => (
              <OptionCard key={e.v} item={e} selected={ob.exp === e.v}
                onPress={() => updateOnboarding('exp', e.v)} />
            ))}
          </View>
        )}

        {/* Step 7: Priorities */}
        {step === 7 && (
          <View style={{ gap: 6 }}>
            {PRIORITIES.map((p) => {
              const sel = ob.priorities.includes(p.v as any);
              const idx = ob.priorities.indexOf(p.v as any);
              return (
                <TouchableOpacity key={p.v} onPress={() => {
                  if (sel) updateOnboarding('priorities', ob.priorities.filter((x: string) => x !== p.v));
                  else if (ob.priorities.length < 2) updateOnboarding('priorities', [...ob.priorities, p.v]);
                }} style={[styles.pri, sel && styles.priSel]}>
                  <View style={[styles.priNum, sel && styles.priNumSel]}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: sel ? Colors.emberLight : Colors.t3 }}>
                      {sel ? idx + 1 : '—'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16 }}>{p.ic}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: Colors.t1 }}>{p.n}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Buttons */}
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.backBtn} onPress={back}>
          <Text style={{ color: Colors.t2, fontSize: 17 }}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.nextBtn} onPress={next}>
          <Text style={styles.nextBtnText}>{step === 7 ? 'Build My Snack AI' : 'Continue'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  progress: { flexDirection: 'row', gap: 4, paddingHorizontal: 24, paddingTop: 52 },
  progDot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#2A2A2E' },
  progDone: { backgroundColor: Colors.ember },
  progNow: { backgroundColor: Colors.emberLight },
  content: { padding: 24, paddingTop: 20, paddingBottom: 16 },
  emoji: { fontSize: 44, marginBottom: 14 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.t1, marginBottom: 5 },
  sub: { fontSize: 13, color: Colors.t3, lineHeight: 19.5, marginBottom: 24 },
  label: { fontSize: 11, color: Colors.t2, marginBottom: 6, fontWeight: '500' },
  input: {
    backgroundColor: Colors.card, borderWidth: 2, borderColor: '#2A2A2E',
    borderRadius: 14, padding: 13, paddingHorizontal: 16,
    color: Colors.t1, fontSize: 15, marginBottom: 14,
  },
  opt: {
    backgroundColor: Colors.card, borderWidth: 2, borderColor: '#2A2A2E',
    borderRadius: 14, padding: 13, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  optSel: { borderColor: Colors.ember, backgroundColor: 'rgba(232,98,44,0.05)' },
  optIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  optName: { fontSize: 13, fontWeight: '600', color: Colors.t1 },
  optDesc: { fontSize: 10, color: Colors.t3, marginTop: 1 },
  optCheck: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#2A2A2E',
    alignItems: 'center', justifyContent: 'center',
  },
  optCheckSel: { borderColor: Colors.ember, backgroundColor: Colors.ember },
  chip: {
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 11,
    backgroundColor: Colors.card, borderWidth: 2, borderColor: '#2A2A2E',
  },
  chipSel: { borderColor: Colors.ember, backgroundColor: 'rgba(232,98,44,0.06)' },
  chipText: { fontSize: 12, fontWeight: '500', color: Colors.t2 },
  mealCount: {
    flex: 1, paddingVertical: 16, borderRadius: 14,
    backgroundColor: Colors.card, borderWidth: 2, borderColor: '#2A2A2E',
    alignItems: 'center',
  },
  mealCountSel: { borderColor: Colors.ember, backgroundColor: 'rgba(232,98,44,0.05)' },
  mealCountNum: { fontSize: 22, fontWeight: '700' },
  pri: {
    backgroundColor: Colors.card, borderWidth: 2, borderColor: '#2A2A2E',
    borderRadius: 12, padding: 12, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  priSel: { borderColor: Colors.ember, backgroundColor: 'rgba(232,98,44,0.05)' },
  priNum: {
    width: 24, height: 24, borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
  },
  priNumSel: { backgroundColor: Colors.emberDim },
  btnRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingBottom: 32, paddingTop: 16 },
  backBtn: {
    width: 46, height: 46, borderRadius: 13,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: '#2A2A2E',
    alignItems: 'center', justifyContent: 'center',
  },
  nextBtn: {
    flex: 1, padding: 15, borderRadius: 14,
    backgroundColor: Colors.ember, alignItems: 'center',
    shadowColor: Colors.ember, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 18,
  },
  nextBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
