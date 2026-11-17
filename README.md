# Briefbox Digital website (Next.js)

Ekta repo te 3 ta jinis:

| Kothay | Ki |
|---|---|
| `briefboxdigital.com` | Public website (home, services, pricing, blog, pages, contact). Ager site er moto hubohu, ekhon dynamic. |
| `/admin` | Admin panel: website er shob edit, media, inbox, history, users, Lead Engine clients/payments/plans. Nijer email + password login, GitHub lagbe na. |
| `/portal` | Lead Engine client portal: client sign up, Info, Settings, Dashboard, Subscription. |

Database chara-o site chole (built-in content dekhay). Database connect korle admin theke edit kora jay.

---

## 1. Deploy (Cloudflare, domain already Cloudflare e ache)

1. Ei folder er shob kichu GitHub repo te upload koro (purono `build.js`, `vercel.json`, `admin/`, `dist/` muche dao).
2. Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → repo select koro.
3. Settings:
   - Project name: `briefboxdigital` (wrangler.jsonc er `name` er sathe mil thakte hobe)
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx opennextjs-cloudflare deploy`
4. **Deploy**. 2-4 minute por `briefboxdigital.<tomar-account>.workers.dev` e site chalu.
5. Worker → **Settings → Domains & Routes → Add → Custom domain** → `briefboxdigital.com` (ar chaile `www.briefboxdigital.com`).
   Domain e jodi age Vercel er DNS record (A/CNAME) thake, Cloudflare DNS theke oita delete korte hobe, na hole add hobe na.

Ekhon theke GitHub e jei change push korba, Cloudflare nije abar deploy korbe.

> Cloudflare Workers **free plan** e ekta request e 10ms CPU limit ar 3 MB size limit ache. Next.js site e majhe majhe "Error 1102" dite pare. Business site er jonno **Workers Paid ($5/month)** nite bolbo. Size limit e deploy fail korle-o oitai solution.

### Vercel e rakhte chaile
Vercel → Add New Project → repo import → Deploy. Kono setting lagbe na. Database er jonno nicher "Vercel theke" part dekho.

---

## 2. Database (pore, ekbar)

1. Cloudflare → **Storage & Databases → D1 → Create** → naam `briefbox` → Create. **Database ID** copy koro.
2. GitHub e `wrangler.jsonc` kholo. Shesher 3 ta database line er shuru theke `//` muche dao, `PASTE-DATABASE-ID-HERE` er jaygay ID boshao. Commit.
3. Deploy shesh hole `briefboxdigital.com/admin` kholo → **owner account banao** (naam, email, password).
   Database connect korar sathe sathei eta koro: owner na thaka porjonto je keu ei page khulle account banate parbe.
   Chaile Worker → Settings → Variables e `ADMIN_SETUP_CODE` boshao, tahole setup e oi code lagbe.

Table gulo nije toiri hoy, kono SQL chalate hobe na.

**Vercel theke:** D1 create koro, tarpor Vercel → Settings → Environment Variables:
`CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, `CF_API_TOKEN` (Cloudflare API token, permission: D1 Edit). Redeploy.

---

## 3. Admin panel e ki ki ache

- **Dashboard**: SEO health (title/description length), launch checklist, recent changes.
- **Inbox**: contact page er message ar booking request. Formspree endpoint thakle email-o ashe.
- **Homepage, Header & Footer, SEO & Branding, Page Texts**: ager admin er moto.
- **Services, Pricing, Pages, Blog, FAQs**: list, search, new, duplicate, delete, reorder.
- **Media Library**: image upload (max 1.5 MB), `/media/...` address, Cover field theke choose.
- **Tracking & Booking**: GTM, GA4, Google Ads, Meta Pixel, custom script (cookie consent er por load hoy), Google Calendar link, Formspree.
- **History**: protiti save er version (section e last 40 ta), ek click e restore.
- **Users & Access**: admin add/disable/delete, role, password reset, nijer password change.
  - Super Admin: shob kichu
  - Editor: content, media, inbox
  - Viewer: shudhu dekhte pare
- **Lead Engine** (shudhu Super Admin): Overview, Clients (approve/pause/link workflow), Payments, Plans, Billing settings, n8n connection.

Save & publish korle live site e kichu second er moddhe change dekha jay.

## 4. Lead Engine chalu kora
Admin → Lead Engine → **n8n connection**:
- n8n URL: `https://n8n.velsario.com`
- n8n API key
- Template workflow ID
- Shob boshano hole **Test connection** chapo.

Oi page e expiry check er URL ar `X-Cron-Key` ache. n8n e ekta workflow banao: Schedule Trigger (protidin) → HTTP Request (GET, oi URL, header `X-Cron-Key`).

Client ra `briefboxdigital.com/portal` e sign up kore. Footer e "Client login" link deya ache.

## 5. Security
- Security headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy) `next.config.mjs` e.
- `/admin`, `/portal`, `/api` noindex ar no-store.
- Password PBKDF2 diye hash. Session cookie HttpOnly, Secure, SameSite, signed.
- Ek email e 5 bar bhul password dile 15 minute lock.
- Onno site theke form submit block (Origin check).
- Client der WhatsApp/CRM token ar n8n API key database e encrypted.
- Contact form e honeypot ar rate limit (ek IP theke ghontay 20 ta).
- Chaile Cloudflare Access diye `/admin*` shudhu tomar email e lock koro (free).

## 6. Folder
```
app/            pages (Next.js App Router), /api, /media, sitemap.xml, robots.txt
components/     website er HTML blocks (site.jsx, views.jsx)
content/        built-in content (database na thakle eta dekhay)
lib/            database, content, login, Lead Engine, API
public/assets/  logo, style.css, app.js (cookie banner, tracking, forms, hero animation), cover images
public/panel/   admin ar portal er interface
```
Local e chalate: `npm install` → `npm run dev` → http://localhost:3000
