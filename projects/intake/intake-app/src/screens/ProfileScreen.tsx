import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';
import { useStore } from '../store/useStore';
import { signOut } from '../services/auth';

export default function ProfileScreen() {
  const { dark, user, onboarding: ob, subscription } = useStore();
  const name = user?.name || ob.name || 'Mark';
  const target = user?.target || (ob as any).target || 2400;
  const goalW = user?.goalWeight || ob.goalWeight || 175;
  const diet = (user?.diet || ob.diet || []).filter((d: string) => d !== 'none').join(', ') || 'None';
  const tier = subscription;

  const cd = dark ? Colors.card : Colors.cardLight;
  const t1 = dark ? Colors.t1 : Colors.t1Light;
  const t2 = dark ? Colors.t2 : Colors.t2Light;
  const t3 = dark ? Colors.t3 : Colors.t3Light;
  const bd = dark ? Colors.border : Colors.borderLight;

  const tierColor = tier === 'free' ? Colors.green : tier === 'plus' ? Colors.blue : Colors.purple;

  const SETTINGS: [string, [string, string, string?][]][] = [
    ['Subscription', [['✨', 'Current Plan', tier.charAt(0).toUpperCase() + tier.slice(1)]]],
    ['Goals', [
      ['🎯', 'Daily Calories', target.toLocaleString()],
      ['💪', 'Macro Targets'],
      ['⚖️', 'Weight Goal', `${goalW} lbs`],
      ['🏋️', 'Exercise Goal', '300 min/wk'],
    ]],
    ['Preferences', [
      ['🍽️', 'Dietary Restrictions', diet],
      ['💧', 'Water Goal', '8 glasses'],
      ['🔔', 'Meal Reminders'],
      ['🤖', 'AI Preferences'],
    ]],
    ['Account', [
      ['👤', 'Edit Profile'],
      ['📱', 'Connected Apps'],
      ['🌙', 'Theme', dark ? 'Dark' : 'Light'],
    ]],
  ];

  return (
    <View style={[styles.container, { backgroundColor: dark ? Colors.bg : Colors.bgLight }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={styles.head}>
          <View style={styles.avatar}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#fff' }}>
              {name[0].toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.profileName, { color: t1 }]}>{name}</Text>
          <Text style={[styles.profileTier, { color: tierColor }]}>
            Snack AI {tier.charAt(0).toUpperCase() + tier.slice(1)}
          </Text>
        </View>

        {/* Stats bar */}
        <View style={[styles.statsBar, { backgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }]}>
          {[['14', 'Day Streak'], ['847', 'Meals'], ['3.2k', 'Scans']].map(([v, l], i) => (
            <View key={i} style={[styles.stat, { backgroundColor: cd }]}>
              <Text style={[styles.statVal, { color: t1 }]}>{v}</Text>
              <Text style={{ fontSize: 9, color: t3, marginTop: 1 }}>{l}</Text>
            </View>
          ))}
        </View>

        {/* Settings groups */}
        {SETTINGS.map(([group, items], gi) => (
          <View key={gi}>
            <Text style={styles.groupTitle}>{group}</Text>
            <View style={[styles.settingsCard, { backgroundColor: cd, borderColor: bd }]}>
              {items.map(([ic, label, val], ii) => (
                <TouchableOpacity key={ii} style={[styles.settingsRow,
                  ii > 0 && { borderTopWidth: 1, borderTopColor: bd }]}>
                  <Text style={{ fontSize: 14, width: 22, textAlign: 'center' }}>{ic}</Text>
                  <Text style={[{ flex: 1, fontSize: 12 }, { color: t1 }]}>{label}</Text>
                  {val && <Text style={{ fontSize: 11, color: t2, marginRight: 4 }}>{val}</Text>}
                  <Text style={{ color: t3, fontSize: 12 }}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Widget preview */}
        <View style={[styles.widgetCard, { backgroundColor: cd, borderColor: bd }]}>
          <Text style={styles.groupTitle}>Home Screen Widget</Text>
          <View style={[styles.widgetPreview, { backgroundColor: dark ? '#0D0D0F' : '#F0F0F2' }]}>
            <View style={styles.widgetIcon}><Text style={{ fontSize: 20 }}>🔥</Text></View>
            <View>
              <Text style={[{ fontSize: 16, fontWeight: '700' }, { color: t1 }]}>
                {Math.round(target * 0.67)} / {target}
              </Text>
              <Text style={{ fontSize: 9, color: t3 }}>kcal · protein remaining</Text>
            </View>
          </View>
          <Text style={styles.widgetCta}>Add Widget to Home Screen →</Text>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={[styles.signOut, { borderColor: Colors.red }]} onPress={signOut}>
          <Text style={{ color: Colors.red, fontSize: 13, fontWeight: '600' }}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Snack AI v1.0.0</Text>
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 58, paddingBottom: 100 },
  head: { alignItems: 'center', paddingVertical: 12, paddingBottom: 16 },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.ember, alignItems: 'center', justifyContent: 'center',
    marginBottom: 8, borderWidth: 3, borderColor: 'rgba(232,98,44,0.3)',
  },
  profileName: { fontSize: 18, fontWeight: '700' },
  profileTier: { fontSize: 11, marginTop: 2 },
  statsBar: { flexDirection: 'row', gap: 1, borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statVal: { fontSize: 16, fontWeight: '700' },
  groupTitle: {
    fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8,
    color: Colors.t3, marginBottom: 6, paddingLeft: 4,
  },
  settingsCard: { borderRadius: 12, overflow: 'hidden', marginBottom: 14, borderWidth: 1 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', padding: 11, paddingHorizontal: 14, gap: 8 },
  widgetCard: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 14 },
  widgetPreview: { borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  widgetIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(232,98,44,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  widgetCta: { fontSize: 10, color: Colors.emberLight, textAlign: 'center', marginTop: 8 },
  signOut: {
    borderRadius: 12, padding: 14, alignItems: 'center',
    borderWidth: 1, backgroundColor: 'transparent',
  },
  version: { fontSize: 10, color: Colors.t3, textAlign: 'center', marginTop: 12 },
});
