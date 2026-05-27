'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface RespondentProfile {
  id: string;
  userId: string;
  ageRange: string | null;
  gender: string | null;
  region: string | null;
  occupation: string | null;
  industry: string | null;
  industryOther: string | null;
  education: string | null;
  reputationScore: number;
  completionRate: string | null;
  totalCompleted: number;
  isOnboardingDone: boolean;
  tags: { id: string; name: string; category: string }[];
}

export interface SurveyorProfile {
  id: string;
  userId: string;
  institutionName: string | null;
  researchPurpose: string | null;
  isVerified: boolean;
  isOnboardingDone: boolean;
}

export interface InterestTag {
  id: string;
  name: string;
  category: string;
  sortOrder: number;
}

export function useMyProfile() {
  return useQuery<RespondentProfile | SurveyorProfile | null>({
    queryKey: ['profile', 'me'],
    queryFn: async () => {
      const { data } = await api.get('/profile/me');
      return data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTags() {
  return useQuery<InterestTag[]>({
    queryKey: ['tags'],
    queryFn: async () => {
      const { data } = await api.get('/tags');
      return data;
    },
    staleTime: 60 * 60 * 1000, // tags don't change often
  });
}

export type AgeRange = 'under_18' | '18_24' | '25_34' | '35_44' | '45_54' | '55_plus';
export type Gender = 'male' | 'female' | 'non_binary' | 'prefer_not_to_say';
export type Occupation =
  | 'student' | 'employed_full_time' | 'employed_part_time'
  | 'self_employed' | 'unemployed' | 'retired' | 'homemaker' | 'other';
export type Industry =
  | 'info_tech' | 'manufacturing' | 'engineering_construction' | 'healthcare'
  | 'education' | 'finance' | 'legal' | 'public_sector' | 'service' | 'food_beverage'
  | 'hospitality_travel' | 'retail_wholesale' | 'transport_logistics' | 'agriculture'
  | 'arts_media' | 'marketing_pr' | 'nonprofit' | 'freelance' | 'student' | 'other';
export type Education =
  | 'junior_high' | 'senior_high' | 'vocational'
  | 'bachelor' | 'master' | 'phd' | 'other';

export interface UpdateRespondentProfileDto {
  ageRange?: AgeRange;
  gender?: Gender;
  region?: string;
  occupation?: Occupation;
  industry?: Industry;
  industryOther?: string;
  education?: Education;
  tagIds?: string[];
}

export function useUpdateRespondentProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: UpdateRespondentProfileDto) => {
      const { data } = await api.put<RespondentProfile>('/profile/respondent', dto);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['profile', 'me'], data);
    },
  });
}

export interface UpdateSurveyorProfileDto {
  institutionName?: string;
  researchPurpose?: string;
}

export function useUpdateSurveyorProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: UpdateSurveyorProfileDto) => {
      const { data } = await api.put<SurveyorProfile>('/profile/surveyor', dto);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['profile', 'me'], data);
    },
  });
}
