import { describe, expect, it } from 'vitest';
import { loginFromPath, urls } from './urls';

describe('urls.profile', () => {
  it('links to the profile path', () => {
    expect(urls.profile('octocat')).toBe('/u/octocat');
  });

  it('appends UTM tags for snippets', () => {
    expect(urls.profile('octocat', { source: 'readme', medium: 'card', campaign: 'skyline' })).toBe(
      '/u/octocat?utm_source=readme&utm_medium=card&utm_campaign=skyline',
    );
  });
});

describe('urls.card', () => {
  it('only writes weather into the link when it is off', () => {
    expect(urls.card('octocat', 'skyline')).toBe('/card/?user=octocat&id=skyline');
    expect(urls.card('octocat', 'skyline', { weather: true })).toBe('/card/?user=octocat&id=skyline');
    expect(urls.card('octocat', 'skyline', { embed: true, weather: false })).toBe('/card/?user=octocat&id=skyline&embed&weather=off');
  });
});

describe('loginFromPath', () => {
  it('reads the login from a profile path, with or without a trailing slash', () => {
    expect(loginFromPath('/u/octocat')).toBe('octocat');
    expect(loginFromPath('/u/octo-cat/')).toBe('octo-cat');
  });

  it('ignores every other page', () => {
    for (const path of ['/', '/u/', '/u', '/rank/', '/u/octocat/skyline', '/card/', '/u/not_valid']) expect(loginFromPath(path)).toBeNull();
  });
});
