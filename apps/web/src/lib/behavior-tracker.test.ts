import { describe, it, expect } from 'vitest';
import { detectIntervention } from './behavior-tracker';

describe('detectIntervention', () => {
  it('returns null for a clean log', () => {
    expect(detectIntervention({})).toBeNull();
    expect(detectIntervention({ pasteEventCount: 2, windowSwitchCount: 3 })).toBeNull();
  });

  it('flags excessive paste (> 2)', () => {
    const r = detectIntervention({ pasteEventCount: 3 });
    expect(r?.type).toBe('paste_open_question');
  });

  it('flags excessive window switching (> 3)', () => {
    const r = detectIntervention({ windowSwitchCount: 4 });
    expect(r?.type).toBe('window_switching');
  });

  it('does not flag at the threshold boundaries', () => {
    expect(detectIntervention({ pasteEventCount: 2 })).toBeNull();
    expect(detectIntervention({ windowSwitchCount: 3 })).toBeNull();
  });

  it('prioritises paste over window switching when both trip', () => {
    const r = detectIntervention({ pasteEventCount: 5, windowSwitchCount: 5 });
    expect(r?.type).toBe('paste_open_question');
  });
});
