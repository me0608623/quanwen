// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setToken, getToken, removeToken, TOKEN_KEY } from './token';

describe('token storage', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
  });

  it('round-trips a token through localStorage', () => {
    expect(getToken()).toBeNull();
    setToken('abc.def.ghi');
    expect(getToken()).toBe('abc.def.ghi');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('abc.def.ghi');
  });

  it('writes the token to a cookie', () => {
    setToken('cookie-token');
    expect(document.cookie).toContain(`${TOKEN_KEY}=cookie-token`);
  });

  it('removeToken clears storage', () => {
    setToken('to-be-removed');
    removeToken();
    expect(getToken()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
