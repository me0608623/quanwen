import { apiRequest } from './client';
import type { AnswerInput, AvailableSurvey, MyResponseRecord, PublicSurvey } from '../types/api';

export function listAvailableTasks(token: string, category?: string) {
  return apiRequest<AvailableSurvey[]>('/tasks', {
    token,
    params: category ? { category } : undefined,
  });
}

export function getTaskDetail(token: string, id: string) {
  return apiRequest<PublicSurvey>(`/tasks/${id}`, { token });
}

export function submitTask(
  token: string,
  id: string,
  payload: { answers: AnswerInput[]; startedAt?: string },
) {
  return apiRequest<{ responseId?: string; status?: string }>(`/tasks/${id}/submit`, {
    method: 'POST',
    token,
    body: payload,
  });
}

export function listMyHistory(token: string) {
  return apiRequest<MyResponseRecord[]>('/tasks/history', { token });
}
