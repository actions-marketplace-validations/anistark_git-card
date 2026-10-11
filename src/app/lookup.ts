import { isValidLogin } from '../lib/profile';
import { urls } from '../lib/urls';

/** Lookup forms go straight to u/<login>. Takes the handle as typed, with or without an @. */
export function submitLookup(form: HTMLFormElement): void {
  const input = form.elements.namedItem('login') as HTMLInputElement;
  const login = input.value.trim().replace(/^@/, '');
  if (!isValidLogin(login)) {
    input.setCustomValidity('GitHub usernames are letters, numbers and single hyphens.');
    input.reportValidity();
    input.addEventListener('input', () => input.setCustomValidity(''), { once: true });
    return;
  }
  location.assign(urls.profile(login));
}
