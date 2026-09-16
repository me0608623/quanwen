/** Mirrors apps/web auth + tasks shapes against NestJS /api/v1 */

export type UserRole = 'surveyor' | 'respondent' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  status: 'active' | 'suspended' | 'pending_verify';
  emailVerified: boolean;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export interface AvailableSurvey {
  id: string;
  title: string;
  description?: string;
  category?: string | null;
  rewardPoints: number;
  rewardMode?: 'fixed' | 'lottery';
  lotteryPrize?: string | null;
  targetCount: number;
  completedCount: number;
  expiresAt?: string;
  isAnonymous: boolean;
  questionCount?: number;
  estimatedMinutes?: number | null;
  externalUrl?: string | null;
  coverImageUrl?: string;
}

export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'text'
  | 'rating'
  | 'matrix';

export interface PublicQuestion {
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
  sortOrder: number;
  isRequired: boolean;
  config?: Record<string, unknown>;
  options: { id: string; label: string; sortOrder: number }[];
  imageUrl?: string;
}

export interface PublicSurvey {
  id: string;
  title: string;
  description?: string;
  rewardPoints: number;
  rewardMode?: 'fixed' | 'lottery';
  lotteryPrize?: string | null;
  isAnonymous: boolean;
  externalUrl?: string | null;
  estimatedMinutes?: number | null;
  alreadySubmitted: boolean;
  questions: PublicQuestion[];
}

export interface AnswerInput {
  questionId: string;
  textAnswer?: string;
  selectedOptionIds?: string[];
  ratingValue?: number;
}

export interface MyResponseRecord {
  responseId: string;
  surveyId: string;
  status: string;
  submittedAt?: string;
  surveyTitle: string;
  rewardPoints: number;
  rewardMode?: 'fixed' | 'lottery';
  lotteryPrize?: string | null;
  qualityScore?: number | null;
}

export interface ApiErrorBody {
  message?: string | string[];
  statusCode?: number;
  error?: string;
}
