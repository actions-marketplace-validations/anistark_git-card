import { cardFromPath, cityFromPath, loginFromPath, versusFromPath } from '../lib/urls';
import CardApp from './CardApp';
import CityApp from './CityApp';
import ProfileApp from './ProfileApp';
import VersusApp from './VersusApp';

/** On the 404 page: profile, card, versus and city district paths have no file of their own, so they render here. */
export default function PathRoute() {
  if (loginFromPath(location.pathname)) return <ProfileApp />;
  if (cardFromPath(location.pathname)) return <CardApp />;
  if (versusFromPath(location.pathname)) return <VersusApp />;
  if (cityFromPath(location.pathname)) return <CityApp />;
  return null;
}
