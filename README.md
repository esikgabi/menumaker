# menumaker
MenuMaker

## Development

1. Copy `.env.example` to `.env.local` and adjust as needed.
2. Start a local Postgres:
   ```bash
   docker run -d --name menumaker-dev-db \
     -e POSTGRES_USER=menumaker -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=menumaker \
     -p 5432:5432 postgres:16-alpine
   ```
3. Install dependencies and run migrations:
   ```bash
   npm install
   npx prisma migrate dev
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
5. Run unit tests:
   ```bash
   npm run test:unit
   ```
6. Run integration tests (spins up a throwaway Postgres via Docker):
   ```bash
   npm run test:integration
   ```

### Auth notes

- `.env.local` should have `ENABLE_MOCK_AUTH=true` and `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true` so `npm run dev` shows a "Dev login" form on `/signin` (type any name/email, no Google credentials needed).
- **`npm run build` will fail while those two flags are set** — it's the production safety guard doing its job (the app refuses to start with mock auth enabled when `NODE_ENV=production`, and `next build` sets that). Unset both flags in `.env.local` before running a local production build; leave them set for day-to-day `npm run dev` work.
- Real Google sign-in requires `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `.env.local`; without them the Google button will error, but dev-login still works.

