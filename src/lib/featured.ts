// Logins that get prerendered pages, so their links answer 200 and unfurl with a preview: the home page examples
// plus SNAPSHOT_USERS, which the Pages build passes in. Build time only, it reads process.env.

import { SITE } from '../site';
import { isValidLogin } from './profile';

export function featuredLogins(): string[] {
  const logins = [...SITE.examples, ...(process.env.SNAPSHOT_USERS ?? '').split(/[\s,]+/)].map((l) => l.trim().toLowerCase());
  return [...new Set(logins.filter(isValidLogin))];
}
