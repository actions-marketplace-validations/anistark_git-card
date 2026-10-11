## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Project notes

- The site is fully static (GitHub Pages). Profiles load in the browser from public, unauthenticated APIs in `src/lib/public-api.ts`. Never add anything that needs a token in the browser.
- The README card generator (`scripts/generate.tsx`, used by `action.yml` and the Pages workflow) runs in GitHub Actions with a free token and uses GraphQL via `src/lib/github.ts`. Both paths must end in `normalize()` so cards see the same `Profile`.
- All internal links go through `src/lib/urls.ts`, because the site lives under a base path (`/git-card/`). Never hardcode `/u/...` or `/rank`.
- Profiles live at `u/<login>`. A static host has no rewrites, so GitHub Pages serves `404.html` for those paths and it renders the profile (`UserRoute`). Logins in `SITE.examples` and `SNAPSHOT_USERS` get a prerendered `u/[login]` page instead, so their links answer 200 and unfurl. Lookup forms go straight to `u/<login>` (`submitLookup()`). Cards live at `u/<login>/c/<card>`, served the same way (`UserRoute` on `404.html`, prerendered `u/[login]/c/[card]` pages for featured logins from `featuredLogins()`). There are no query-string forms for profiles or cards. `?embed` and `?theme=` are read by an inline script in `Base.astro` before first paint.
- The contribution calendar comes from third-party sources in `src/lib/calendar.ts`, tried in order with three attempts each for transient failures (timeouts, 5xx, 429), then the next source. The profile renders first (`onPartial`) with `calendar: 'loading'`, and calendar cards take `calendarLoading` to show a scanning state instead of "offline". Any new source must send CORS headers and be checked from a browser, not just curl.
- The rate limit is 60 core requests an hour and 10 searches a minute per visitor. Keep a profile load at or under about 8 core requests and 5 searches, and keep the one-hour localStorage cache.
- Site name, repo, Action slug and social links live in `src/site.ts`.
- `/stats` is unlinked on purpose, opened directly by URL. It reads `history.json` from the `stats` branch on raw.githubusercontent.com, or `public/stats.local.json` in dev, which `just stats` writes. The daily Stats workflow (`scripts/stats.ts`) merges a snapshot into it with `mergeSnapshot()` in `src/lib/stats.ts`. Repo traffic needs the `STATS_TOKEN` secret, a fine-grained token with Administration read-only on this repo. Without it the run skips traffic. Never commit stats data to `main`.
- Users pin the Action to the moving major tag in `SITE.action` (`v0` now). Release with `just release <version>`, never by moving tags by hand. A breaking change to the Action's inputs or output needs a new major.
- Google Analytics (`SITE.analytics`) loads from an inline script in `Base.astro`, only when `location.hostname` matches its host and never under `?embed`. EEA, UK and Swiss visitors get cookieless pings, and ad signals are denied everywhere. Send custom events through `track()` in `src/lib/analytics.ts`, never `gtag` directly.
- Keys in `src/cards/registry.ts` are public URL slugs and file names. Never rename one.
- The `citizen` card shows the GitHub avatar. A standalone SVG cannot load remote images, so the Action embeds it as a data URI (`avatarData()` in `scripts/generate.tsx`, passed as the `avatar` card prop) and the embed panel inlines it on download. Roles and the bounty are fixed rules in `src/lib/citizen.ts`. Recheck a few well-known profiles before changing a threshold.
- Cards are pure React SVG components with no hooks or effects, because they also render to standalone `.svg` files in Node.
- Copy rules: no em dashes or semicolons in user-facing text.
- Use the justfile: `just dev`, `just format`, `just ci` (format check, lint, types, tests, build). Run `just ci` before calling a change done.
- Prettier turns line breaks in `.astro` markup into spaces, so never put punctuation directly after an inline element there. Restructure the copy or generate the punctuation with CSS.
- The site is dark only for now: `LIGHT_THEME = false` in `src/cards/style.ts` hides the toggle and the embed theme picker and makes every theme render dark. Keep the DAY tokens working so it can be switched back on.
- Theme is "Night City": colors live in `src/cards/style.ts` (`THEME_CSS`, plus the standalone SVG tokens), not in CSS files. Yellow (`--accent`/`--signal`) is UI chrome, cyan (`--data`) is data, neon green (`--hot`) is the heatmap's peak day and super-elite highlights. In the skyline only, the peak tower is neon green (`--peak`) and empty days are sea (`--sea`, one color, with a gentle wave animation).
- OG images (`src/og`) are rendered by resvg, which only understands class selectors and plain colors. New card CSS must go through `flattenCss` cleanly (no new CSS functions beyond `var()` and `color-mix()`), and text must use glyphs the bundled fonts in `src/og/fonts` have. Draw icons as shapes. The same pipeline makes the PNG download in the embed panel (`cardPng()` in `src/app/export.ts`, with resvg and the fonts lazy loaded from `src/app/png.ts`), so it covers every card.
- Never put an SVG filter (like `gc-glow`) on a perfectly horizontal or vertical line. Its bounding box has zero width or height, so the filter clips it away.
- The rank model is `src/lib/rank.ts`, and `/rank` renders its constants. Change weights or medians there only, keep `src/lib/rank.test.ts` passing (typical developer at D, empty profile at F, one viral repo not elite), and recheck a few well-known profiles before shipping a change.
- If dev starts failing with "file does not exist in the optimize deps directory" after packages change, stop the server, delete `node_modules/.vite` and start again.
- The logo source is `assets/brand/git-card-logo.png`. Everything derived from it (public/brand, favicons, the embedded `src/brand/logo-data.ts` used in cards and OG images) comes from `just brand`. Never edit those by hand.
- Layout: header, main and footer span 90% of the viewport. No `max-width` caps on text or containers, and no hard line breaks (`<br>`) in copy. Let text wrap naturally, with `text-wrap: balance` on headings.
