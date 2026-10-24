# CMS Platform — Architecture

## Overview

A headless CMS + dynamic website platform built as an npm-workspaces monorepo:

```
cms/
├── shared/     @cms/shared  — types, interfaces, constants, utils (framework-agnostic)
├── api/        @cms/api     — Express + Prisma + PostgreSQL REST API
├── admin/      @cms/admin   — Vue 3 + Element Plus admin panel
└── website/    @cms/website — Vue 3 + Tailwind public website (fully dynamic)
```

## Principles

- **Clean Architecture** — dependencies point inward: `route → controller → service → repository → prisma`.
  Controllers know HTTP; services know business rules; repositories know persistence. Nothing above
  a layer imports below it except through interfaces.
- **SOLID** — every module exposes an interface-first service; storage/OCR are swappable via
  provider interfaces (Strategy pattern); generic base classes are open for extension, closed for
  modification.
- **Repository Pattern** — `BaseRepository<T>` implements generic CRUD + soft delete + pagination;
  module repositories extend it with domain queries only.
- **Feature Module Architecture** — every feature (pages, menus, donations, …) is a self-contained
  folder: `*.types.ts`, `*.repository.ts`, `*.service.ts`, `*.controller.ts`, `*.routes.ts`,
  `*.validation.ts`, `index.ts`. Modules self-register through a `ModuleRegistry`; adding a module
  never touches core code.

## Backend layering

```
HTTP ─▶ routes ─▶ middleware (auth / rbac / validate / rateLimit)
              ─▶ controller  (parse request, call service, shape ApiResponse)
              ─▶ service     (business rules, transactions, events)
              ─▶ repository  (Prisma queries, soft delete, pagination)
              ─▶ PostgreSQL
```

Cross-cutting infrastructure lives in `api/src/core/`:
- `config/` — typed env config
- `database/` — Prisma client singleton
- `errors/` — `AppError` hierarchy + global error handler
- `middleware/` — authenticate, authorize(permission), validate(schema), rateLimit, audit
- `base/` — BaseRepository, BaseService, BaseController, crudRouter factory
- `storage/` — `StorageProvider` interface + Local/S3 drivers
- `ocr/` — `OcrProvider` interface + Tesseract/GoogleVision/Textract drivers
- `modules.ts` — module registry: each feature module exports a `FeatureModule` descriptor
  (`name`, `basePath`, `router`); the registry mounts them all.

## Frontend architecture (admin & website)

- **Composition API + `<script setup>` + TypeScript** everywhere.
- **Pinia** stores per domain; **Vue Router** with lazy-loaded route chunks.
- Admin features are modules under `src/modules/<feature>/` exporting routes + menu entries;
  a module registry aggregates them (adding a module = adding a folder + one registry line).
- Generic building blocks: `useCrud()` composable, `<CrudTable>`, `<CrudForm>`,
  `<AppDataTable>` (server pagination/sort/filter), upload components.
- Website renders every page through `ComponentRenderer.vue`: route → fetch page JSON →
  map `block.type` to a component in `components/blocks/` via a self-registering block registry
  (`import.meta.glob`) → render. New block = new file, zero core changes.
- Theme system: settings API → CSS custom properties injected at runtime.

## Auth & RBAC

- Short-lived JWT access token (15 min) + rotating refresh token (httpOnly cookie, hashed in DB).
- `roles` ⟷ `permissions` many-to-many; middleware `authorize('pages.update')` guards routes;
  admin UI hides actions the user lacks (`v-permission` directive).

### The second login: JOOX voters

The website's `/joox-vote` has its own sign-in, deliberately sharing nothing with the above.
A `joox_voters` row is a fan an admin handed a username and a generated password to; it has
no role, no permission and no way into the admin, and an admin `User` cannot sign in with it
either. Admins hand the accounts out under `joox-voters.view` / `.manage`.

Sessions there are opaque random tokens in `joox_voter_sessions`, stored hashed and checked
against the database on every request — not JWTs. A JWT's selling point is being verifiable
without a lookup, which is the wrong trade for accounts an admin disables, renames or resets
by hand: here, doing so signs the phone out on its very next tap. Tokens last 30 days and
live in the browser's `localStorage`, because the page is opened daily by people who were
told the password once. See `api/src/modules/joox-voters/jooxVoterAuth.ts`.

The same login opens `/joox-accounts`: a voter's own JOOX logins (name, email or phone, note)
and which checklist accounts each has voted for today, six at most, cleared at the same 23:00
reset. Unlike the checklist these rows belong to the voter who added them and nobody else
sees them. See `api/src/modules/public-joox-accounts/publicJooxAccounts.module.ts`.

### The third: sunflower gardeners

`/garden/*` has no login either. The first seed a browser sows comes back with a random key,
kept in `localStorage` and sent as `x-garden-key`; the database stores only its SHA-256. The
same key in a recovery link (`/garden/mine/:slug#key=…`, in the fragment so no server logs it)
opens that garden on another device, and an admin can rotate it for someone who lost theirs.

What each flower looks like is decided when it is sown — the mix is matched against the
admin's recipes — and stored on the plant, but no public response carries a design, a face or
their pictures until `revealAt`. Every public read goes through `serializePlant` in
`api/src/core/garden/gardenService.ts`, which is where that line is held. Secret fertiliser
spends tokens through the same `spendTokens` as the board game, one purchase per plant
enforced by a unique index.

## Donation flow

```
select project → info + progress + bank accounts → form + slip upload
   → POST /donations (multipart) → OCR pipeline (async) → auto-verify | manual review
   → admin approve/reject → project current_amount recomputed from VERIFIED donations
```

## Data flow guarantees

- All tables: `id`, `created_at`, `updated_at`, `deleted_at` (soft delete).
- Page tree: materialized `path` column, recomputed for the whole subtree on parent/slug change.
- `donation_projects.current_amount` is denormalized but recomputed transactionally on every
  verification state change — verified donations are the single source of truth.
