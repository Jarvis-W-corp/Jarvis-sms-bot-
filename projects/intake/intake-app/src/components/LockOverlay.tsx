import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

interface LockOverlayProps {
  tier: 'plus' | 'pro';
  onUpgrade?: () => void;
}

export default function LockOverlay({ tier, onUpgrade }: LockOverlayProps) {
  const isPro = tier === 'pro';

  return (
    <TouchableOpacity
      style={styles.overlay}
      activeOpacity={0.9}
      onPress={onUpgrade}
    >
      <Text style={styles.icon}>🔒</Text>
      <Text style={styles.text}>{isPro ? 'Pro' : 'Plus'} Feature</Text>
      <View style={[styles.btn, {
        backgroundColor: isPro ? Colors.purple : Colors.blue,
      }]}>
        <Text style={styles.btnText}>Upgrade to {isPro ? 'Pro' : 'Plus'}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    backgroundColor: 'rgba(13,13,15,0.7)',
    borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  icon: { fontSize: 20 },
  text: { fontSize: 10, fontWeight: '600', color: Colors.t2 },
  btn: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 7, marginTop: 2,
  },
  btnText: { fontSize: 10, fontWeight: '700', color: '#fff' },
});
