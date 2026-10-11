import { loginFromPath } from '../lib/urls';
import ProfileApp from './ProfileApp';

/** On the 404 page: a u/<login> path has no file of its own, so the profile renders here. */
export default function ProfileRoute() {
  return loginFromPath(location.pathname) ? <ProfileApp /> : null;
}
