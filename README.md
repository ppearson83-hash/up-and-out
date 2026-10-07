# Up and Out

Kids' morning routine board with rewards. A parent signs in on each device; the kitchen
tablet shows each kid's jobs as big tap tiles with a countdown ring to leaving time.
Every job earns a token towards a goal; the parent sets goals, claims them, and adjusts
balances behind a PIN.

## Setup

```sh
npm install
cp .env.example .env   # fill in DATABASE_URL and AUTH_SECRET
npm run db:migrate
npm run dev
```

## Scripts

- `npm run dev` — local dev server
- `npm run verify` — typecheck, lint, unit tests
- `npm test` — unit tests only
- `npm run test:db` — repository tests on an embedded local Postgres

## Deploy

Vercel, from git pushes only. Branch pushes build previews; `main` is production.
