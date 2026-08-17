// screens/LoginScreen.jsx
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { styles } from '../styles';
import { api, setAuthToken } from '../api';

export default function LoginScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot' | 'reset'
  const [email, setEmail] = useState('demo@startrack.app');
  const [password, setPassword] = useState('StarTrack123!');
  const [displayName, setDisplayName] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  // True once a reset code has been requested for this 'forgot' visit —
  // reveals a manual "Enter Reset Code" step instead of assuming the code
  // arrived instantly, since it's now actually emailed rather than handed
  // back in the request's response.
  const [resetRequested, setResetRequested] = useState(false);

  const submit = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'forgot') {
        const data = await api.forgotPassword({ email: email.trim() });
        setMessage(data.message || "If that email is registered, we've sent a password reset code to it.");
        setResetRequested(true);
        return;
      }

      if (mode === 'reset') {
        await api.resetPassword({ token: resetToken.trim(), new_password: newPassword });
        setMessage('Password reset was successful. You can now sign in.');
        setMode('login');
        setResetRequested(false);
        setPassword('');
        setNewPassword('');
        setResetToken('');
        return;
      }

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
          {mode === 'login' && 'Sign in to your gourmet passport'}
          {mode === 'register' && 'Create your gourmet passport'}
          {mode === 'forgot' && !resetRequested && 'Recover access to your account'}
          {mode === 'forgot' && resetRequested && 'Check your email for a reset code'}
          {mode === 'reset' && 'Enter the code we emailed you'}
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

          {(mode === 'login' || mode === 'register' || (mode === 'forgot' && !resetRequested)) && (
            <>
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
            </>
          )}

          {mode === 'reset' && (
            <>
              <Text style={styles.inputLabel}>Reset Code</Text>
              <TextInput
                style={[styles.input, { marginBottom: 12 }]}
                value={resetToken}
                onChangeText={setResetToken}
                placeholder="Code from the email we sent you"
                placeholderTextColor="#555"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>New Password</Text>
              <TextInput
                style={[styles.input, { marginBottom: 16 }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password"
                placeholderTextColor="#555"
                secureTextEntry
              />
            </>
          )}

          {(mode === 'login' || mode === 'register') && (
            <>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={[styles.input, { marginBottom: 16 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="********"
                placeholderTextColor="#555"
                secureTextEntry
              />
            </>
          )}

          {error ? <Text style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 12 }}>{error}</Text> : null}
          {message ? <Text style={{ color: '#d2a14c', fontSize: 12, marginBottom: 12 }}>{message}</Text> : null}

          {mode === 'forgot' && resetRequested ? (
            <Pressable style={styles.copyShareButton} onPress={() => { setError(''); setMessage(''); setMode('reset'); }}>
              <Text style={styles.copyShareButtonText}>Enter Reset Code</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.copyShareButton} onPress={submit} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#09090d" />
              ) : (
                <Text style={styles.copyShareButtonText}>{
                  mode === 'login' ? 'Sign In' :
                  mode === 'register' ? 'Create Account' :
                  mode === 'forgot' ? 'Send Reset Code' :
                  'Reset Password'
                }</Text>
              )}
            </Pressable>
          )}
        </View>

        <Pressable
          style={{ marginTop: 20, alignItems: 'center' }}
          onPress={() => {
            setError('');
            setMessage('');
            setResetRequested(false);
            setResetToken('');
            setNewPassword('');
            if (mode === 'login') setMode('register');
            else if (mode === 'register') setMode('login');
            else if (mode === 'forgot') setMode('login');
            else if (mode === 'reset') setMode('login');
          }}
        >
          <Text style={{ color: '#d2a14c', fontSize: 13, fontWeight: '700' }}>
            {mode === 'login' ? "Don't have an account? Create one" :
             mode === 'register' ? 'Already have an account? Sign in' :
             'Back to sign in'}
          </Text>
        </Pressable>

        {mode === 'login' && (
          <Pressable style={{ marginTop: 12, alignItems: 'center' }} onPress={() => { setError(''); setMessage(''); setResetRequested(false); setMode('forgot'); }}>
            <Text style={{ color: '#8e8982', fontSize: 12 }}>Forgot password?</Text>
          </Pressable>
        )}

        {mode === 'login' && (
          <Text style={{ color: '#555', fontSize: 11, textAlign: 'center', marginTop: 16 }}>
            Demo login: demo@startrack.app / StarTrack123!
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
