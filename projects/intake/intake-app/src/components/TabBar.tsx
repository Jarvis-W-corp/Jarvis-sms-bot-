import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg';
import { Colors } from '../constants/theme';

interface TabBarProps {
  active: number;
  onTab: (index: number) => void;
  dark?: boolean;
}

const TAB_ICONS = [
  { label: 'Home', path: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { label: 'Stats', path: 'M18 20V10M12 20V4M6 20v-6' },
  null, // camera
  { label: 'Plan', path: null }, // complex SVG
  { label: 'Profile', path: null }, // complex SVG
];

export default function TabBar({ active, onTab, dark = true }: TabBarProps) {
  return (
    <View style={[styles.container, {
      backgroundColor: dark ? 'rgba(13,13,15,0.88)' : 'rgba(245,245,247,0.92)',
      borderTopColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    }]}>
      {/* Home */}
      <TouchableOpacity style={[styles.tab, active === 0 && styles.tabActive]} onPress={() => onTab(0)}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={active === 0 ? Colors.ember : (dark ? Colors.t2 : Colors.t2Light)} strokeWidth={2}>
          <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </Svg>
        <Text style={[styles.tabLabel, active === 0 && { color: Colors.ember }]}>Home</Text>
      </TouchableOpacity>

      {/* Stats */}
      <TouchableOpacity style={[styles.tab, active === 1 && styles.tabActive]} onPress={() => onTab(1)}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={active === 1 ? Colors.ember : (dark ? Colors.t2 : Colors.t2Light)} strokeWidth={2}>
          <Path d="M18 20V10M12 20V4M6 20v-6" />
        </Svg>
        <Text style={[styles.tabLabel, active === 1 && { color: Colors.ember }]}>Stats</Text>
      </TouchableOpacity>

      {/* Camera (center) */}
      <TouchableOpacity style={styles.camBtn} onPress={() => onTab(2)}>
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5}>
          <Rect x={3} y={3} width={18} height={18} rx={4} />
          <Circle cx={12} cy={12} r={3} />
        </Svg>
      </TouchableOpacity>

      {/* Plan */}
      <TouchableOpacity style={[styles.tab, active === 3 && styles.tabActive]} onPress={() => onTab(3)}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={active === 3 ? Colors.ember : (dark ? Colors.t2 : Colors.t2Light)} strokeWidth={2}>
          <Rect x={3} y={4} width={18} height={18} rx={2} />
          <Line x1={16} y1={2} x2={16} y2={6} />
          <Line x1={8} y1={2} x2={8} y2={6} />
          <Line x1={3} y1={10} x2={21} y2={10} />
        </Svg>
        <Text style={[styles.tabLabel, active === 3 && { color: Colors.ember }]}>Plan</Text>
      </TouchableOpacity>

      {/* Profile */}
      <TouchableOpacity style={[styles.tab, active === 4 && styles.tabActive]} onPress={() => onTab(4)}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={active === 4 ? Colors.ember : (dark ? Colors.t2 : Colors.t2Light)} strokeWidth={2}>
          <Circle cx={12} cy={8} r={4} />
          <Path d="M20 21a8 8 0 0 0-16 0" />
        </Svg>
        <Text style={[styles.tabLabel, active === 4 && { color: Colors.ember }]}>Profile</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 84, borderTopWidth: 1,
    flexDirection: 'row', justifyContent: 'space-around',
    alignItems: 'flex-start', paddingTop: 10,
  },
  tab: {
    alignItems: 'center', gap: 3, opacity: 0.4,
  },
  tabActive: { opacity: 1 },
  tabLabel: { fontSize: 10, color: Colors.t2 },
  camBtn: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    marginTop: -14,
    shadowColor: Colors.ember,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
    backgroundColor: Colors.ember,
  },
});
