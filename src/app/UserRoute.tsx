import { cardFromPath, loginFromPath } from '../lib/urls';
import CardApp from './CardApp';
import ProfileApp from './ProfileApp';

/** On the 404 page: u/<login> and u/<login>/c/<card> paths have no file of their own, so they render here. */
export default function UserRoute() {
  if (loginFromPath(location.pathname)) return <ProfileApp />;
  if (cardFromPath(location.pathname)) return <CardApp />;
  return null;
}
