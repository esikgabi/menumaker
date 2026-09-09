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

