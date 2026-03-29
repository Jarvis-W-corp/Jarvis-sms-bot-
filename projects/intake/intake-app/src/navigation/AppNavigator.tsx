import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';
import { useStore } from '../store/useStore';
import { getSession, onAuthStateChange } from '../services/auth';
import { supabase } from '../services/supabase';
import { initPurchases, getCustomerInfo, getTierFromEntitlements, identifyUser } from '../services/purchases';

// Screens
import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ResultsScreen from '../screens/ResultsScreen';
import TierSelectScreen from '../screens/TierSelectScreen';
import HomeScreen from '../screens/HomeScreen';
import StatsScreen from '../screens/StatsScreen';
import ScanScreen from '../screens/ScanScreen';
import PlanScreen from '../screens/PlanScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TabBar from '../components/TabBar';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { dark } = useStore();

  return (
    <Tab.Navigator
      tabBar={(props) => {
        const index = props.state.index;
        return (
          <TabBar
            active={index}
            onTab={(i) => {
              const routes = ['Home', 'Stats', 'Scan', 'Plan', 'Profile'];
              props.navigation.navigate(routes[i]);
            }}
            dark={dark}
          />
        );
      }}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="Scan" component={ScanScreen} />
      <Tab.Screen name="Plan" component={PlanScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { session, setSession, setUser, setSubscription } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession().then(async (s) => {
      setSession(s);
      if (s?.user) {
        // Load profile
        const { data } = await supabase
          .from('intake_profiles')
          .select('*')
          .eq('id', s.user.id)
          .single();
        if (data) setUser(data);

        // Init RevenueCat and restore subscription state
        await initPurchases(s.user.id);
        await identifyUser(s.user.id);
        const info = await getCustomerInfo();
        const tier = getTierFromEntitlements(info);
        if (tier !== 'free') setSubscription(tier);
      }
      setLoading(false);
    });

    const { data: { subscription } } = onAuthStateChange(async (s) => {
      setSession(s);
      if (!s) setUser(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 56, marginBottom: 12 }}>🔍</Text>
        <Text style={{ color: Colors.ember, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 }}>
          Snack AI
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          {session ? (
            <>
              {/* Authenticated — go straight to app */}
              <Stack.Screen name="MainTabs" component={MainTabs} options={{ gestureEnabled: false }} />
            </>
          ) : (
            <>
              {/* Auth / Onboarding flow */}
              <Stack.Screen name="Welcome" component={WelcomeScreen} />
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
              <Stack.Screen name="Results" component={ResultsScreen} />
              <Stack.Screen name="TierSelect" component={TierSelectScreen} />
              <Stack.Screen name="MainTabs" component={MainTabs} options={{ gestureEnabled: false }} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
