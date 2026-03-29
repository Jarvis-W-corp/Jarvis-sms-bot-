import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Colors, FontSize, FontWeight } from '../constants/theme';

interface CalRingProps {
  eaten: number;
  burned?: number;
  target: number;
  dark?: boolean;
  size?: number;
}

export default function CalRing({ eaten, burned = 0, target, dark = true, size = 130 }: CalRingProps) {
  const net = eaten - burned;
  const pct = Math.min(net / target, 1.2);
  const color = pct >= 1 ? Colors.red : pct >= 0.85 ? Colors.yellow : Colors.green;
  const radius = (size - 18) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = Math.round(circumference * (1 - Math.min(pct, 1)));
  const glow = pct >= 0.95 && pct <= 1.05;

  const burnRadius = radius - 10;
  const burnCirc = 2 * Math.PI * burnRadius;
  const burnOffset = Math.round(burnCirc * (1 - Math.min(burned / 600, 1)));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: '-90deg' }] }}>
        {/* Background ring */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={dark ? '#2A2A2E' : '#E8E8ED'} strokeWidth={9}
        />
        {/* Progress ring */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        {/* Burned ring (inner, cyan) */}
        {burned > 0 && (
          <Circle
            cx={size / 2} cy={size / 2} r={burnRadius}
            fill="none" stroke={Colors.cyan} strokeWidth={4}
            strokeLinecap="round" opacity={0.6}
            strokeDasharray={burnCirc}
            strokeDashoffset={burnOffset}
          />
        )}
      </Svg>
      <View style={[styles.center, { width: size, height: size }]}>
        <Text style={[styles.number, { color: dark ? Colors.t1 : Colors.t1Light }]}>
          {net.toLocaleString()}
        </Text>
        <Text style={[styles.sub, { color: dark ? Colors.t3 : Colors.t3Light }]}>
          {burned > 0 ? `net of ${target.toLocaleString()}` : `of ${target.toLocaleString()} kcal`}
        </Text>
        {burned > 0 && (
          <Text style={styles.burned}>🔥 -{burned}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
  center: {
    position: 'absolute', top: 0, left: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  number: { fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  sub: { fontSize: 9, marginTop: 2 },
  burned: { fontSize: 8, color: Colors.cyan, marginTop: 1 },
});
