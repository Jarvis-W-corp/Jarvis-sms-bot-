import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Colors, TierColors } from '../constants/theme';
import { useStore } from '../store/useStore';
import { supabase } from '../services/supabase';
import { getOfferings, purchasePackage, getTierFromEntitlements } from '../services/purchases';
import type { PurchasesPackage } from 'react-native-purchases';

const TIERS = [
  {
    id: 'pro' as const, name: 'Pro', badge: 'BEST VALUE', bc: Colors.purpleDim, bcc: Colors.purple,
    feats: ['Everything in Plus', 'AI meal plans', 'Recipes + video', 'Grocery lists', 'Export PDF', 'Priority AI'],
  },
  {
    id: 'plus' as const, name: 'Plus', badge: 'MOST POPULAR', bc: Colors.blueDim, bcc: Colors.blue,
    feats: ['Unlimited AI scans', 'Depth estimation', 'Personal calibration', 'Trends & analytics', 'Extended nutrients'],
  },
  {
    id: 'free' as const, name: 'Free', badge: 'FOREVER', bc: Colors.greenDim, bcc: Colors.green,
    feats: ['3 AI scans/day', 'Barcode scanning', 'Manual logging', 'Daily dashboard', 'Health sync'],
  },
];

function getPrice(id: string, annual: boolean) {
  if (id === 'free') return { amount: '$0', period: 'forever', annual: '' };
  if (id === 'plus') return annual
    ? { amount: '$3', period: '/mo', annual: '$35.99/year' }
    : { amount: '$4.99', period: '/mo', annual: '' };
  return annual
    ? { amount: '$5', period: '/mo', annual: '$59.99/year' }
    : { amount: '$9.99', period: '/mo', annual: '' };
}

