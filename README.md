# rdm-b2c

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, Hono, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **React Native** - Build mobile apps using React
- **Expo** - Tools for React Native development
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Hono** - Lightweight, performant server framework
- **tRPC** - End-to-end type-safe APIs
- **Node.js** - Runtime environment
- **Mongoose** - TypeScript-first ORM
- **MongoDB** - Database engine
- **Authentication** - Better-Auth
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

## Database Setup

This project uses MongoDB with Mongoose.

1. Make sure you have MongoDB set up.
2. Update your `apps/server/.env` file with your MongoDB connection URI.

The application stores authentication and activity in the `rdm-business` database, using separate collections. Keep credentials in the ignored environment files.

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
Use the Expo Go app to run the mobile application.
The API is running at [http://localhost:3000](http://localhost:3000).

## Persistent App Behavior

- New accounts start with no habits, goals, transactions, earned badges, XP, or RDM. Framework choices and game questions are catalogs, not fabricated user activity.
- Habit commitments reserve Base RDM for the selected weekdays between the inclusive start date and exclusive end date. Completed days settle to Reward; missed scheduled days settle to Remorse. Rest days are not charged.
- Personal goals save progress and notes. Completion releases the reserved goal pledge to Reward; missing the deadline releases it to Remorse. Finished goals remain in history.
- Trees grow from saved fertilizer, water, and sunlight activity. Tree-day accounting uses the timezone selected when the tree was created.
- Group membership, contributions, pooled stakes, awards, and expiry refunds are saved and protected against duplicate settlement.
- Games persist accepted actions and scores. Empty sessions earn nothing; eligible session rewards are credited once, including after retries.
- The running API scans commitments in batches every minute and catches up overdue outcomes on relevant requests. Keep the server running for background settlement; after downtime, catch-up resumes.

Base RDM funding still needs an approved allocation or purchase flow. AI suggestions, charity fulfillment, and reward redemption are unavailable; these screens do not simulate successful external actions. Existing mixed demo/user accounts require reviewed cleanup; see [legacy demo cleanup](docs/legacy-demo-cleanup.md).

## Verification

```sh
pnpm test
pnpm --filter server test:integration
pnpm check-types
pnpm build
```

Integration tests launch a disposable local MongoDB and never use the configured application database. Install `mongod` on your PATH or set `RDM_TEST_MONGOD` to its executable path. Fixture RDM exists only inside this temporary test database. Native bundling and physical-device testing remain separate from the web/server build.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@rdm-b2c/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Project Structure

```
rdm-b2c/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
│   ├── native/      # Mobile application (React Native, Expo)
│   └── server/      # Backend API (Hono, TRPC)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run dev:server`: Start only the server
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run dev:native`: Start the React Native/Expo development server
