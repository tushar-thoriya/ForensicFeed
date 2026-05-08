# AI Pulse

> Personal AI news aggregator — mobile-first feed across 14 buckets.
> See `../CLAUDE.md` for the engineering playbook and `../Plan.md` for the task plan.

## Quick start

```bash
# From the repo root, activate the isolated tooling env
source ../virtual_env/activate

cd app

# Install dependencies (uses pnpm-store inside ../virtual_env/)
pnpm install

# Copy env template and fill in real values
cp .env.example .env.local

# Generate the first DB migration (run once after schema changes)
pnpm db:generate

# Apply migrations to your Supabase Postgres
pnpm db:migrate

# Run dev server
pnpm dev

# Run all checks
pnpm verify
```

## Tooling

| Command            | Purpose                                     |
| ------------------ | ------------------------------------------- |
| `pnpm dev`         | Next.js dev server                          |
| `pnpm build`       | Production build                            |
| `pnpm test`        | Vitest watch mode                           |
| `pnpm test:ci`     | Vitest with coverage (≥80% gate)            |
| `pnpm e2e`         | Playwright E2E suite                        |
| `pnpm lint`        | ESLint                                      |
| `pnpm format`      | Prettier write                              |
| `pnpm stylelint`   | CSS lint                                    |
| `pnpm typecheck`   | TypeScript noEmit                           |
| `pnpm verify`      | Full pre-push gate                          |
| `pnpm db:generate` | Generate Drizzle migration from schema diff |
| `pnpm db:migrate`  | Apply pending migrations                    |
| `pnpm db:studio`   | Open Drizzle Studio                         |
