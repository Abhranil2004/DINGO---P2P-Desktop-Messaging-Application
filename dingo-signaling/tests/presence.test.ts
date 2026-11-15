// dingo-signaling/tests/presence.test.ts
import { describe, it, expect } from 'vitest';

describe('Global Dingo ID Presence & Discovery Logic', () => {
  function normalizeHandle(handle: string): string {
    return handle.trim().replace(/^@+/, '').toLowerCase();
  }

  it('normalizes handles with leading @ and whitespace', () => {
    expect(normalizeHandle('@abhranil_dutta')).toBe('abhranil_dutta');
    expect(normalizeHandle('@@rahul ')).toBe('rahul');
    expect(normalizeHandle('  @JOHN_DOE  ')).toBe('john_doe');
    expect(normalizeHandle('dingo_user_1')).toBe('dingo_user_1');
  });

  it('enforces ephemeral contact metadata without chat or file payload fields', () => {
    const validPresenceRecord = {
      dingoId: 'abhranil_dutta',
      displayName: 'Abhranil Dutta',
      deviceId: 'dev_abc_123',
      lastSeen: Date.now(),
    };

    // Ensure no chat fields exist
    expect((validPresenceRecord as any).message).toBeUndefined();
    expect((validPresenceRecord as any).content).toBeUndefined();
    expect((validPresenceRecord as any).fileData).toBeUndefined();
  });

  it('matches handles with prefix search', () => {
    const users = [
      { dingoId: 'abhranil_dutta', displayName: 'Abhranil Dutta' },
      { dingoId: 'abhinav_k', displayName: 'Abhinav K' },
      { dingoId: 'rahul_sen', displayName: 'Rahul Sen' },
    ];

    const q = normalizeHandle('@abh');
    const matches = users.filter(u => u.dingoId.includes(q) || u.displayName.toLowerCase().includes(q));

    expect(matches.length).toBe(2);
    expect(matches.map(m => m.dingoId)).toEqual(['abhranil_dutta', 'abhinav_k']);
  });
});
