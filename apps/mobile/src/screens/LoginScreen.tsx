import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { Button, ErrorText, Field, Screen, Subtitle, Title } from '../components/ui';
import type { AuthStackParamList } from '../navigation/types';
import { getApiBaseUrl } from '../api/client';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '登入失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          <Title>券問 QuanWen</Title>
          <Subtitle>受試者登入 · 填問卷賺獎勵</Subtitle>
          <Field
            label="電子郵件"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
          />
          <Field
            label="密碼"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="至少 8 字元"
          />
          <ErrorText>{error}</ErrorText>
          <Button title={busy ? '登入中…' : '登入'} onPress={onSubmit} disabled={busy} />
          <Button
            title="註冊受試者帳號"
            variant="secondary"
            onPress={() => navigation.navigate('Register')}
            disabled={busy}
          />
          <Text style={{ marginTop: 16, color: '#94A3B8', fontSize: 12 }}>
            API: {getApiBaseUrl()}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
