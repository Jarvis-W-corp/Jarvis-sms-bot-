import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Colors } from '../constants/theme';
import { signUp } from '../services/auth';

export default function WelcomeScreen({ navigation }: any) {
  const [showSignup, setShowSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!email || !password || !name) return Alert.alert('Error', 'Fill in all fields');
    if (password.length < 6) return Alert.alert('Error', 'Password must be at least 6 characters');
    setLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password, name.trim());
      navigation.navigate('Onboarding');
    } catch (err: any) {
      Alert.alert('Signup Failed', err.message || 'Try again');
    } finally {
      setLoading(false);
    }
  }

  if (!showSignup) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.emoji}>🔍</Text>
          <Text style={styles.logo}>Snack AI</Text>
          <Text style={styles.subtitle}>SEE WHAT YOU EAT</Text>
          <Text style={styles.desc}>Scan, track, and understand your food with AI that actually gets it right.</Text>

          <TouchableOpacity style={styles.cta} onPress={() => setShowSignup(true)}>
            <Text style={styles.ctaText}>Get Started with Snack AI</Text>
          </TouchableOpacity>

          <Text style={styles.footer}>Takes about 2 minutes · No payment required</Text>

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: 20 }}>
            <Text style={styles.login}>
              Already have an account? <Text style={{ color: Colors.ember, fontWeight: '600' }}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🔍</Text>
        <Text style={styles.logo}>Snack AI</Text>
        <Text style={[styles.subtitle, { marginBottom: 24 }]}>CREATE YOUR ACCOUNT</Text>

        <TextInput
          style={styles.input} placeholder="Your name" placeholderTextColor={Colors.t3}
          value={name} onChangeText={setName} autoCapitalize="words"
        />
        <TextInput
          style={styles.input} placeholder="Email" placeholderTextColor={Colors.t3}
          value={email} onChangeText={setEmail}
          keyboardType="email-address" autoCapitalize="none"
        />
        <TextInput
          style={styles.input} placeholder="Password (6+ characters)" placeholderTextColor={Colors.t3}
          value={password} onChangeText={setPassword} secureTextEntry
        />

        <TouchableOpacity
          style={[styles.cta, loading && { opacity: 0.6 }]}
          onPress={handleSignup} disabled={loading}
        >
          <Text style={styles.ctaText}>{loading ? 'Creating Account...' : 'Create Account & Continue'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowSignup(false)} style={{ marginTop: 16 }}>
          <Text style={styles.login}>
            <Text style={{ color: Colors.ember, fontWeight: '600' }}>← Back</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24, textAlign: 'center',
  },
  emoji: { fontSize: 56, marginBottom: 18 },
  logo: {
    fontSize: 34, fontWeight: '800',
    color: Colors.ember, // gradient text not native — use solid ember
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11, color: Colors.t3, letterSpacing: 2,
    textTransform: 'uppercase', marginBottom: 6,
  },
  desc: {
    fontSize: 13, color: Colors.t2, lineHeight: 20.8,
    marginBottom: 36, textAlign: 'center', maxWidth: 260,
  },
  cta: {
    width: '100%', padding: 15, borderRadius: 14,
    backgroundColor: Colors.ember, alignItems: 'center',
    shadowColor: Colors.ember, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 18,
  },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  input: {
    backgroundColor: Colors.card, borderWidth: 2, borderColor: '#2A2A2E',
    borderRadius: 14, padding: 13, paddingHorizontal: 16,
    color: Colors.t1, fontSize: 15, marginBottom: 14, width: '100%',
  },
  footer: { fontSize: 10, color: Colors.t3, marginTop: 14 },
  login: { fontSize: 12, color: Colors.t2, textAlign: 'center' },
});
