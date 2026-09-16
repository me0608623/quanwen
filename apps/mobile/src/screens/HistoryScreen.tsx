import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { listMyHistory } from '../api/tasks';
import { ApiError } from '../api/client';
import type { MyResponseRecord } from '../types/api';
import { Card, ErrorText, LoadingCenter, Screen, Subtitle, Title } from '../components/ui';
import type { AppStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'History'>;

export function HistoryScreen(_props: Props) {
  const { token } = useAuth();
  const [items, setItems] = useState<MyResponseRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const data = await listMyHistory(token);
      setItems(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '無法載入紀錄');
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
      <View style={{ paddingHorizontal: 16 }}>
        <Title>填答紀錄</Title>
        <Subtitle>你的提交狀態與獎勵</Subtitle>
        <ErrorText>{error}</ErrorText>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.responseId}
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
          <Text style={{ color: '#64748B', textAlign: 'center', marginTop: 40 }}>尚無填答紀錄</Text>
        }
        renderItem={({ item }) => (
          <Card>
            <Text style={{ fontWeight: '700', fontSize: 16 }}>{item.surveyTitle}</Text>
            <Text style={{ color: '#64748B', marginTop: 4 }}>
              狀態：{item.status}
              {item.submittedAt ? ` · ${new Date(item.submittedAt).toLocaleString('zh-TW')}` : ''}
            </Text>
            <Text style={{ color: '#1D4ED8', marginTop: 6, fontWeight: '600' }}>
              {item.rewardMode === 'lottery'
                ? `抽獎：${item.lotteryPrize ?? '獎品'}`
                : `${item.rewardPoints} 點`}
              {item.qualityScore != null ? ` · 品質 ${item.qualityScore}` : ''}
            </Text>
          </Card>
        )}
      />
    </Screen>
  );
}
