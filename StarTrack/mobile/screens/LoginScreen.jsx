// screens/LoginScreen.jsx
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { styles } from '../styles';
import { api, setAuthToken } from '../api';

export default function LoginScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('demo@startrack.app');
  const [password, setPassword] = useState('StarTrack123!');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const payload = mode === 'login'
        ? { email: email.trim(), password }
        : { email: email.trim(), password, display_name: displayName.trim() };
      const data = mode === 'login' ? await api.login(payload) : await api.register(payload);
      await setAuthToken(data.token);
      onAuthenticated(data.user);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: '#09090d' }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
        <Text style={[styles.title, { marginBottom: 4, textAlign: 'center' }]}>StarTrack</Text>
        <Text style={{ color: '#8e8982', textAlign: 'center', marginBottom: 32, fontSize: 13 }}>
          {mode === 'login' ? 'Sign in to your gourmet passport' : 'Create your gourmet passport'}
        </Text>

        <View style={styles.splitterCard}>
          {mode === 'register' && (
            <>
              <Text style={styles.inputLabel}>Display Name</Text>
              <TextInput
                style={[styles.input, { marginBottom: 12 }]}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Laura Liu"
                placeholderTextColor="#555"
                autoCapitalize="words"
              />
            </>
          )}

          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={[styles.input, { marginBottom: 12 }]}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#555"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={[styles.input, { marginBottom: 16 }]}
            value={password}
            onChangeText={setPassword}
            placeholder="********"
            placeholderTextColor="#555"
            secureTextEntry
          />

          {error ? <Text style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 12 }}>{error}</Text> : null}

          <Pressable style={styles.copyShareButton} onPress={submit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#09090d" />
            ) : (
              <Text style={styles.copyShareButtonText}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>
            )}
          </Pressable>
        </View>

        <Pressable
          style={{ marginTop: 20, alignItems: 'center' }}
          onPress={() => { setError(''); setMode(mode === 'login' ? 'register' : 'login'); }}
        >
          <Text style={{ color: '#d2a14c', fontSize: 13, fontWeight: '700' }}>
            {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
          </Text>
        </Pressable>

        {mode === 'login' && (
          <Text style={{ color: '#555', fontSize: 11, textAlign: 'center', marginTop: 16 }}>
            Demo login: demo@startrack.app / StarTrack123!
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
