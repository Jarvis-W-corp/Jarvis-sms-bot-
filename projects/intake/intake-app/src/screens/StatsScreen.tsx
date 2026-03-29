import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';
import { useStore } from '../store/useStore';
import { getFoodEntries } from '../services/food';
import LockOverlay from '../components/LockOverlay';

function getDateRange(period: 'day' | 'week' | 'month'): string[] {
  const dates: string[] = [];
  const now = new Date();
  const count = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export default function StatsScreen() {
  const { dark, subscription, session, todayMeals } = useStore();
  const cd = dark ? Colors.card : Colors.cardLight;
  const t1 = dark ? Colors.t1 : Colors.t1Light;
  const t3 = dark ? Colors.t3 : Colors.t3Light;
  const bd = dark ? Colors.border : Colors.borderLight;

  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [dailyData, setDailyData] = useState<{ date: string; calories: number; protein: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const userId = session?.user?.id;

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const dates = getDateRange(period);
      const results = await Promise.all(
        dates.map(async (date) => {
          const entries = await getFoodEntries(userId, date);
          return {
            date,
            calories: entries.reduce((s, e) => s + e.calories, 0),
            protein: entries.reduce((s, e) => s + e.protein, 0),
          };
        })
      );
      setDailyData(results);
    } catch (err) {
      console.warn('Stats load error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, period]);

  useEffect(() => { loadData(); }, [loadData]);

  // Also refresh when todayMeals change (new food logged)
  useEffect(() => { loadData(); }, [todayMeals.length]);

  const totalCals = dailyData.reduce((s, d) => s + d.calories, 0);
  const avgCals = dailyData.length > 0 ? Math.round(totalCals / dailyData.length) : 0;
  const maxCal = Math.max(...dailyData.map((d) => d.calories), 1);

  const totalProtein = dailyData.reduce((s, d) => s + d.protein, 0);
  const avgProtein = dailyData.length > 0 ? Math.round(totalProtein / dailyData.length) : 0;

  // Streak: consecutive days with at least 1 log
  const streak = (() => {
    let count = 0;
    for (let i = dailyData.length - 1; i >= 0; i--) {
      if (dailyData[i].calories > 0) count++;
      else break;
    }
    return count;
  })();

  // Goal accuracy: days within 10% of target
  const target = 2400; // Will use user target when available
  const goalDays = dailyData.filter((d) => d.calories > 0 && Math.abs(d.calories - target) / target <= 0.1).length;
  const activeDays = dailyData.filter((d) => d.calories > 0).length;
  const goalAccuracy = activeDays > 0 ? Math.round((goalDays / activeDays) * 100) : 0;

  const dayLabels = period === 'week'
    ? ['M', 'T', 'W', 'T', 'F', 'S', 'S']
    : dailyData.map((_, i) => (i % 5 === 0 ? String(i + 1) : ''));

  return (
    <View style={[styles.container, { backgroundColor: dark ? Colors.bg : Colors.bgLight }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: t1 }]}>Analytics</Text>

        {/* Period tabs */}
        <View style={[styles.periodTabs, { backgroundColor: cd }]}>
          {(['day', 'week', 'month'] as const).map((t, i) => (
            <TouchableOpacity key={i} onPress={() => setPeriod(t)}
              style={[styles.pTab, period === t && styles.pTabActive]}>
              <Text style={[styles.pTabText, period === t && { color: '#fff', fontWeight: '600' }]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Calorie chart */}
        <View style={[styles.chartCard, { backgroundColor: cd, borderColor: bd }]}>
          <Text style={[styles.chartTitle, { color: t1 }]}>Calorie Intake</Text>
          <Text style={{ fontSize: 10, color: t3, marginBottom: 12 }}>
            {avgCals > 0 ? `Avg ${avgCals.toLocaleString()} kcal / day` : 'No data yet — start logging!'}
          </Text>
          <View style={styles.bars}>
            {dailyData.slice(-7).map((d, i) => {
              const h = maxCal > 0 ? Math.max((d.calories / maxCal) * 100, 3) : 3;
              const isToday = d.date === new Date().toISOString().split('T')[0];
              return (
                <View key={i} style={styles.barCol}>
                  <View style={[styles.bar, {
                    height: `${h}%`,
                    backgroundColor: isToday ? `${Colors.ember}50` : d.calories > 0 ? Colors.emberLight : `${Colors.ember}20`,
                    borderWidth: isToday ? 1 : 0,
                    borderColor: Colors.ember,
                    borderStyle: isToday ? 'dashed' : 'solid',
                  }]} />
                  <Text style={[styles.barLabel, isToday && { color: Colors.emberLight }]}>
                    {period === 'week' ? (dayLabels[i] || '') : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: cd, borderColor: bd }]}>
            <Text style={{ fontSize: 16, marginBottom: 5 }}>🔥</Text>
            <Text style={[styles.statVal, { color: t1 }]}>{streak}</Text>
            <Text style={{ fontSize: 10, color: t3 }}>Day Streak</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: cd, borderColor: bd }]}>
            <Text style={{ fontSize: 16, marginBottom: 5 }}>🎯</Text>
            <Text style={[styles.statVal, { color: t1 }]}>{goalAccuracy}%</Text>
            <Text style={{ fontSize: 10, color: t3 }}>Goal Accuracy</Text>
          </View>
        </View>

        {/* Protein trend (Plus locked) */}
        <View style={{ position: 'relative' }}>
          <View style={[styles.trendCard, { backgroundColor: cd, borderColor: bd }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={[{ fontSize: 13, fontWeight: '600' }, { color: t1 }]}>Protein Trend</Text>
              <View style={{ backgroundColor: Colors.blueDim, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 8, fontWeight: '700', color: Colors.blue }}>Plus</Text>
              </View>
            </View>
            <View style={styles.trendBars}>
              {dailyData.slice(-10).map((d, i) => {
                const maxP = Math.max(...dailyData.slice(-10).map((x) => x.protein), 1);
                const h = Math.max((d.protein / maxP) * 100, 5);
                return (
                  <View key={i} style={[styles.trendBar, {
                    height: `${h}%`, backgroundColor: Colors.blue, opacity: 0.4 + (h / 200),
                  }]} />
                );
              })}
            </View>
            {avgProtein > 0 && (
              <Text style={{ fontSize: 10, color: t3, marginTop: 6 }}>
                Avg {avgProtein}g / day
              </Text>
            )}
          </View>
          {subscription === 'free' && <LockOverlay tier="plus" />}
        </View>

        {/* Export (Pro locked) */}
        <View style={{ position: 'relative' }}>
          <View style={[styles.exportCard, { backgroundColor: cd, borderColor: bd }]}>
            <Text style={{ fontSize: 18 }}>📄</Text>
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 12, fontWeight: '600' }, { color: t1 }]}>Export PDF Report</Text>
              <Text style={{ fontSize: 10, color: t3 }}>Share with your trainer</Text>
            </View>
            <Text style={{ fontSize: 12, color: Colors.purple, fontWeight: '600' }}>→</Text>
          </View>
          {subscription !== 'pro' && <LockOverlay tier="pro" />}
        </View>

        {/* Micronutrient insight (Plus/Pro) */}
        {subscription !== 'free' && (
          <View style={[styles.microCard, { backgroundColor: cd, borderColor: bd }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Text>🧪</Text>
              <Text style={[{ fontSize: 12, fontWeight: '600' }, { color: t1 }]}>Micronutrient Spotlight</Text>
              <View style={{ backgroundColor: Colors.blueDim, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 }}>
                <Text style={{ fontSize: 8, fontWeight: '700', color: Colors.blue }}>Plus</Text>
              </View>
            </View>
            <Text style={{ fontSize: 11, color: dark ? Colors.t2 : Colors.t2Light, lineHeight: 16.5 }}>
              Average protein: <Text style={{ color: Colors.blue, fontWeight: '600' }}>{avgProtein}g/day</Text>.
              {avgProtein > 0 && avgProtein < 120
                ? ' Consider adding more lean protein sources like chicken breast or Greek yogurt.'
                : avgProtein >= 120
                ? ' Great protein intake! Keep it consistent.'
                : ' Start logging meals to see insights here.'}
            </Text>
          </View>
        )}

        {/* Progress photos */}
        <TouchableOpacity style={[styles.photoCard, { backgroundColor: cd, borderColor: bd }]}>
          <Text style={{ fontSize: 18 }}>📸</Text>
          <View style={{ flex: 1 }}>
            <Text style={[{ fontSize: 12, fontWeight: '600' }, { color: t1 }]}>Progress Photos</Text>
            <Text style={{ fontSize: 10, color: t3 }}>Take monthly photos, see side-by-side</Text>
          </View>
          <Text style={{ fontSize: 12, color: Colors.emberLight }}>→</Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 58, paddingBottom: 100 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  periodTabs: { flexDirection: 'row', gap: 3, borderRadius: 10, padding: 3, marginBottom: 14 },
  pTab: { flex: 1, padding: 6, alignItems: 'center', borderRadius: 8 },
  pTabActive: { backgroundColor: Colors.ember },
  pTabText: { fontSize: 11, fontWeight: '500', color: Colors.t3 },
  chartCard: { borderRadius: 20, padding: 18, marginBottom: 10, borderWidth: 1 },
  chartTitle: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 90 },
  barCol: { flex: 1, alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4 },
  barLabel: { fontSize: 8, color: Colors.t3 },
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, borderRadius: 16, padding: 14, borderWidth: 1 },
  statVal: { fontSize: 22, fontWeight: '700' },
  trendCard: { borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1 },
  trendBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 50 },
  trendBar: { flex: 1, borderRadius: 2 },
  exportCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 13, paddingHorizontal: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1,
  },
  microCard: { borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1 },
  photoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
});
