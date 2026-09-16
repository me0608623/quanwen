import React, { useCallback, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { getTaskDetail, submitTask } from '../api/tasks';
import { ApiError } from '../api/client';
import type { AnswerInput, PublicQuestion, PublicSurvey } from '../types/api';
import {
  Button,
  ErrorText,
  LoadingCenter,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import type { AppStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'TaskDetail'>;

type AnswersState = Record<
  string,
  { textAnswer?: string; selectedOptionIds?: string[]; ratingValue?: number }
>;

function sortQuestions(qs: PublicQuestion[]) {
  return [...qs].sort((a, b) => a.sortOrder - b.sortOrder);
}

function OptionChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: selected ? '#1D4ED8' : '#CBD5E1',
        backgroundColor: selected ? '#DBEAFE' : '#fff',
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: '#0F172A' }}>{label}</Text>
    </Pressable>
  );
}

export function TaskDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { token } = useAuth();
  const [survey, setSurvey] = useState<PublicSurvey | null>(null);
  const [answers, setAnswers] = useState<AnswersState>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [startedAt] = useState(() => new Date().toISOString());
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const data = await getTaskDetail(token, id);
      setSurvey(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '無法載入問卷');
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const questions = useMemo(
    () => (survey ? sortQuestions(survey.questions) : []),
    [survey],
  );

  const setSingle = (qid: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: { selectedOptionIds: [optionId] } }));
  };

  const toggleMulti = (qid: string, optionId: string) => {
    setAnswers((prev) => {
      const cur = prev[qid]?.selectedOptionIds ?? [];
      const next = cur.includes(optionId)
        ? cur.filter((x) => x !== optionId)
        : [...cur, optionId];
      return { ...prev, [qid]: { selectedOptionIds: next } };
    });
  };

  const setText = (qid: string, textAnswer: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: { textAnswer } }));
  };

  const setRating = (qid: string, ratingValue: number) => {
    setAnswers((prev) => ({ ...prev, [qid]: { ratingValue } }));
  };

  const validate = (): string | null => {
    for (const q of questions) {
      if (!q.isRequired) continue;
      const a = answers[q.id];
      if (q.type === 'text') {
        if (!a?.textAnswer?.trim()) return `請回答：${q.title}`;
      } else if (q.type === 'rating') {
        if (a?.ratingValue == null) return `請評分：${q.title}`;
      } else if (q.type === 'single_choice' || q.type === 'multiple_choice') {
        if (!a?.selectedOptionIds?.length) return `請選擇：${q.title}`;
      } else if (q.type === 'matrix') {
        if (!a?.textAnswer?.trim()) return `請回答矩陣題（文字）：${q.title}`;
      }
    }
    return null;
  };

  const onSubmit = async () => {
    if (!token || !survey) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const payload: AnswerInput[] = [];
      for (const q of questions) {
        const a = answers[q.id];
        if (!a) continue;
        if (q.type === 'text' || q.type === 'matrix') {
          if (!a.textAnswer?.trim()) continue;
          payload.push({ questionId: q.id, textAnswer: a.textAnswer });
          continue;
        }
        if (q.type === 'rating') {
          if (a.ratingValue == null) continue;
          payload.push({ questionId: q.id, ratingValue: a.ratingValue });
          continue;
        }
        if (!a.selectedOptionIds?.length) continue;
        payload.push({ questionId: q.id, selectedOptionIds: a.selectedOptionIds });
      }

      if (payload.length === 0) {
        setError('請至少回答一題');
        return;
      }

      await submitTask(token, survey.id, { answers: payload, startedAt });
      setDoneMsg('提交成功！品質審核後將發放獎勵。');
      setTimeout(() => navigation.navigate('Tasks'), 1200);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '提交失敗');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingCenter />;
  if (!survey) {
    return (
      <Screen>
        <ErrorText>{error ?? '問卷不存在'}</ErrorText>
        <Button title="返回" variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  if (survey.alreadySubmitted) {
    return (
      <Screen>
        <Title>{survey.title}</Title>
        <Subtitle>你已經填過這份問卷了</Subtitle>
        <Button title="返回列表" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  if (survey.externalUrl) {
    return (
      <Screen>
        <Title>{survey.title}</Title>
        <Subtitle>此問卷為外部連結，請在瀏覽器完成</Subtitle>
        <Button title="開啟外部問卷" onPress={() => void Linking.openURL(survey.externalUrl!)} />
        <Button title="返回" variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const unsupported = questions.filter((q) => q.type === 'matrix');

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <Title>{survey.title}</Title>
        {!!survey.description && <Subtitle>{survey.description}</Subtitle>}
        <Text style={{ color: '#1D4ED8', fontWeight: '600', marginBottom: 12 }}>
          {survey.rewardMode === 'lottery'
            ? `抽獎：${survey.lotteryPrize ?? '獎品'}`
            : `獎勵 ${survey.rewardPoints} 點`}
        </Text>

        {unsupported.length > 0 && (
          <Text style={{ color: '#B45309', marginBottom: 12 }}>
            注意：矩陣題目前以文字欄位簡化作答（MVP）。
          </Text>
        )}

        {questions.map((q, idx) => {
          const sortedOpts = [...q.options].sort((a, b) => a.sortOrder - b.sortOrder);
          const maxRating =
            typeof q.config?.max === 'number'
              ? (q.config.max as number)
              : typeof q.config?.scale === 'number'
                ? (q.config.scale as number)
                : 5;

          return (
            <View
              key={q.id}
              style={{
                backgroundColor: '#fff',
                borderRadius: 12,
                padding: 14,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: '#E2E8F0',
              }}
            >
              <Text style={{ fontWeight: '700', fontSize: 15, color: '#0F172A' }}>
                {idx + 1}. {q.title}
                {q.isRequired ? ' *' : ''}
              </Text>
              {!!q.description && (
                <Text style={{ color: '#64748B', marginTop: 4 }}>{q.description}</Text>
              )}

              {(q.type === 'single_choice') &&
                sortedOpts.map((opt) => (
                  <OptionChip
                    key={opt.id}
                    label={opt.label}
                    selected={answers[q.id]?.selectedOptionIds?.[0] === opt.id}
                    onPress={() => setSingle(q.id, opt.id)}
                  />
                ))}

              {q.type === 'multiple_choice' &&
                sortedOpts.map((opt) => (
                  <OptionChip
                    key={opt.id}
                    label={opt.label}
                    selected={!!answers[q.id]?.selectedOptionIds?.includes(opt.id)}
                    onPress={() => toggleMulti(q.id, opt.id)}
                  />
                ))}

              {(q.type === 'text' || q.type === 'matrix') && (
                <TextInput
                  multiline
                  value={answers[q.id]?.textAnswer ?? ''}
                  onChangeText={(t) => setText(q.id, t)}
                  placeholder={q.type === 'matrix' ? '請以文字描述矩陣回答（簡化）' : '請輸入回答'}
                  placeholderTextColor="#94A3B8"
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    borderRadius: 8,
                    minHeight: 80,
                    padding: 10,
                    textAlignVertical: 'top',
                    color: '#0F172A',
                  }}
                />
              )}

              {q.type === 'rating' && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {Array.from({ length: maxRating }, (_, i) => i + 1).map((n) => {
                    const selected = answers[q.id]?.ratingValue === n;
                    return (
                      <Pressable
                        key={n}
                        onPress={() => setRating(q.id, n)}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: selected ? '#1D4ED8' : '#E2E8F0',
                        }}
                      >
                        <Text style={{ color: selected ? '#fff' : '#0F172A', fontWeight: '700' }}>
                          {n}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        <ErrorText>{error}</ErrorText>
        {!!doneMsg && <Text style={{ color: '#15803D', marginBottom: 8 }}>{doneMsg}</Text>}
        <Button
          title={submitting ? '提交中…' : '提交答案'}
          onPress={() => void onSubmit()}
          disabled={submitting || !!doneMsg}
        />
        <Button title="返回" variant="secondary" onPress={() => navigation.goBack()} />
      </ScrollView>
    </Screen>
  );
}
