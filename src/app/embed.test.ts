import { describe, expect, it } from 'vitest';
import { actionWorkflow } from './EmbedPanel';

describe('actionWorkflow', () => {
  it('spells out the projects input only when asked', () => {
    expect(actionWorkflow({ login: 'octo', cards: 'projects', projects: 10 })).toContain(
      '          projects: 10 # how many to list, from 1 to 50\n',
    );
    expect(actionWorkflow({ login: 'octo', cards: 'skyline' })).not.toContain('projects:');
  });
});
