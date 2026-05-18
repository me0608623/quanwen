// ─── User Types ───────────────────────────────────────────────────────────────

export type UserRole = 'surveyor' | 'respondent' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'pending_verify';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
}

// ─── API Response Envelope ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResult {
  user: Pick<User, 'id' | 'email' | 'displayName' | 'role'>;
  token: string;
}
