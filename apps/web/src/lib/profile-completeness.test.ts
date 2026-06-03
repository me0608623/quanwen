import { describe, expect, it } from 'vitest';
import { profileCompleteness } from './profile-completeness';

const base = { ageRange: null, gender: null, region: null, occupation: null, industry: null, education: null, tags: [] } as any;

describe('profileCompleteness', () => {
  it('全空 → 0%', () => {
    expect(profileCompleteness(base).percent).toBe(0);
  });
  it('全填（含標籤）→ 100%', () => {
    const full = { ageRange:'25-34', gender:'male', region:'台北市', occupation:'engineer', industry:'tech', education:'bachelor', tags:[{id:'1',name:'x',category:'y'}] } as any;
    const c = profileCompleteness(full);
    expect(c.percent).toBe(100);
    expect(c.filled).toBe(c.total);
  });
  it('部分填 → 介於', () => {
    const c = profileCompleteness({ ...base, gender:'female', region:'台中市' });
    expect(c.filled).toBe(2);
    expect(c.percent).toBe(Math.round((2/7)*100));
  });
});
