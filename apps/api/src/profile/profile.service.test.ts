import { Test, TestingModule } from '@nestjs/testing';
import { DB } from '../db/database.module';
import type { AppDb } from '../db';
import { ProfileService } from './profile.service';
import { eq, inArray } from 'drizzle-orm';
import { respondentProfiles, surveyorProfiles, respondentTags, interestTags } from '../db/schema';
import { vi } from 'vitest';

/** Build a chainable mock for Drizzle select queries */
function mockSelectChain(finalValue: any[]) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(finalValue),
    innerJoin: vi.fn().mockReturnThis(),
  };
  return chain;
}

describe('ProfileService', () => {
  let service: ProfileService;
  let db: AppDb;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        {
          provide: DB,
          useValue: {
            select: vi.fn(),
            insert: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
    db = module.get<AppDb>(DB);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRespondentProfile', () => {
    it('should return null when profile does not exist', async () => {
      const profileChain = mockSelectChain([]);
      vi.mocked(db.select).mockReturnValue(profileChain as any);

      const result = await service.getRespondentProfile('test-user-id');

      expect(result).toBeNull();
      expect(profileChain.from).toHaveBeenCalledWith(respondentProfiles);
    });

    it('should return profile with tags when it exists', async () => {
      const mockProfile = {
        id: 'profile-id',
        userId: 'test-user-id',
        age: 25,
        gender: 'male',
      };

      const tagRows = [
        { id: 'tag-1', name: 'Technology', category: 'Interests' },
        { id: 'tag-2', name: 'Travel', category: 'Hobbies' },
      ];

      // First call: select profile
      const profileChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockProfile]),
      };

      // Second call: select tags
      const tagChain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(tagRows),
      };

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(((fields?: any) => {
        callCount++;
        if (callCount === 1) return profileChain as any;
        return tagChain as any;
      }) as any);

      const result = await service.getRespondentProfile('test-user-id');

      expect(result).toEqual({
        ...mockProfile,
        tags: tagRows,
      });
      expect(tagChain.innerJoin).toHaveBeenCalled();
    });
  });

  describe('getSurveyorProfile', () => {
    it('should return null when surveyor profile does not exist', async () => {
      const chain = mockSelectChain([]);
      vi.mocked(db.select).mockReturnValue(chain as any);

      const result = await service.getSurveyorProfile('test-user-id');

      expect(result).toBeNull();
    });

    it('should return surveyor profile when it exists', async () => {
      const mockProfile = {
        id: 'surveyor-profile-id',
        userId: 'test-user-id',
        institutionName: 'Test Org',
        researchPurpose: 'Market Research',
      };

      const chain = mockSelectChain([mockProfile]);
      vi.mocked(db.select).mockReturnValue(chain as any);

      const result = await service.getSurveyorProfile('test-user-id');

      expect(result).toEqual(mockProfile);
    });
  });

  describe('upsertRespondentProfile', () => {
    it('should create new profile when it does not exist', async () => {
      const dto = {
        age: 30,
        gender: 'female',
        education: 'master',
        income: 'high',
      };

      // select existing → empty
      const selectChain = mockSelectChain([]);
      // insert → returning
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'new-profile-id' }]),
      };
      // final getRespondentProfile call → returns the profile
      const finalProfileChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 'new-profile-id', userId: 'test-user-id' }]),
      };
      const finalTagChain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };

      let selectCall = 0;
      vi.mocked(db.select).mockImplementation(((fields?: any) => {
        selectCall++;
        if (selectCall === 1) return selectChain as any; // check existing
        if (selectCall === 2) return finalProfileChain as any; // getRespondentProfile profile
        return finalTagChain as any; // getRespondentProfile tags
      }) as any);
      vi.mocked(db.insert).mockReturnValue(mockInsert as any);

      const result = await service.upsertRespondentProfile('test-user-id', dto as any);

      expect(result).not.toBeNull();
      expect(mockInsert.values).toHaveBeenCalled();
    });

    it('should update existing profile when it exists', async () => {
      const dto = {
        age: 31,
        gender: 'female',
        education: 'phd',
        income: 'high',
      };

      const existingProfile = { id: 'existing-profile-id' };

      // select existing → found
      const selectChain = mockSelectChain([existingProfile]);
      // update
      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      // final getRespondentProfile
      const finalProfileChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ ...existingProfile, userId: 'test-user-id' }]),
      };
      const finalTagChain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };

      let selectCall = 0;
      vi.mocked(db.select).mockImplementation(((fields?: any) => {
        selectCall++;
        if (selectCall === 1) return selectChain as any;
        if (selectCall === 2) return finalProfileChain as any;
        return finalTagChain as any;
      }) as any);
      vi.mocked(db.update).mockReturnValue(mockUpdate as any);

      const result = await service.upsertRespondentProfile('test-user-id', dto as any);

      expect(result).not.toBeNull();
      expect(mockUpdate.set).toHaveBeenCalled();
    });
  });

  describe('upsertSurveyorProfile', () => {
    it('should create new surveyor profile when it does not exist', async () => {
      const dto = {
        institutionName: 'New Org',
        researchPurpose: 'Finance Research',
      };

      const selectChain = mockSelectChain([]);
      const mockInsert = {
        values: vi.fn().mockResolvedValue(undefined),
      };

      // For the final select in upsertSurveyorProfile
      const finalSelectChain = mockSelectChain([{
        id: 'new-id',
        userId: 'test-user-id',
        ...dto,
      }]);

      let selectCall = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) return selectChain as any;
        return finalSelectChain as any;
      });
      vi.mocked(db.insert).mockReturnValue(mockInsert as any);

      const result = await service.upsertSurveyorProfile('test-user-id', dto as any);

      expect(result).not.toBeNull();
      expect(mockInsert.values).toHaveBeenCalled();
    });

    it('should update existing surveyor profile when it exists', async () => {
      const dto = {
        institutionName: 'Updated Org',
        researchPurpose: 'Healthcare Research',
      };

      const existingProfile = { id: 'existing-surveyor-id' };

      const selectChain = mockSelectChain([existingProfile]);
      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      const finalSelectChain = mockSelectChain([{
        id: 'existing-surveyor-id',
        userId: 'test-user-id',
        ...dto,
      }]);

      let selectCall = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) return selectChain as any;
        return finalSelectChain as any;
      });
      vi.mocked(db.update).mockReturnValue(mockUpdate as any);

      const result = await service.upsertSurveyorProfile('test-user-id', dto as any);

      expect(result).not.toBeNull();
      expect(mockUpdate.set).toHaveBeenCalled();
    });
  });

  describe('getMyProfile', () => {
    it('should call getRespondentProfile for respondent role', async () => {
      const getRespondentProfileSpy = vi.spyOn(service, 'getRespondentProfile').mockResolvedValue({
        id: 'profile-id',
        userId: 'test-user-id',
      } as any);

      await service.getMyProfile('test-user-id', 'respondent');

      expect(getRespondentProfileSpy).toHaveBeenCalledWith('test-user-id');
    });

    it('should call getSurveyorProfile for surveyor role', async () => {
      const getSurveyorProfileSpy = vi.spyOn(service, 'getSurveyorProfile').mockResolvedValue({
        id: 'surveyor-id',
        userId: 'test-user-id',
      } as any);

      await service.getMyProfile('test-user-id', 'surveyor');

      expect(getSurveyorProfileSpy).toHaveBeenCalledWith('test-user-id');
    });

    it('should return null for admin role', async () => {
      const result = await service.getMyProfile('test-user-id', 'admin');

      expect(result).toBeNull();
    });
  });
});
