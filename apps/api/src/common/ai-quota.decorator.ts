import { SetMetadata } from '@nestjs/common';
import type { AI_FEATURE_TYPE } from './ai-usage.service';

export const AI_QUOTA_FEATURE_KEY = 'aiQuotaFeature';

export const AiQuota = (feature: AI_FEATURE_TYPE) => SetMetadata(AI_QUOTA_FEATURE_KEY, feature);
