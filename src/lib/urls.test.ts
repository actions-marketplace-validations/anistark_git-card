import { describe, expect, it } from 'vitest';
import { cardFromPath, loginFromPath, urls } from './urls';

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
  it('links to the card under the profile path', () => {
    expect(urls.card('OctoCat', 'skyline')).toBe('/u/octocat/c/skyline');
    expect(urls.card('octocat', 'top-repos', { embed: true })).toBe('/u/octocat/c/top-repos?embed');
  });

  it('only writes weather into the link when it is off', () => {
    expect(urls.card('octocat', 'skyline', { weather: true })).toBe('/u/octocat/c/skyline');
    expect(urls.card('octocat', 'skyline', { embed: true, weather: false })).toBe('/u/octocat/c/skyline?embed&weather=off');
  });
});

describe('loginFromPath', () => {
  it('reads the login from a profile path, with or without a trailing slash', () => {
    expect(loginFromPath('/u/octocat')).toBe('octocat');
    expect(loginFromPath('/u/octo-cat/')).toBe('octo-cat');
  });

  it('ignores every other page', () => {
    for (const path of ['/', '/u/', '/u', '/rank/', '/u/octocat/skyline', '/u/octocat/c/skyline', '/card/', '/u/not_valid'])
      expect(loginFromPath(path)).toBeNull();
  });
});

describe('cardFromPath', () => {
  it('reads the login and card from a card path, with or without a trailing slash', () => {
    expect(cardFromPath('/u/octocat/c/skyline')).toEqual({ login: 'octocat', card: 'skyline' });
    expect(cardFromPath('/u/octo-cat/c/top-repos/')).toEqual({ login: 'octo-cat', card: 'top-repos' });
  });

  it('ignores every other page', () => {
    for (const path of ['/u/octocat', '/u/octocat/c', '/u/octocat/c/', '/u/octocat/skyline', '/card/', '/u/not_valid/c/skyline'])
      expect(cardFromPath(path)).toBeNull();
  });
});
