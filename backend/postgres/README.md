# PostgreSQL / Supabase bootstrap

1. Open Supabase SQL Editor (or use `psql`).
2. Run `schema.sql`. This recreates the CyberCarnival tables with PostgreSQL-native types and constraints.
3. Run `data.sql`. This imports the data from `Dump20260903`.
4. On Render, set `DATABASE_URL` to the Supabase pooler URI and `FLASK_ENV=production`.
5. Do not commit `backend/.env`; use Render environment variables for production secrets.

The old MySQL schema/migration SQL files were removed from the project so there is one authoritative PostgreSQL schema.
