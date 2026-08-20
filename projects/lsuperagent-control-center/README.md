# LSUPERAGENT Control Center

R1_SOURCE establishes the installable Next.js source foundation only. It does not connect to the canonical LSUPERAGENT/Supabase backend and does not claim backend availability.

## Stack
- Next.js App Router
- TypeScript
- Tailwind CSS
- ESLint
- pnpm
- Vitest + Testing Library + jsdom

## Public environment contract
R1 permits only these browser-safe public variable names in `.env.example`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Do not commit real values or privileged credentials.

## Commands
```bash
pnpm install --frozen-lockfile
pnpm vitest run
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

## R1 status semantics
The shell intentionally renders `NOT_CONNECTED`. Navigation, `/api/health`, authentication, the Trusted Agent Gateway, canonical Memory/Audit access, Vercel deployment, and domain/DNS work belong to later release gates and are not implemented in R1.
