import { isValidLogin } from '../lib/profile';
import { urls } from '../lib/urls';

const INVALID = 'GitHub usernames are letters, numbers and single hyphens.';

/** The handle in a form field, as typed, with or without an @. Flags the field and returns null when it is not valid. */
function handle(form: HTMLFormElement, name: string): string | null {
  const input = form.elements.namedItem(name) as HTMLInputElement;
  const login = input.value.trim().replace(/^@/, '');
  if (isValidLogin(login)) return login;
  flag(input, INVALID);
  return null;
}

function flag(input: HTMLInputElement, message: string) {
  input.setCustomValidity(message);
  input.reportValidity();
  input.addEventListener('input', () => input.setCustomValidity(''), { once: true });
}

/** Lookup forms go straight to u/<login>. */
export function submitLookup(form: HTMLFormElement): void {
  const login = handle(form, 'login');
  if (login) location.assign(urls.profile(login));
}

/** Versus forms go straight to vs/<a>/<b>. A form with no `a` field challenges on behalf of its `data-a` login. */
export function submitVersus(form: HTMLFormElement): void {
  const a = form.elements.namedItem('a') ? handle(form, 'a') : (form.dataset.a ?? null);
  const b = a && handle(form, 'b');
  if (!a || !b) return;
  if (a.toLowerCase() === b.toLowerCase())
    return flag(form.elements.namedItem('b') as HTMLInputElement, 'Pick a rival, not the same handle twice.');
  location.assign(urls.versus(a, b));
}
