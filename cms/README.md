# CMS Platform

Production-ready **Headless CMS + Dynamic Website Platform**.

- **api/** — Express 4 + Prisma + PostgreSQL REST API (TypeScript, Clean Architecture)
- **admin/** — Vue 3 + Element Plus admin panel (page builder, form builder, donations, media, RBAC)
- **website/** — Vue 3 + Tailwind public site (100% dynamic routing + component renderer)
- **shared/** — types, constants, utils shared by all apps

See [ARCHITECTURE.md](./ARCHITECTURE.md) for design details.

---

## Quick start (development)

Requirements: Node 20+, PostgreSQL 16 (or use Docker for PostgreSQL only).

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
npm run dev                           # api :4009, website :5173, admin :5174
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
PUBLIC_API_URL=https://api.example.com/api/v1
APP_URL=https://api.example.com
WEBSITE_URL=https://www.example.com
ADMIN_URL=https://admin.example.com
EOF

docker compose up -d --build
docker compose exec api npx prisma db seed   # optional demo data
```

Services: API :4009 · website :8080 · admin :8081. Put a TLS-terminating
reverse proxy (nginx/Caddy/Cloudflare) in front and point each domain at the
matching container.

---

# คู่มือติดตั้งบน Ubuntu 24.04 + nginx (ไม่ใช้ Docker)

คู่มือนี้ครอบคลุมตั้งแต่เตรียมเครื่อง ย้ายฐานข้อมูลจากเครื่อง local ขึ้น server
จนถึงเปิดใช้งานจริงพร้อม HTTPS

## ภาพรวมสถาปัตยกรรมที่จะติดตั้ง

ระบบมี 3 ส่วนที่ผู้ใช้เข้าถึง จึงใช้ **3 subdomain** ภายใต้โดเมนเดียวกัน

| URL | คืออะไร | nginx ทำอะไร |
|---|---|---|
| `https://www.example.com` | เว็บไซต์สาธารณะ | เสิร์ฟไฟล์ static จาก `website/dist` |
| `https://admin.example.com` | หน้าจัดการ | เสิร์ฟไฟล์ static จาก `admin/dist` |
| `https://api.example.com` | REST API | reverse proxy ไปที่ Node บนพอร์ต 4009 |

> **ทำไมต้องเป็น subdomain ไม่ใช่ path เช่น `/admin`**
> ทั้งสอง SPA ใช้ `createWebHistory()` แบบ root ถ้าจะย้ายไปอยู่ใต้ path ต้องแก้
> `base` ของ Vite และ router ด้วย การใช้ subdomain จึงไม่ต้องแก้โค้ดเลย
> และเพราะเป็นโดเมนหลักเดียวกัน cookie `sameSite=strict` จึงยังทำงานได้ปกติ

> **HTTPS เป็นข้อบังคับ ไม่ใช่ทางเลือก**
> ตอน `NODE_ENV=production` cookie ของ refresh token ตั้ง `secure: true`
> ถ้ารันบน HTTP ล้วน เบราว์เซอร์จะไม่ส่ง cookie กลับมา ผู้ใช้จะถูกเด้งออกจากระบบ
> ทุกครั้งที่ access token หมดอายุ (15 นาที)

---

## ขั้นที่ 1 — เตรียมเครื่อง Ubuntu 24.04

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx ufw

# Node.js 20 (โปรเจกต์บังคับ >= 20 — sharp จะโหลดไม่ขึ้นบน Node 18)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v        # ต้องขึ้น v20.x

# ไลบรารีที่ sharp (ย่อรูป) ต้องใช้
sudo apt install -y build-essential libvips-dev

sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

### ติดตั้ง PostgreSQL — ต้องเป็นเวอร์ชันเดียวกับเครื่อง local

**ตรวจเวอร์ชันบนเครื่อง local ก่อน**

```bash
psql --version        # หรือถ้าใช้ Docker: docker exec <container> psql --version
```

> **ข้อควรระวังที่ทำให้ restore ล้มบ่อยที่สุด**
> `pg_restore` เวอร์ชันเก่า **อ่านไฟล์ dump ที่สร้างจากเวอร์ชันใหม่กว่าไม่ได้**
> Ubuntu 24.04 ติดตั้ง PostgreSQL **16** มาให้ ถ้าเครื่อง local เป็น **17**
> (เช่นใช้ Supabase CLI ซึ่งใช้ PG 17) การ restore จะล้มทันที
> ให้ติดตั้งเวอร์ชันเดียวกับ local เสมอ

**ถ้า local เป็น PostgreSQL 16** — ใช้ของที่มากับ Ubuntu ได้เลย

```bash
sudo apt install -y postgresql postgresql-contrib
```

**ถ้า local เป็น PostgreSQL 17** — ติดตั้งจาก repository ทางการของ PostgreSQL

```bash
sudo apt install -y curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt noble-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list

sudo apt update
sudo apt install -y postgresql-17 postgresql-contrib-17
```

ตรวจว่าได้เวอร์ชันที่ต้องการ

```bash
psql --version
sudo systemctl status postgresql --no-pager
```

สร้าง user สำหรับรันแอป (อย่ารันด้วย root)

```bash
sudo adduser --system --group --home /opt/cms cms
```

---

## ขั้นที่ 2 — Export ฐานข้อมูลจากเครื่อง local

รันบน **เครื่อง local** ของคุณ

```bash
# ตรวจก่อนว่า server ปลายทางเป็นเวอร์ชันเดียวกัน (ดูขั้นที่ 1)
pg_dump --version

# ถ้าใช้ PostgreSQL ใน Docker/Supabase ให้ปรับ host/port ให้ตรง
pg_dump \
  --host=localhost --port=54322 --username=postgres \
  --format=custom --no-owner --no-privileges \
  --file=cms-backup.dump \
  cms
```

| ตัวเลือก | เหตุผล |
|---|---|
| `--format=custom` | ไฟล์เล็กกว่า และ `pg_restore` เลือก restore บางส่วนได้ |
| `--no-owner` | ไม่ผูกกับชื่อ user บนเครื่อง local ซึ่งไม่มีบน server |
| `--no-privileges` | ข้าม GRANT ที่อ้างถึง role ที่ไม่มีบน server |

ตรวจว่าไฟล์ใช้ได้ก่อนส่ง

```bash
pg_restore --list cms-backup.dump | head       # ต้องอ่าน table ออกมาได้
ls -lh cms-backup.dump
```

ส่งขึ้น server

```bash
scp cms-backup.dump user@your-server-ip:/tmp/
```

> **ไฟล์อัปโหลด (`api/uploads/`) ไม่ได้อยู่ในฐานข้อมูล** ตารางเก็บแค่ URL
> ต้องคัดลอกแยกต่างหาก ไม่งั้นรูปสลิป รูปปกป้าย และรูปในสื่อจะหายหมด
>
> ```bash
> rsync -avz cms/api/uploads/ user@your-server-ip:/tmp/uploads/
> ```

---

## ขั้นที่ 3 — สร้างฐานข้อมูลบน server แล้ว restore

```bash
# สร้าง user + database
sudo -u postgres psql <<'SQL'
CREATE USER cms WITH PASSWORD 'เปลี่ยนเป็นรหัสผ่านที่คาดเดายาก';
CREATE DATABASE cms OWNER cms;
SQL
```

**กรณี ก — ย้ายข้อมูลเดิมมาจาก local**

```bash
sudo -u postgres pg_restore \
  --dbname=cms --no-owner --role=cms \
  /tmp/cms-backup.dump

# ให้สิทธิ์ user cms เป็นเจ้าของทุกตาราง
sudo -u postgres psql -d cms -c "
  GRANT ALL ON ALL TABLES IN SCHEMA public TO cms;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO cms;"
```

ตรวจว่าข้อมูลมาครบ

```bash
sudo -u postgres psql -d cms -c "\dt"
sudo -u postgres psql -d cms -c "SELECT count(*) FROM users;"
sudo -u postgres psql -d cms -c "SELECT count(*) FROM donations;"
```

**กรณี ข — เริ่มต้นใหม่ ไม่ย้ายข้อมูล**

ข้ามการ restore ไปเลย แล้วค่อยรัน `prisma migrate deploy` ในขั้นที่ 5
ซึ่งจะสร้างตารางทั้งหมดจาก migration ให้เอง

> **อย่ารัน `prisma migrate dev` บน server** คำสั่งนั้นสำหรับตอนพัฒนาเท่านั้น
> และอาจ **ลบข้อมูลทิ้ง** เมื่อพบว่า schema ไม่ตรงกับ migration
> บน production ใช้ `prisma migrate deploy` เท่านั้น

---

## ขั้นที่ 4 — วางโค้ดบน server

```bash
sudo mkdir -p /opt/cms && sudo chown cms:cms /opt/cms
sudo -u cms git clone <your-repo-url> /opt/cms/app
cd /opt/cms/app/cms

sudo -u cms npm ci
```

ย้ายไฟล์อัปโหลดที่ copy มาในขั้นที่ 2 เข้าที่

```bash
sudo mkdir -p /opt/cms/app/cms/api/uploads
sudo cp -r /tmp/uploads/* /opt/cms/app/cms/api/uploads/
sudo chown -R cms:cms /opt/cms/app/cms/api/uploads
```

---

## ขั้นที่ 5 — ตั้งค่า environment แล้ว build

**`api/.env`** — ค่าที่ผิดตรงนี้คือสาเหตุปัญหาที่พบบ่อยที่สุด

```bash
sudo -u cms tee /opt/cms/app/cms/api/.env > /dev/null <<'EOF'
NODE_ENV=production
PORT=4009

# ต้องตรงกับโดเมนจริงเป๊ะ ๆ (มี https:// ไม่มี / ปิดท้าย)
# ค่าสองตัวล่างคือ CORS allow-list ถ้าผิดเบราว์เซอร์จะบล็อกทุก request
APP_URL=https://tt-api.dna.co.th
WEBSITE_URL=https://tt.dna.co.th
ADMIN_URL=https://tt-admin.dna.co.th

DATABASE_URL="postgresql://cms:postgres@localhost:5432/cms?schema=public"

# สร้างด้วย: openssl rand -hex 32  (ต้องยาวอย่างน้อย 32 ตัวอักษร)
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

STORAGE_DRIVER=local
UPLOAD_DIR=uploads
MAX_UPLOAD_MB=10

OCR_PROVIDER=tesseract
OCR_AUTO_VERIFY_CONFIDENCE=0.8

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_MAX=10
EOF
sudo chmod 600 /opt/cms/app/cms/api/.env
```

**`admin/.env` และ `website/.env`**

```bash
echo 'VITE_API_URL=https://tt-api.dna.co.th/api/v1' | sudo -u cms tee /opt/cms/app/cms/admin/.env
echo 'VITE_API_URL=https://api.example.com/api/v1' | sudo -u cms tee /opt/cms/app/cms/website/.env
```

> **`VITE_API_URL` ถูกฝังตอน build ไม่ใช่ตอนรัน** ถ้าแก้ค่านี้ทีหลัง
> ต้อง `npm run build` ใหม่เสมอ แก้ไฟล์ `.env` เฉย ๆ ไม่มีผล

**สร้างตาราง แล้ว build**

```bash
cd /opt/cms/app/cms
sudo -u cms npm run prisma:generate
sudo -u cms npm run prisma:deploy   # = prisma migrate deploy (รันในโฟลเดอร์ api)
sudo -u cms npm run build          # build ทั้ง shared, api, admin, website
```

> **อย่าเรียก `npx prisma ...` จาก `cms/` ตรง ๆ** จะได้ `P1012: Environment
> variable not found: DATABASE_URL` เพราะ Prisma อ่าน `.env` จากโฟลเดอร์ที่รัน
> คำสั่งกับโฟลเดอร์ของ schema เท่านั้น ไม่เห็น `api/.env` — ให้ใช้ script ข้างบน
> (วิ่งผ่าน workspace `-w api`) หรือ `cd api` ก่อนเสมอ

ถ้าเป็นการติดตั้งใหม่ (กรณี ข) ให้ใส่ข้อมูลตั้งต้น

```bash
sudo -u cms npm run prisma:seed    # สร้าง role, permission และ admin คนแรก
```

> เข้าระบบครั้งแรกด้วย `admin@example.com / ChangeMe123!`
> **แล้วเปลี่ยนรหัสผ่านทันที**

---

## ขั้นที่ 6 — รัน API ด้วย pm2

ค่าคอนฟิกทั้งหมดอยู่ในไฟล์ `ecosystem.config.cjs` ที่ root ของโปรเจกต์แล้ว
(อยู่ใน git จึงได้มาพร้อม `git pull` ไม่ต้องพิมพ์คำสั่งยาว ๆ บน server)

```bash
sudo npm install -g pm2

cd /opt/cms/app/cms
sudo -H -u cms pm2 start ecosystem.config.cjs
sudo -H -u cms pm2 status
curl -s http://localhost:4009/health     # ต้องได้ {"status":"ok",...}
```

> **รันด้วย user `cms` ไม่ใช่ root** pm2 แยก daemon ตาม user ที่รัน ถ้าเผลอ
> `sudo pm2 start` ครั้งหนึ่ง แล้ว `sudo -u cms pm2 restart` อีกครั้ง จะกลายเป็น
> คนละ daemon กัน — เห็น process ไม่ตรงกันและอาจรัน API ซ้อนกันสองตัวแย่งพอร์ต 4009
> ใช้ `sudo -H -u cms pm2 ...` ให้เหมือนกันทุกคำสั่ง (`-H` เพื่อให้ `HOME=/opt/cms`
> ไม่งั้น pm2 จะไปสร้าง `~/.pm2` ของ root)

**ให้ start เองหลัง server reboot**

```bash
sudo -H -u cms pm2 save                        # จำ process list ปัจจุบัน
sudo pm2 startup systemd -u cms --hp /opt/cms  # สร้าง systemd unit ที่ resurrect ให้
```

> `pm2 save` ต้องรันใหม่ทุกครั้งที่ **เพิ่ม/ลบ** process ถ้าแค่ restart ไม่ต้องรัน

**ดู log**

```bash
sudo -H -u cms pm2 logs cms-api          # ตามสด
sudo -H -u cms pm2 logs cms-api --lines 200
sudo -H -u cms pm2 monit                 # CPU / RAM แบบ realtime
```

log สะสมไปเรื่อย ๆ จนดิสก์เต็มได้ ติดตั้งตัวหมุน log ไว้ด้วย

```bash
sudo -H -u cms pm2 install pm2-logrotate
sudo -H -u cms pm2 set pm2-logrotate:max_size 20M
sudo -H -u cms pm2 set pm2-logrotate:retain 14
```

**คำสั่งที่ใช้บ่อย**

| ทำอะไร | คำสั่ง |
|---|---|
| restart หลัง deploy | `sudo -H -u cms pm2 reload cms-api` |
| หยุด / เริ่ม | `sudo -H -u cms pm2 stop cms-api` · `pm2 start cms-api` |
| ดูสถานะ + จำนวนครั้งที่ crash | `sudo -H -u cms pm2 status` |
| ล้าง log เก่า | `sudo -H -u cms pm2 flush` |

> ใช้ `reload` แทน `restart` เมื่อ deploy — `reload` รอให้ request ที่ค้างอยู่เสร็จก่อน
> (ตรงกับ graceful shutdown ที่ `server.ts` ทำไว้) ส่วน `restart` ตัดทันที

---

## ขั้นที่ 7 — ตั้งค่า nginx

```bash
sudo tee /etc/nginx/sites-available/cms > /dev/null <<'EOF'
# ── ตัวตรวจจับ bot ที่ดึง link preview ──────────────────
# LINE / Facebook / Slack ไม่รัน JavaScript จึงอ่านได้แค่ index.html ที่ยังไม่มี
# meta จริง (applySeo() เขียนตอน runtime) ทำให้ share ออกมาเป็นชื่อ shell
# จึงส่งเฉพาะ user agent กลุ่มนี้ไปที่ API ให้ render Open Graph ของ path นั้น
# ไม่รวม Googlebot ตั้งใจ — Google รัน JS ได้อยู่แล้ว ถ้าส่ง HTML คนละชุดจะกลายเป็น cloaking
#
# ทุกคำในนี้ต้องเป็นชื่อ "บอท" เท่านั้น ห้ามใส่ชื่อ "แอป" เด็ดขาด เพราะ in-app browser
# ของแอปนั้นจะโดนจับไปด้วย แล้วคนจริง ๆ จะเปิดเว็บไม่ได้เลย — หน้า preview มี
# <meta http-equiv="refresh"> ชี้กลับมาที่ URL เดิม พอ UA ยังเป็นตัวเดิมก็เข้าหน้า
# preview ซ้ำ วนไม่รู้จบ (เคสนี้เกิดกับ `LINE` มาแล้ว: in-app browser ของ LINE
# ส่ง UA ว่า `... Line/13.5.0` ส่วนบอทดึง preview ของ LINE ใช้
# `facebookexternalhit/1.1;line-poker/1.0` ซึ่งจับด้วยสองคำแรกอยู่แล้ว)
map $http_user_agent $cms_is_scraper {
    default 0;
    "~*(facebookexternalhit|Facebot|Twitterbot|line-poker|Slackbot|Discordbot|TelegramBot|WhatsApp/|Pinterestbot|Pinterest/0\.|SkypeUriPreview|vkShare|redditbot|Iframely|Embedly)" 1;
}

# bot จะโหลดรูป og:image ตามมาด้วย URL ที่มีนามสกุลไฟล์ต้องเสิร์ฟไฟล์จริงเสมอ
map $uri $cms_is_page {
    default 1;
    "~\."   0;
}

# `if` รับได้แค่ตัวแปรเดียว ต่อตัวแปรเข้าด้วยกันไม่ได้ — nginx จะอ่าน `$a$b`
# เป็นชื่อตัวแปรเดียวว่า `a$b` แล้ว `nginx -t` fail ทั้งไฟล์ ต้องรวมสองค่านี้
# ที่ map แทน (ฝั่งซ้ายของ map ใส่ข้อความปนตัวแปรได้) แล้วค่อยเช็คผลลัพธ์ตัวเดียว
map "$cms_is_scraper$cms_is_page" $cms_share_preview {
    default 0;
    "11"    1;
}

# ── API ────────────────────────────────────────────────
server {
    listen 80;
    server_name tt-api.dna.co.th;

    # ไฟล์สลิปบางไฟล์ใหญ่ ต้องมากกว่า MAX_UPLOAD_MB
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:4009;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        # ต้องมี ไม่งั้น secure cookie จะไม่ถูกส่ง เพราะแอปคิดว่าเป็น HTTP
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # เสิร์ฟไฟล์อัปโหลดตรงจากดิสก์ เร็วกว่าให้ Node ทำ
    location /uploads/ {
        alias /opt/cms/app/cms/api/uploads/;
        add_header Cache-Control "public, max-age=2592000, immutable";
        access_log off;
    }
}

# ── เว็บไซต์สาธารณะ ─────────────────────────────────────
server {
    listen 80;
    server_name tt.dna.co.th;
    root /var/www/html/front/thiotogether/cms/website/dist;
    index index.html;

    # location preview ข้างล่างถูกเข้าถึงผ่าน error_page ซึ่ง nginx จะทำเครื่องหมาย
    # request ไว้แล้วข้าม error_page ชั้นถัดไปทั้งหมด ถ้าไม่เปิดบรรทัดนี้ fallback
    # ตอน API ล่มจะไม่ทำงาน bot จะได้หน้า 504 ดิบ ๆ คือ card พังแบบที่ fallback ตั้งใจกันไว้
    recursive_error_pages on;

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }
    location / {
        # `return` ใน `if` เป็นรูปแบบเดียวที่ใช้ร่วมกับ try_files ได้อย่างปลอดภัย
        # 418 เป็นแค่รหัสที่ไม่ได้ใช้ ไว้กระโดดไป named location
        error_page 418 = @share_preview;
        if ($cms_share_preview) {
            return 418;
        }

        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;   # จำเป็นสำหรับ SPA history mode
    }

    location @share_preview {
        proxy_pass http://127.0.0.1:4009/api/v1/public/share-preview?path=$uri;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        # ถ้า API ช้าหรือล่ม ต้องไม่ทำให้ preview พัง ให้ตกกลับไปใช้ shell เดิม
        proxy_connect_timeout 2s;
        proxy_read_timeout 5s;
        proxy_intercept_errors on;
        error_page 500 502 503 504 = @spa_shell;
    }

    # ต้องเป็น named location ไม่ใช่ /index.html เพราะ nginx cache ค่า map ไว้
    # ตลอดอายุ request เดียว ถ้าวิ่งกลับเข้า `location /` มันจะยังเห็น
    # $cms_share_preview = 1 แล้วเด้งกลับมาที่นี่วนไปจนสุด แล้วจบด้วย 500
    location @spa_shell {
        add_header Cache-Control "no-cache";
        try_files /index.html =404;
    }

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}

# ── หน้าจัดการ ─────────────────────────────────────────
server {
    listen 80;
    server_name tt-admin.dna.co.th;
    root /var/www/html/front/thiotogether/cms/admin/dist;
    index index.html;

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }
    location / {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}
EOF

sudo ln -sf /etc/nginx/sites-available/cms /etc/nginx/sites-enabled/cms
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

nginx ต้องเข้าถึงโฟลเดอร์ dist ได้

```bash
sudo chmod o+x /opt/cms /opt/cms/app /opt/cms/app/cms
```

---

## ขั้นที่ 8 — เปิด HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx \
  -d example.com -d www.example.com \
  -d admin.example.com \
  -d api.example.com
```

certbot จะแก้ไฟล์ nginx ให้เป็น 443 พร้อม redirect จาก 80 อัตโนมัติ
และตั้ง cron ต่ออายุใบรับรองให้เอง ตรวจได้ด้วย

```bash
sudo certbot renew --dry-run
```

**หลังเปิด HTTPS แล้วต้องตรวจ**

```bash
curl -sI https://api.example.com/health | head -1     # ต้องได้ 200
```

แล้วลองเข้า `https://admin.example.com` เพื่อ login จริง — ถ้าเข้าได้แล้ว
ไม่ถูกเด้งออกภายใน 15 นาที แปลว่า refresh cookie ทำงานถูกต้อง

---

## ขั้นที่ 9 — อัปเดตเวอร์ชันใหม่

```bash
cd /opt/cms/app
sudo -u cms git pull
cd cms
sudo -u cms npm ci
sudo -u cms npm run prisma:generate
sudo -u cms npm run prisma:deploy
sudo -u cms npm run build
sudo -H -u cms pm2 reload cms-api
```

> **สำรองฐานข้อมูลก่อน migrate ทุกครั้ง**
> ```bash
> sudo -u postgres pg_dump --format=custom cms > ~/cms-$(date +%F-%H%M).dump
> ```

---

## สำรองข้อมูลอัตโนมัติทุกวัน

```bash
sudo tee /etc/cron.daily/cms-backup > /dev/null <<'EOF'
#!/bin/sh
set -e
DEST=/var/backups/cms
mkdir -p "$DEST"
sudo -u postgres pg_dump --format=custom cms > "$DEST/db-$(date +%F).dump"
tar -czf "$DEST/uploads-$(date +%F).tar.gz" -C /opt/cms/app/cms/api uploads
# เก็บย้อนหลัง 14 วัน
find "$DEST" -type f -mtime +14 -delete
EOF
sudo chmod +x /etc/cron.daily/cms-backup
```

> การสำรองที่ยังไม่เคยทดสอบ restore ถือว่ายังใช้ไม่ได้จริง
> ควรลอง restore ลง database ทดสอบอย่างน้อยหนึ่งครั้ง

---

## แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุและวิธีแก้ |
|---|---|
| หน้าเว็บขึ้นแต่ไม่มีข้อมูล เปิด console เจอ CORS error | `WEBSITE_URL` / `ADMIN_URL` ใน `api/.env` ไม่ตรงกับโดเมนที่เปิดจริง ต้องตรงเป๊ะรวม `https://` และไม่มี `/` ปิดท้าย แล้ว `pm2 reload cms-api` |
| CORS error ที่บอกว่า `...must not be the wildcard '*' when the request's credentials mode is 'include'` | มีคนใส่ `add_header Access-Control-Allow-Origin *` ไว้ใน nginx **ตัว API ไม่เคยส่ง `*` ออกมาเลย** — มันส่งชื่อ origin เต็ม ๆ กลับไปเมื่อตรงกับ allow-list และไม่ส่ง header อะไรเลยเมื่อไม่ตรง ต้องลบ `add_header Access-Control-*` ทุกบรรทัดออกจาก nginx แล้วปล่อยให้ API จัดการ CORS ฝ่ายเดียว (ดูหัวข้อถัดไป) |
| Login ได้แต่ถูกเด้งออกทุก 15 นาที | ยังไม่ได้เปิด HTTPS หรือ nginx ไม่ได้ส่ง `X-Forwarded-Proto` — cookie `secure` จึงไม่ถูกส่งกลับ |
| เรียก API แล้วได้ 404 ทุกเส้นทาง | เรียกผิด prefix — ทุก endpoint อยู่ใต้ `/api/v1` |
| Refresh หน้าใน SPA แล้วขึ้น 404 | ขาด `try_files $uri $uri/ /index.html;` ใน server block นั้น |
| รูปภาพเสียหมด | ไม่ได้ copy `api/uploads/` มาจาก local หรือ path ใน `alias` ผิด (ต้องมี `/` ปิดท้าย) |
| `pm2 status` ขึ้น `errored` และ restart วนไม่หยุด | ดูสาเหตุจริงด้วย `pm2 logs cms-api --err --lines 100` ส่วนใหญ่คือ `api/.env` ผิด (zod จะฟ้องชื่อตัวแปรที่ผิดตรง ๆ) หรือยังไม่ได้ `npm run build` จึงไม่มี `dist/` |
| `pm2 status` ไม่เห็น process ทั้งที่เพิ่ง start | รัน pm2 คนละ user กัน — pm2 แยก daemon ตาม user ต้องใช้ `sudo -H -u cms pm2 ...` ให้เหมือนกันทุกครั้ง ตรวจ daemon ที่ค้างด้วย `ps aux \| grep PM2` |
| API ไม่ขึ้นมาเองหลัง reboot | ลืม `pm2 save` หลัง start หรือยังไม่ได้รัน `pm2 startup systemd -u cms --hp /opt/cms` |
| `cms-api` ไม่ start และ log ฟ้อง sharp | Node ไม่ใช่เวอร์ชัน 20 — ตรวจด้วย `node -v` แล้วติดตั้ง libvips: `apt install libvips-dev` |
| อัปโหลดไฟล์ใหญ่แล้วได้ 413 | `client_max_body_size` ใน nginx น้อยกว่า `MAX_UPLOAD_MB` |
| แก้ `VITE_API_URL` แล้วไม่มีผล | ค่านี้ฝังตอน build ต้อง `npm run build` ใหม่ |
| `pg_restore: error: unsupported version` | ไฟล์ dump สร้างจาก PostgreSQL เวอร์ชันใหม่กว่าบน server ตรวจด้วย `pg_restore --list ไฟล์.dump \| head -3` แล้วติดตั้งเวอร์ชันให้ตรงกัน (ดูขั้นที่ 1) |

### CORS เป็นหน้าที่ของ API ฝ่ายเดียว ห้าม nginx ยุ่ง

`api/src/app.ts` ตั้ง allow-list ไว้เป็น `[WEBSITE_URL, ADMIN_URL]` พร้อม `credentials: true`
พฤติกรรมของมันมีแค่สองแบบ ไม่มีแบบอื่น

| origin ที่ยิงเข้ามา | API ตอบกลับ |
|---|---|
| ตรงกับ `WEBSITE_URL` หรือ `ADMIN_URL` | `Access-Control-Allow-Origin: <origin นั้นเต็ม ๆ>` + `Allow-Credentials: true` |
| ไม่ตรง | **ไม่ส่ง header `Access-Control-*` เลย** |

แปลว่าถ้าเบราว์เซอร์เห็น `Access-Control-Allow-Origin: *` **ค่านั้นมาจาก nginx หรือ CDN เสมอ ไม่ได้มาจาก API**
และ `add_header` ของ nginx เป็นการ **เพิ่ม** ไม่ใช่ทับของเดิมจาก upstream ใส่ไว้เมื่อไหร่ก็พังเมื่อนั้น
เพราะ request ที่มี cookie (`credentials: 'include'`) ห้ามเจอ `*` ตามสเปกของเบราว์เซอร์

ไล่หาสาเหตุ 3 คำสั่ง

```bash
# 1) API ตอบอะไร (ยิงตรงข้าม nginx)
curl -si -X OPTIONS http://127.0.0.1:4009/api/v1/auth/login \
  -H "Origin: https://admin.thiotogether.com" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control

# 2) หลังผ่าน nginx แล้วตอบอะไร
curl -si -X OPTIONS https://thiotogether.com/api/v1/auth/login \
  -H "Origin: https://admin.thiotogether.com" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control

# 3) หา add_header ที่ใส่ไว้
sudo grep -rn "Access-Control" /etc/nginx/
```

อ่านผล

- **(1) ถูก แต่ (2) เป็น `*`** → nginx (หรือ Cloudflare) เป็นคนใส่ ลบทิ้งแล้ว `nginx -t && systemctl reload nginx`
- **(1) ไม่มี header เลย** → `ADMIN_URL` ใน `api/.env` ไม่ตรงกับโดเมนที่เปิดจริง แก้ให้ตรงเป๊ะแล้ว `pm2 reload cms-api`

> เว็บกับ admin อยู่คนละ subdomain แต่โดเมนหลักเดียวกัน (`thiotogether.com`) cookie จึงยังเป็น
> same-site อยู่ `sameSite=strict` ที่ตั้งไว้ใน `auth.controller.ts` ทำงานได้ปกติ — แต่ถ้าวันไหน
> ย้าย admin ไปโดเมนอื่นคนละชื่อ cookie จะไม่ถูกส่งอีกเลย ต้องเปลี่ยนเป็น `sameSite: 'none'`

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
- [ ] `pg_dump` nightly + uploads volume backup; test restores

**Performance**
- [x] Route-level code splitting, async block components, vendor chunking
- [x] Thumbnails (sharp → webp), lazy images, Cache-Control on public GETs + static assets
- [ ] Put a CDN in front of `/uploads` and both SPAs
- [ ] Scale API horizontally (stateless; sessions live in PostgreSQL)

**Operations**
- [x] `/health` endpoint, pino structured logs, graceful shutdown
- [ ] Wire logs to your aggregator; alert on 5xx rate and OCR failure rate
- [ ] Run `prisma migrate deploy` in CI before rolling new API images
