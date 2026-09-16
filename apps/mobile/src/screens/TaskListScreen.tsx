import React, { useCallback, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { listAvailableTasks } from '../api/tasks';
import { ApiError } from '../api/client';
import type { AvailableSurvey } from '../types/api';
import { Button, Card, ErrorText, LoadingCenter, Screen, Subtitle, Title } from '../components/ui';
import type { AppStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Tasks'>;

export function TaskListScreen({ navigation }: Props) {
  const { token, user, logout } = useAuth();
  const [items, setItems] = useState<AvailableSurvey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const data = await listAvailableTasks(token);
      setItems(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '無法載入任務');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  if (loading) return <LoadingCenter />;

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        <Title>可填問卷</Title>
        <Subtitle>
          你好，{user?.displayName ?? '受試者'}
          {user?.role !== 'respondent' ? `（角色：${user?.role}）` : ''}
        </Subtitle>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Button title="填答紀錄" variant="secondary" onPress={() => navigation.navigate('History')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="登出" variant="danger" onPress={() => void logout()} />
          </View>
        </View>
        <ErrorText>{error}</ErrorText>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListEmptyComponent={
          <Text style={{ color: '#64748B', textAlign: 'center', marginTop: 40 }}>
            目前沒有可填問卷
          </Text>
        }
        renderItem={({ item }) => (
          <Card onPress={() => navigation.navigate('TaskDetail', { id: item.id })}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A' }}>{item.title}</Text>
            {!!item.description && (
              <Text numberOfLines={2} style={{ color: '#64748B', marginTop: 4 }}>
                {item.description}
              </Text>
            )}
            <Text style={{ marginTop: 8, color: '#1D4ED8', fontWeight: '600' }}>
              {item.rewardMode === 'lottery'
                ? `抽獎：${item.lotteryPrize ?? '獎品'}`
                : `${item.rewardPoints} 點`}
              {item.questionCount != null ? ` · ${item.questionCount} 題` : ''}
              {item.estimatedMinutes != null ? ` · 約 ${item.estimatedMinutes} 分` : ''}
            </Text>
          </Card>
        )}
      />
    </Screen>
  );
}
