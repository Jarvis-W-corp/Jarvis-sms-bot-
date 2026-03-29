import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Colors } from '../constants/theme';
import { signIn } from '../services/auth';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) return Alert.alert('Error', 'Fill in all fields');
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Check your credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <Text style={styles.logo}>🔍</Text>
        <Text style={styles.logoText}>Snack AI</Text>
        <Text style={styles.subtitle}>Welcome back</Text>

        <TextInput
          style={styles.input} placeholder="Email" placeholderTextColor={Colors.t3}
          value={email} onChangeText={setEmail}
          keyboardType="email-address" autoCapitalize="none"
        />
        <TextInput
          style={styles.input} placeholder="Password" placeholderTextColor={Colors.t3}
          value={password} onChangeText={setPassword} secureTextEntry
        />

        <TouchableOpacity
          style={[styles.btn, loading && { opacity: 0.6 }]}
          onPress={handleLogin} disabled={loading}
        >
          <Text style={styles.btnText}>{loading ? 'Signing In...' : 'Sign In'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Welcome')}>
          <Text style={styles.switchText}>
            Don't have an account? <Text style={{ color: Colors.ember, fontWeight: '600' }}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logo: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  logoText: { fontSize: 26, fontWeight: '800', color: Colors.ember, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: Colors.t3, textAlign: 'center', marginBottom: 36 },
  input: {
    backgroundColor: Colors.card, borderWidth: 2, borderColor: '#2A2A2E',
    borderRadius: 14, padding: 13, paddingHorizontal: 16,
    color: Colors.t1, fontSize: 15, marginBottom: 14,
  },
  btn: {
    padding: 15, borderRadius: 14, backgroundColor: Colors.ember,
    alignItems: 'center', marginBottom: 16, marginTop: 4,
    shadowColor: Colors.ember, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 18,
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  switchText: { color: Colors.t2, textAlign: 'center', fontSize: 12 },
});
