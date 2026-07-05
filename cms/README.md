# CMS Platform

Production-ready **Headless CMS + Dynamic Website Platform**.

- **api/** — Express 4 + Prisma + MySQL REST API (TypeScript, Clean Architecture)
- **admin/** — Vue 3 + Element Plus admin panel (page builder, form builder, donations, media, RBAC)
- **website/** — Vue 3 + Tailwind public site (100% dynamic routing + component renderer)
- **shared/** — types, constants, utils shared by all apps

See [ARCHITECTURE.md](./ARCHITECTURE.md) for design details.

---

## Quick start (development)

Requirements: Node 20+, MySQL 8 (or use Docker for MySQL only).

```bash
cd cms
npm install

# 1) Configure the API
cp api/.env.example api/.env          # set DATABASE_URL + JWT secrets
cp admin/.env.example admin/.env
cp website/.env.example website/.env

# 2) Create schema + demo data
npm run prisma:migrate                # creates tables (prisma migrate dev)
npm run prisma:seed                   # roles, admin user, pages, menus, projects…

# 3) Run everything
npm run dev                           # api :4000, website :5173, admin :5174
```

**Default login (admin panel, http://localhost:5174):**

```
admin@example.com / ChangeMe123!
```

> Change this password immediately; the seed exists for demos only.

## Production (Docker)

```bash
cd cms
cat > .env <<'EOF'
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
DB_PASSWORD=<strong password>
DB_ROOT_PASSWORD=<strong password>
PUBLIC_API_URL=https://api.example.com/api/v1
APP_URL=https://api.example.com
WEBSITE_URL=https://www.example.com
ADMIN_URL=https://admin.example.com
EOF

docker compose up -d --build
docker compose exec api npx prisma db seed   # optional demo data
```

Services: API :4000 · website :8080 · admin :8081. Put a TLS-terminating
reverse proxy (nginx/Caddy/Cloudflare) in front and point each domain at the
matching container.

## Configuration highlights

| Env | Values | Notes |
|---|---|---|
| `STORAGE_DRIVER` | `local` \| `s3` | S3-compatible: AWS, MinIO, R2, Spaces — set `S3_*` vars |
| `OCR_PROVIDER` | `tesseract` \| `google-vision` \| `aws-textract` \| `azure-vision` \| `none` | Tesseract needs no API key |
| `OCR_AUTO_VERIFY_CONFIDENCE` | 0–1 | Threshold for auto-verifying donation slips |
| `SMTP_*` | — | Unset in dev → mails are logged, not sent |

## Extending the system (no core changes)

**New API feature** — create `api/src/modules/<name>/` exporting a
`FeatureModule`, add one line to `api/src/modules/index.ts`.

**New page-builder block** —
1. `website/src/components/blocks/MyThingBlock.vue` (auto-registered as type `my-thing`)
2. one entry in `admin/src/blocks/definitions.ts` (label + editable fields)

**New admin section** — folder under `admin/src/views/` + one entry in
`admin/src/modules/registry.ts` (routes + sidebar item + permission).

## Production best practices checklist

**Security**
- [x] JWT (15 min) + rotating refresh tokens (httpOnly cookie, hashed at rest, reuse detection)
- [x] bcrypt cost 12 · zod validation on every write · Prisma (parameterized SQL)
- [x] Rate limits: global, auth (10/15 min), public submissions (6/min)
- [x] helmet, CORS allow-list, sameSite=strict cookie in prod (CSRF), upload MIME+extension allow-lists, unguessable filenames, path-traversal guard
- [ ] Terminate TLS at the proxy; enable HSTS
- [ ] Rotate JWT secrets on a schedule; store secrets in a vault, not in files

**Data**
- [x] Soft delete everywhere (`deleted_at`), audit log on every admin mutation
- [x] `current_amount` recomputed transactionally from VERIFIED donations
- [ ] `mysqldump` nightly + uploads volume backup; test restores

**Performance**
- [x] Route-level code splitting, async block components, vendor chunking
- [x] Thumbnails (sharp → webp), lazy images, Cache-Control on public GETs + static assets
- [ ] Put a CDN in front of `/uploads` and both SPAs
- [ ] Scale API horizontally (stateless; sessions live in MySQL)

**Operations**
- [x] `/health` endpoint, pino structured logs, graceful shutdown
- [ ] Wire logs to your aggregator; alert on 5xx rate and OCR failure rate
- [ ] Run `prisma migrate deploy` in CI before rolling new API images