export default function TierSelectScreen({ navigation }: any) {
  const { onboarding: ob, updateOnboarding, setSubscription } = useStore();
  const annual = ob.billing === 'annual';
  const [purchasing, setPurchasing] = useState(false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);

  const { session } = useStore();

  useEffect(() => {
    getOfferings().then(setPackages).catch(() => {});
  }, []);

  async function handleStart() {
    // If paid tier selected, attempt RevenueCat purchase
    if (ob.tier !== 'free' && packages.length > 0) {
      setPurchasing(true);
      try {
        const tierKeyword = ob.tier === 'pro'
          ? (annual ? 'pro_annual' : 'pro_monthly')
          : (annual ? 'plus_annual' : 'plus_monthly');
        const pkg = packages.find((p) =>
          p.identifier.toLowerCase().includes(tierKeyword) ||
          p.identifier.toLowerCase().includes(ob.tier)
        );
        if (pkg) {
          const info = await purchasePackage(pkg);
          if (info) {
            const confirmedTier = getTierFromEntitlements(info);
            setSubscription(confirmedTier);
          } else {
            // User cancelled — fall back to free
            setSubscription('free');
            updateOnboarding('tier', 'free');
          }
        } else {
          // Package not found — set tier client-side (demo mode)
          setSubscription(ob.tier);
        }
      } catch (err: any) {
        Alert.alert('Purchase Failed', err.message || 'Try again or continue with Free.');
        setPurchasing(false);
        return;
      } finally {
        setPurchasing(false);
      }
    } else {
      setSubscription(ob.tier);
    }

    // Save onboarding profile to Supabase
    if (session?.user?.id) {
      const { error } = await supabase
        .from('intake_profiles')
        .update({
          name: ob.name,
          age: ob.age,
          height_inches: ob.height,
          weight_lbs: ob.weight,
          goal: ob.goal === 'health' ? 'maintain' : ob.goal,
          activity_level: ob.activity === 1.2 ? 'sedentary' : ob.activity === 1.375 ? 'light' : ob.activity === 1.55 ? 'moderate' : 'active',
          calorie_target: (ob as any).target || 2000,
          protein_target: (ob as any).protein || 150,
          carb_target: (ob as any).carbs || 200,
          fat_target: (ob as any).fat || 65,
          subscription_tier: ob.tier,
        })
        .eq('id', session.user.id);

      if (error) {
        console.warn('Profile save error:', error.message);
      }
    }

    navigation.navigate('MainTabs');
  }

  const ctaStyles: Record<string, any> = {
    free: { backgroundColor: Colors.card, borderWidth: 2, borderColor: 'rgba(52,199,89,0.3)' },
    plus: { backgroundColor: Colors.blue },
    pro: { backgroundColor: Colors.purple },
  };
  const ctaTextColor: Record<string, string> = {
    free: Colors.green, plus: '#fff', pro: '#fff',
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>How do you want to use Snack AI?</Text>
        <Text style={styles.sub}>Pick what fits. You can change anytime in Settings.</Text>
      </View>

      {/* Billing toggle */}
      <View style={styles.billToggle}>
        <View style={[styles.billSlider, { left: annual ? 3 : '50%' }]} />
        <TouchableOpacity style={[styles.billBtn, annual && styles.billBtnOn]}
          onPress={() => updateOnboarding('billing', 'annual')}>
          <Text style={[styles.billText, annual && { color: '#fff' }]}>
            Annual <View style={styles.saveBadge}><Text style={styles.saveText}>SAVE 40%</Text></View>
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.billBtn, !annual && styles.billBtnOn]}
          onPress={() => updateOnboarding('billing', 'monthly')}>
          <Text style={[styles.billText, !annual && { color: '#fff' }]}>Monthly</Text>
        </TouchableOpacity>
      </View>

      {/* Tier cards */}
      {TIERS.map((t) => {
        const sel = ob.tier === t.id;
        const price = getPrice(t.id, annual);
        return (
          <TouchableOpacity key={t.id} onPress={() => updateOnboarding('tier', t.id)}
            style={[styles.tierCard, sel && { borderColor: t.bcc, backgroundColor: `${t.bcc}0A` }]}>
            {sel && <View style={[styles.tierTop, { backgroundColor: t.bcc }]} />}
            <View style={[styles.radio, sel && { borderWidth: 6, borderColor: t.bcc }]} />
            <View style={styles.tierHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.tierName}>{t.name}</Text>
                <View style={[styles.tierBadge, { backgroundColor: t.bc }]}>
                  <Text style={[styles.tierBadgeText, { color: t.bcc }]}>{t.badge}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.tierPrice}>{price.amount}<Text style={styles.tierPeriod}>{price.period}</Text></Text>
                {price.annual ? <Text style={styles.tierAnnual}>{price.annual}</Text> : null}
              </View>
            </View>
            <View style={styles.feats}>
              {t.feats.map((f, i) => (
                <Text key={i} style={styles.feat}>
                  <Text style={{ color: t.bcc }}>✓</Text> {f}
                </Text>
              ))}
            </View>
          </TouchableOpacity>
        );
      })}

      {/* CTA */}
      <TouchableOpacity style={[styles.cta, ctaStyles[ob.tier], purchasing && { opacity: 0.6 }]}
        onPress={handleStart} disabled={purchasing}>
        {purchasing ? (
          <ActivityIndicator color={ctaTextColor[ob.tier]} />
        ) : (
          <Text style={[styles.ctaText, { color: ctaTextColor[ob.tier] }]}>
            {ob.tier === 'free' ? 'Get Started Free' :
              ob.tier === 'plus' ? (annual ? 'Start Plus — $35.99/year' : 'Start Plus — $4.99/mo') :
                (annual ? 'Start Pro — $59.99/year' : 'Start Pro — $9.99/mo')}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.safe}>No trials that auto-charge. No hidden fees.{'\n'}Change your plan anytime in Settings.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 24, paddingTop: 56 },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '700', color: Colors.t1 },
  sub: { fontSize: 12, color: Colors.t3 },
  billToggle: {
    flexDirection: 'row', backgroundColor: Colors.card,
    borderRadius: 10, padding: 3, marginBottom: 18, position: 'relative',
  },
  billSlider: {
    position: 'absolute', top: 3, width: '48%', height: '85%',
    backgroundColor: Colors.ember, borderRadius: 8, zIndex: 1,
  },
  billBtn: { flex: 1, padding: 8, alignItems: 'center', zIndex: 2 },
  billBtnOn: {},
  billText: { fontSize: 11, fontWeight: '600', color: Colors.t3 },
  saveBadge: { backgroundColor: Colors.greenDim, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, marginLeft: 4 },
  saveText: { fontSize: 8, fontWeight: '700', color: Colors.green },
  tierCard: {
    borderWidth: 2, borderColor: '#2A2A2E', borderRadius: 18,
    padding: 16, marginBottom: 10, backgroundColor: Colors.card,
    position: 'relative', overflow: 'hidden',
  },
  tierTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  radio: {
    position: 'absolute', top: 16, right: 16,
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#2A2A2E',
  },
  tierHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 6, paddingRight: 30,
  },
  tierName: { fontSize: 15, fontWeight: '700', color: Colors.t1 },
  tierBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  tierBadgeText: { fontSize: 8, fontWeight: '700' },
  tierPrice: { fontSize: 18, fontWeight: '700', color: Colors.t1 },
  tierPeriod: { fontSize: 9, color: Colors.t3 },
  tierAnnual: { fontSize: 9, color: Colors.t3 },
  feats: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  feat: { fontSize: 10, color: Colors.t2 },
  cta: {
    padding: 15, borderRadius: 14, alignItems: 'center', marginTop: 4,
  },
  ctaText: { fontSize: 14, fontWeight: '700' },
  safe: { textAlign: 'center', marginTop: 12, fontSize: 10, color: Colors.t3, lineHeight: 14 },
});
