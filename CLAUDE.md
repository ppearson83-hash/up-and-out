# Up and Out

Kids' morning routine board with rewards. Parents sign in; a kitchen tablet shows the
kids' job tiles and a countdown to leaving for school; every job earns a token
(star, dinosaur, …) towards a goal the parent sets. Multi-device: every device polls
the API, so phone and tablet stay in step.

## Stack

Next.js (App Router) · TypeScript strict · Tailwind 4 · Prisma + pg on Neon Postgres ·
NextAuth v5 (email + password, Credentials + JWT) · vitest · PWA manifest.
Client-rendered app shell under `app/` talking only to JSON routes under `app/api/`
(so a Capacitor shell or native app can reuse the API later).

## Run

- `npm install` — also runs `prisma generate`
- `npm run dev` — needs `DATABASE_URL` and `AUTH_SECRET` in `.env` (see `.env.example`)
- `npm run db:migrate` — apply migrations to the embedded local Postgres (`prisma dev`)
- `npm run verify` — typecheck + lint + unit tests; green before claiming done

## Test

- `npm test` — vitest, pure logic (`lib/rewards`) plus API guard scan; no DB needed
- `npm run test:db` — repo tests against the embedded local Prisma Postgres

## Deploy

Release: trunk
Git push only: branch push = preview, `main` = production. `vercel.json` runs
`prisma migrate deploy` then `next build`. No CLI deploys.

## Rules

- Rewards are a **ledger** (`LedgerEntry`); balance, streak and goal progress are
  derived, never stored. Undo deletes the entry.
- Every `app/api/**` handler calls `requireFamily()` first; settings, claim and adjust
  routes also call `requirePin()`.
- Dates are the family's **local date** (`YYYY-MM-DD` in `Family.timezone`), computed
  server-side in `lib/dates.ts`. Never `new Date().toISOString().slice(0,10)`.
- No new dependencies without asking.
