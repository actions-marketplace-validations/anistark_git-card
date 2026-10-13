import { submitVersus } from './lookup';

/** On a profile: pick a rival and go straight to vs/<login>/<rival>. */
export function Challenge({ login }: { login: string }) {
  return (
    <form
      className="lookup challenge"
      role="search"
      data-a={login}
      onSubmit={(event) => {
        event.preventDefault();
        submitVersus(event.currentTarget);
      }}
    >
      <label htmlFor="challenge" className="eyebrow">
        Challenge @{login}
      </label>
      <div className="lookup-row hud">
        <span className="lookup-at" aria-hidden="true">
          vs @
        </span>
        <input id="challenge" name="b" required autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="a rival's handle" />
        <button type="submit">Fight</button>
      </div>
    </form>
  );
}
