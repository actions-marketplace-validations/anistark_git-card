# git-card tasks. Run `just` to list them.

# List recipes
default:
    @just --list --unsorted

# Install dependencies
install:
    pnpm install

# Start the dev server at http://localhost:4321/git-card/
dev:
    pnpm astro dev

# Static build into dist/, ready for GitHub Pages
build:
    pnpm build

# Build, then serve dist/ locally
preview: build
    pnpm astro preview

# Format everything with Prettier
format:
    pnpm prettier --write .

# Lint with ESLint
lint:
    pnpm eslint .

# Lint and apply safe fixes
lint-fix:
    pnpm eslint . --fix

# Run the tests
test:
    pnpm vitest run

# Run the tests in watch mode
test-watch:
    pnpm vitest

# Type check .astro and .ts files
check:
    pnpm astro check

# Render README cards for users into a folder (uses $GITHUB_TOKEN, or your gh login)
cards users out="og-out/cards":
    GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token)}" pnpm exec tsx scripts/generate.tsx --users {{ quote(users) }} --out {{ quote(out) }}

# Collect project stats into public/stats.local.json, which /stats reads in dev (uses $GITHUB_TOKEN, or your gh login)
stats:
    GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token)}" pnpm exec tsx scripts/stats.ts --history public/stats.local.json

# Take the city census into public/city.local.json, which city/ reads in dev (uses $GITHUB_TOKEN, or your gh login)
city:
    GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token)}" pnpm exec tsx scripts/city.ts --out public/city.local.json

# Write a made-up city of n residents to public/city.local.json, to check the page at scale
city-fake n="1000":
    pnpm exec tsx scripts/city.ts --out public/city.local.json --fake {{ n }}

# Rebuild every logo asset (site, favicons, embedded card logo) from assets/brand/git-card-logo.png
brand:
    node scripts/brand.mjs
    pnpm exec tsx scripts/generate.tsx --site-og public/og.png

# Regenerate the site's own link preview image, public/og.png
og-site:
    pnpm exec tsx scripts/generate.tsx --site-og public/og.png

# Render every OG preview image to a folder to look at
og dir="og-out":
    OG_OUT={{ quote(dir) }} pnpm vitest run src/og

# Everything CI runs: formatting, lint, types, tests, build
ci:
    pnpm prettier --check .
    pnpm eslint .
    pnpm astro check
    pnpm vitest run
    pnpm build

# Tag a release, move the major tag (v0) to it and push both. Then publish it on GitHub.
release version:
    #!/usr/bin/env bash
    set -euo pipefail
    version='{{ version }}'
    version="${version#v}"
    [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Usage: just release 0.2.0"; exit 1; }
    tag="v$version"
    major="v${version%%.*}"
    [[ "$(git rev-parse --abbrev-ref HEAD)" == main ]] || { echo "Release from main."; exit 1; }
    [[ -z "$(git status --porcelain)" ]] || { echo "Commit or stash your changes first."; exit 1; }
    git fetch -q origin main --tags
    git merge-base --is-ancestor origin/main HEAD || { echo "main is behind origin. Pull first."; exit 1; }
    if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then echo "$tag already exists."; exit 1; fi
    grep -q "@$major'" src/site.ts || { echo "SITE.action in src/site.ts does not use @$major. Update it and the README first."; exit 1; }
    just ci
    if [[ "$(node -p 'require("./package.json").version')" != "$version" ]]; then
      npm pkg set version="$version"
      git commit -qam "chore: release $tag"
    fi
    git tag -a "$tag" -m "$tag"
    git tag -f "$major"
    git push origin main "$tag"
    git push -f origin "$major"
    echo "Pushed $tag and moved $major. Publish it: https://github.com/anistark/git-card/releases/new?tag=$tag"

# Remove build output and caches
clean:
    rm -rf dist .astro node_modules/.vite og-out
