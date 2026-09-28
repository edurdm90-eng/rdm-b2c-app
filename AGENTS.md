# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm/Turborepo TypeScript monorepo. Applications live in `apps/`: `web` is the React/TanStack Router frontend, `native` is the Expo client, and `server` is the Hono/tRPC API. Shared code belongs in `packages/`: procedures in `api`, authentication in `auth`, Mongoose models in `db`, environment schemas in `env`, React primitives in `ui`, and TypeScript settings in `config`. Keep app-specific code inside its app and expose reusable modules through package exports. Mobile assets are under `apps/native/assets`.

## Build, Test, and Development Commands

Run commands from the repository root with pnpm 10:

- `pnpm install` installs workspace dependencies.
- `pnpm dev` starts all apps; `pnpm dev:web`, `pnpm dev:server`, and `pnpm dev:native` start one.
- `pnpm build` builds every package that defines a build task.
- `pnpm test` runs the API domain tests through the server workspace and the native session-transition regression tests.
- `pnpm check-types` runs workspace TypeScript checks and the web production build.
- `pnpm --filter native ios` or `pnpm --filter native android` launches a native development build.

Web runs at `http://localhost:3001`; the API runs at `http://localhost:3000`.

## Coding Style & Naming Conventions

TypeScript is strict, including unused-symbol and unchecked-index checks. Match existing style: two-space indentation, semicolons, double quotes, and trailing commas. Use `PascalCase` for React components, `camelCase` for functions and variables, and kebab-case filenames such as `mode-toggle.tsx`. Follow Expo Router and TanStack Router route conventions. Import shared code through `@rdm-b2c/*`; use `@/` for web-local modules. No formatter or linter is configured, so follow neighboring files. Never edit generated `apps/web/src/routeTree.gen.ts`.

## Testing Guidelines

API domain tests use Node's built-in test runner through `tsx`; colocate them as `*.test.ts`, such as `packages/api/src/domain/rdm.test.ts`. Run `pnpm test`, `pnpm check-types`, and `pnpm build` before opening a pull request, then exercise affected mobile flows locally. No coverage threshold is configured; add focused tests for reward, progression, and allocation rules when those rules change.

## Commit & Pull Request Guidelines

History contains only `initial commit`, so no convention is established. Use short, imperative subjects with a scope, for example `web: add account settings route`. Keep commits focused. Pull requests should explain intent and verification, link issues, identify environment or schema changes, and include screenshots or recordings for UI changes.

## Security & Configuration

Keep secrets in app-local `.env` files, which are ignored by Git. Update the corresponding schema in `packages/env/src` when adding variables. Server configuration requires `DATABASE_URL`, Better Auth values, and `CORS_ORIGIN`; client-exposed values must retain the `VITE_` or `EXPO_PUBLIC_` prefix.
