# Up and Out

Kids' routine board with rewards. Parents sign in; a kitchen tablet shows each kid's
routines for today (Morning, After school, Bedtime, …) as job tiles with a countdown
ring; every job earns a token (star, dinosaur, …) towards a goal the parent sets.
Multi-device: every device polls the API, so phone and tablet stay in step.

## Stack

Next.js (App Router) · TypeScript strict · plain CSS (`app/globals.css`) · Prisma + pg on Neon Postgres ·
NextAuth v5 (email + password, Credentials + JWT) · vitest · PWA manifest.
Client-rendered app shell under `app/` talking only to JSON routes under `app/api/`
(so a Capacitor shell or native app can reuse the API later).

## Run

- `npm install` — also runs `prisma generate`
- `npm run dev` — `next dev` on the embedded local Postgres (`prisma dev`), migrations applied first; no `.env` needed
- `npm run db:migrate` — apply migrations to the embedded local Postgres (`prisma dev`)
- `npm run verify` — typecheck + lint + unit tests; green before claiming done

## Test

- `npm test` — vitest, pure logic (`lib/rewards`) plus API guard scan; no DB needed
- `npm run test:db` — repo tests against the embedded local Prisma Postgres

## Deploy

Release: trunk
Production: https://up-and-out-eosin.vercel.app
Git push only: branch push = preview, `main` = production. `vercel.json` runs
`prisma migrate deploy` then `next build`. No CLI deploys.

## Rules

- Rewards are a **ledger** (`LedgerEntry`); balance, streak and goal progress are
  derived, never stored. Undo deletes the entry.
- Every `app/api/**` handler calls `requireFamily()` first; settings, claim and adjust
  routes also call `requirePin()`.
- Jobs belong to a `Routine` (time window, weekdays, on-time bonus); one routine per kid
  has `streak = true` and is the only one the day-streak counts. A job's own `days` or
  `date` narrow when it appears (`lib/schedule.ts`; parents type `(Tue)` / `(14 Oct)`).
- Kids, routines and jobs are archived or deactivated, never deleted: ledger rows cascade.
- Embedded `prisma dev` serves database `template1`, so `prisma migrate dev` cannot make a
  shadow DB. Write migrations by hand: diff with `prisma migrate diff
  --from-config-datasource --to-schema prisma/schema.prisma --script` (DATABASE_URL from
  `scripts/embedded-db.mjs`), add data moves, rehearse with `prisma migrate deploy`.
  Reset the instance with `npx prisma dev rm up-and-out --force`.
- Dates are the family's **local date** (`YYYY-MM-DD` in `Family.timezone`), computed
  server-side in `lib/dates.ts`. Never `new Date().toISOString().slice(0,10)`.
- No new dependencies without asking.
