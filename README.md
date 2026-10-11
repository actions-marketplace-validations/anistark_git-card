<p align="center">
  <img src="public/brand/logo.png" alt="GIT CARD" width="360" />
</p>

# git-card

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-git--card-FCEE0A?style=flat-square&logo=githubactions&logoColor=white&labelColor=0A0A0C)](https://github.com/marketplace/actions/git-card)

Type a GitHub username and get a 3D contribution skyline, an F to SSS rank, streaks, languages, top repos and an organization breakdown. Every card has its own link, and every card can go into a README.

It is a static site. Profiles are built in the visitor's browser from public APIs, so there is no server and no token to run it.

## Use it

| URL                                         | What it is                                           |
| ------------------------------------------- | ---------------------------------------------------- |
| `u/<login>`                                 | The full profile                                     |
| `card/?user=<login>&id=<card>`              | One card on its own page, with embed options         |
| `card/?user=<login>&id=<card>&embed`        | Just the card, for an `<iframe>`                     |
| `card/?user=<login>&id=skyline&weather=off` | The skyline without its weather                      |
| `cards/<login>/<card>[-dark\|-light].svg`   | Hosted card image, for the logins the site publishes |

Everything is dark themed for now. The light theme is switched off with `LIGHT_THEME` in `src/cards/style.ts`.

Cards: `skyline`, `rank`, `overview`, `streak`, `heatmap`, `languages`, `top-repos`, `orgs`.

Some days in the calendar hide easter eggs. Each one hangs a small neon sign on its tower in the skyline, and the profile page lists the ones found.

The skyline has weather, read from your last week of work against your own usual week. It changes on its own as the Action re-renders every day. Turn it off with `weather: off` in the Action, or `&weather=off` on a card page.

### Put a card in a README

READMEs only show images, and GitHub fetches them through its own image proxy, so a card in a README has to be a real `.svg` file. Every card's Embed panel offers whichever of these fits:

1. **Hosted image.** The Pages build publishes cards for the logins in `SNAPSHOT_USERS` (the repository owner by default) and refreshes them daily. The Embed panel shows the Markdown for those.
2. **The GitHub Action.** Add it to your profile repository and it re-renders your cards every day and commits them:

   ```yaml
   # .github/workflows/git-card.yml
   name: git-card
   on:
     schedule: [{ cron: '17 3 * * *' }]
     workflow_dispatch:
   permissions:
     contents: write
   jobs:
     cards:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v5
         - uses: anistark/git-card@v0
           with:
             cards: skyline,rank # or "all"
         - run: |
             git config user.name "github-actions[bot]"
             git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
             git add git-card
             git diff --staged --quiet || git commit -m "Update git-card"
             git push
   ```

   Then in your README: `![Contribution skyline](./git-card/skyline.svg)`.

3. **Download.** Every card downloads as a standalone `.svg` from its Embed panel. It will not update by itself.

The 3D view needs JavaScript, so READMEs get the isometric SVG skyline. For the live 3D city, embed the card page in an iframe on a blog or portfolio.

## Develop

Needs Node 22+, [pnpm](https://pnpm.io) and [just](https://github.com/casey/just). No token is needed to run the site.

```sh
just install
just dev        # http://localhost:4321/git-card/
```

| Recipe                        | What it does                                                     |
| ----------------------------- | ---------------------------------------------------------------- |
| `just dev`                    | Dev server                                                       |
| `just build` / `just preview` | Static build into `dist/`, then serve it                         |
| `just format`                 | Prettier, including `.astro` files                               |
| `just lint` / `just lint-fix` | ESLint                                                           |
| `just test`                   | Unit tests, including rendering every OG image                   |
| `just check`                  | Type check `.astro` and `.ts`                                    |
| `just cards <logins>`         | Render README cards locally (uses `$GITHUB_TOKEN` or `gh` login) |
| `just og-site`                | Regenerate `public/og.png`, the site's link preview              |
| `just ci`                     | Formatting, lint, types, tests and build in one go               |

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

## Deploy to GitHub Pages

1. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Push to `main`. `.github/workflows/pages.yml` tests, builds and deploys, and runs again every day to refresh the hosted cards.
3. Optional: set a repository variable `SNAPSHOT_USERS` to a comma-separated list of logins to publish hosted cards for more people.

The workflow reads the site URL and base path from `actions/configure-pages`, so the same build works at `user.github.io/git-card/`, on a user site, or on a custom domain.

`.github/workflows/ci.yml` runs the same checks on every pull request.

## How it fits together

```text
             browser                                          GitHub Actions
 REST + search + calendar sources                           GraphQL, free token
  lib/public-api.ts + lib/calendar.ts                          lib/github.ts
            │                                                        │
            └──────────────▶ normalize() ──▶ Profile ◀───────────────┘
                                               │
                            cards/*.tsx  (pure SVG React components)
                     │                     │                         │
              dashboard + card pages   iframe embeds       scripts/generate.tsx
              (src/app, React)          (?embed)          .svg files for READMEs
```

- **One model.** Both data sources end in the same `Profile`, so cards, the rank and the org breakdown do not care where the numbers came from.
- **Cards are pure SVG components.** The same component draws inline on the page, downloads as a file, and renders to a standalone `.svg` in the Action, where it carries its own theme tokens.
- **`cards/registry.ts` is the single list of cards.** Its keys are public URL slugs, so never rename one. Adding a card means writing the component and adding one entry.
- **The 3D skyline** (`scenes/skyline.ts`) is plain three.js on top of the SVG skyline. It loads only when it scrolls into view. Without WebGL the SVG stays.
- **Styling** is the Night City theme, dark only for now. Colors live in `cards/style.ts`, type, spacing and arcade effects in `styles/tokens.css`.

## Rank

Every profile gets a rank from F to SSS, an estimate of where it sits among active GitHub developers. S, SS and SSS are the super elite: the top 1%, 0.1% and 0.01%.

| Tier | F    | E   | D   | C   | B   | A   | S   | SS   | SSS   |
| ---- | ---- | --- | --- | --- | --- | --- | --- | ---- | ----- |
| Top  | 100% | 85% | 60% | 35% | 15% | 5%  | 1%  | 0.1% | 0.01% |

Seven public metrics are each scored on a log scale against a typical active developer, averaged by weight, rescaled for how much they correlate, and given a bonus for one exceptional category. The model lives in `src/lib/rank.ts`, and the `/rank` page is generated from the same constants. The medians are informed estimates, not fitted to a sampled population.

## Limits worth knowing

- **Rate limits.** Without signing in, GitHub allows each visitor 60 API requests an hour and 10 searches a minute. A profile takes about 8 requests and 5 searches, and stays cached in the browser for an hour.
- **The contribution calendar** cannot be read from GitHub in a browser, so it comes from public sources, tried in order: [github-contributions-api](https://github.com/grubersjoe/github-contributions-api), [gh-calendar](https://github.com/rschristian/gh-calendar), then GitHub's own calendar page through the [Jina reader](https://jina.ai/reader) and [cors.lol](https://cors.lol). Each source gets three attempts before the next takes over, and one that just failed is tried last for 15 minutes. The rest of the profile shows first and the calendar cards fill in when it lands. If every source fails, they say so.
- **Approximations in the browser.** Languages are each repo's main language weighted by repo size. The org breakdown counts the most recent 100 commits, pull requests, reviews and issues, and only counts commits in repos where the work plausibly happened, to skip forks and mirrors. The Action uses GraphQL and is exact.
- **Organizations** cannot be looked up as profiles yet. Only user accounts.
- Contribution data covers the last 365 days.

## License

[MIT](LICENSE). Fonts in `src/og/fonts` are under the SIL Open Font License. Brand icons are from [Simple Icons](https://simpleicons.org) (CC0).
