# Contributing to SkyDeck

SkyDeck is a non-commercial hobby project. These notes are for anyone (including coding agents) changing the code. Read `AGENTS.md` for the architecture rules and `ARCHITECTURE.md` for how the pieces fit.

## Set up

Requirements: Node.js 22 and [Bun](https://bun.sh).

```sh
bun install
bun run dev
```

No API keys are needed to run the app. Never commit secrets, `.env` files or real captured data (messages, positions of private aircraft, personal details).

## The four checks

Run these before opening a pull request. CI runs the same four on every pull request.

```sh
bun run test
bun x tsc --noEmit
bun run lint
bun run build
```

Lint has no errors and a few known warnings; do not add new ones. Format only the files you changed (`bun x prettier --write <files>`), and do not run Prettier on `README.md`.

## Branches and pull requests

- Work is planned in `dev-plan.md`. Each phase is built in two halves; each half is one branch named `ide/phase-<number>-half-<1 or 2>` (for example `ide/phase-4-half-1`), cut from `origin/dev`.
- Pull requests target `dev`, not `main`. The owner merges.
- Small commits, one concern each. Stage files by name. Never rewrite pushed history (no force-push, rebase or amend of pushed commits).
- Push once when the half is finished and tested.

### Half-phase test pass (before the pull request)

1. The four checks pass.
2. Every item of the half is tried in a visible browser at 1280, about 746 and 375 px wide, including the empty and failure states (provider down, quota used up, nothing found). Keep a screenshot of each changed screen at the three widths with the report.
3. A new or changed data source: make one real request to see its format, read its terms, and add the credit to the Credits dialog (`src/lib/credits.ts`) and the README.
4. Update `dev-plan.md`, `roadmap.md` and the README for what changed.
5. Write a short report in the pull request: commits, commands with pass counts, what tests prove, what is NOT verified, risks.

Unfinished features ship behind a feature flag (`src/lib/flags.ts`, `useFlag` in `src/hooks/use-flag.ts`), so `dev` always works.

## Adding a data source safely

- Free and, where possible, keyless. Never put a key in the repository or the browser bundle: keys live in server-side environment variables only.
- Read the terms before building. If they restrict automated, commercial or operational use, or require a licence, stop and ask.
- Call providers from a server function (`createServerFn`), never directly from the browser, unless the rule file says otherwise for that source (Airframes ACARS is the documented exception).
- Pace requests, share identical in-flight requests, cache briefly, back off on 429 and failures, and show a clear message when the source is unavailable.
- Tests use fake fetch, clock and sleep. Tests never make real provider requests.
- Add attribution to the Credits dialog.

## Releases

- Versioning: `0.x` until the first public release, then Semantic Versioning. The first release is tagged `v0.1.0` at the soft launch (plan item 17f).
- `CHANGELOG.md`: add a line under "Unreleased" in the pull request that makes the change (Added, Changed, Removed, Fixed). On release, rename "Unreleased" to the version and date and start a new "Unreleased".
- To release: all four checks green on `dev`, the release checklist in `dev-plan.md` (17e) done, merge `dev` into `main` by pull request, tag the merge commit, and create a GitHub release whose notes are the changelog section.

## Dependencies

Dependabot opens weekly grouped pull requests against `dev`. Adding a dependency needs the owner's approval. CI prints a vulnerability report (`bun audit`); it is informational until known issues in development tools are cleared.
