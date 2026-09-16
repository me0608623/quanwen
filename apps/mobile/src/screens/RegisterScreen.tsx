import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { Button, ErrorText, Field, Screen, Subtitle, Title } from '../components/ui';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      await register({ email, password, displayName });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '註冊失敗');
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
          <Title>註冊受試者</Title>
          <Subtitle>密碼需含大寫字母與數字，至少 8 字元</Subtitle>
          <Field
            label="顯示名稱"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="小明"
          />
          <Field
            label="電子郵件"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
          />
          <Field
            label="密碼"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Example1"
          />
          <ErrorText>{error}</ErrorText>
          <Button title={busy ? '註冊中…' : '建立帳號'} onPress={onSubmit} disabled={busy} />
          <Button
            title="已有帳號？返回登入"
            variant="secondary"
            onPress={() => navigation.goBack()}
            disabled={busy}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
