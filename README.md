# Briefbox Digital website (Next.js)

Ekta repo te 3 ta jinis:

| Kothay | Ki |
|---|---|
| `briefboxdigital.com` | Public website (home, services, pricing, blog, pages, contact). Ager site er moto hubohu, ekhon dynamic. |
| `/admin` | Admin panel: website er shob edit, media, inbox, history, users, ar Automations (products, clients, payments). Nijer email + password login, GitHub lagbe na. |
| `/portal` | Client portal: sign up, Company info, My automations (protiti automation er Settings, Dashboard, Subscription). |

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
- **Automations** (shudhu Super Admin): Overview, Clients, Payments, Products, Billing settings, n8n connection.

Save & publish korle live site e kichu second er moddhe change dekha jay.

## 4. Automations (products)
Protiti automation ekta **product**. Client portal e product choose kore, tar form puron kore, plan kine. Tumi approve korle n8n e workflow toiri hoy.

**Notun automation jog kora (code chara):**
1. n8n e workflow ta ekbar banao, naam e `(template)` rakho, ar off rakho.
2. Ekta **Code node** banao, naam dao `Client Settings`. Bhitore `const S = {};` likho. Workflow er baki node gula client er value `S` theke porbe (`S.li_token`, `S.client_id`, `S.company_name`, `S.tables.posts`).
3. Admin → Automations → **Products → Add product**.
   - **Details:** naam, icon, template workflow ID. Product e 2-3 ta workflow thakle shob ID space diye dao. Tarpor **Check template** chapo.
   - **Client form:** client ki ki dibe (text, secret/token, dropdown, on/off, list).
   - **Data and dashboard:** kon data table banabe ar dashboard e ki dekhabe.
   - **Plans:** dam, meyad, mashik limit.
   - "Shown to clients" on koro.
4. Approve korle template copy hoy client er value shoho, protiti Webhook node notun address pay, ar data table toiri hoy.

**Lead Engine** age thekei product hishebe ache. Tar form ar dashboard alada, bodlano hoyni.

**n8n connection:** n8n URL `https://n8n.velsario.com` ar API key dao, tarpor **Save and test**. Same page e daily expiry check er URL ar `X-Cron-Key` ache: n8n e Schedule Trigger (protidin) → HTTP Request (GET, header `X-Cron-Key`).

**Purono workflow jog kora:** client er page e automation khulo → "Link existing workflow" → workflow select → Link. Tarpor Subscription tab e "Paid until" date dao.

## 5. Email (order confirmation, invoice, receipt)

Client plan choose korle tar kache **order confirmation + invoice** email jay, payment details pathale "we are checking", tumi Mark paid korle **receipt**, approve korle "automation approved", sign up korle welcome. Tumi copy pao: new order, payment to check, sign-up.

Admin → Automations → **Billing settings** → niche **Emails to clients**:

**Resend (recommended, free 3,000/month):**
1. resend.com e account → **Domains → Add domain** → `briefboxdigital.com` → je DNS record dey, Cloudflare DNS e add koro → Verify.
2. **API Keys → Create** → key copy.
3. Admin e: Send emails with = Resend, From = `Briefbox Digital <billing@briefboxdigital.com>`, Reply-to = `hello@briefboxdigital.com`, Your email for copies = tomar email, API key paste → **Save** → **Send test email**.

**Ba nijer n8n diye:** n8n e Webhook (POST) → Gmail/SMTP node (To = `{{$json.body.to}}`, Subject = `{{$json.body.subject}}`, HTML = `{{$json.body.html}}`). Webhook er Production URL admin e boshao.

Niche "Recent emails" e protiti email sent/failed dekha jay. Email fail korleo order/payment thik moto save hoy.

Client portal e **Invoices** page ache: protiti invoice/receipt khule **Print or save PDF** kora jay.

## 6. SEO, alt text, speed

- **Alt text:** Media Library te protiti image er niche "Alt text" likho (Enter/bahire click korle save). Cover field er pashe **Cover alt** field ache; khali thakle Media Library er alt, tarpor page heading use hoy. Blog body te image dite **Copy HTML** chapo, alt soho ashe.
- Upload korle image nije 1920px e choto hoy ar WebP hoy (8 MB porjonto upload kora jay).
- Built-in image gula WebP e (80-90% choto), cover image e size deya, tai page jump kore na.
- Protiti page er nijer social preview image (cover), sitemap e asol last-update date, Service schema te dam (AggregateOffer).
- **Built-in content load:** code e content bodlale (jemon notun package), admin e age save kora version database e thake. Admin → **History** → "Built-in content" theke section ta load koro. Purono version History te theke jay.
- Cloudflare dashboard (optional, aro fast): **Speed → Optimization** e Early Hints ar HTTP/3 on. Workers **Paid plan ($5)** nile CPU limit er "1102" error ar hoy na.

## 7. Security
- Security headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy) `next.config.mjs` e.
- `/admin`, `/portal`, `/api` noindex ar no-store.
- Password PBKDF2 diye hash. Session cookie HttpOnly, Secure, SameSite, signed.
- Ek email e 5 bar bhul password dile 15 minute lock.
- Onno site theke form submit block (Origin check).
- Client der WhatsApp/CRM token ar n8n API key database e encrypted.
- Contact form e honeypot ar rate limit (ek IP theke ghontay 20 ta).
- Chaile Cloudflare Access diye `/admin*` shudhu tomar email e lock koro (free).

## 8. Folder
```
app/            pages (Next.js App Router), /api, /media, sitemap.xml, robots.txt
components/     website er HTML blocks (site.jsx, views.jsx)
content/        built-in content (database na thakle eta dekhay)
lib/            database, content, login, Lead Engine, API
public/assets/  logo, style.css, app.js (cookie banner, tracking, forms, hero animation), cover images
public/panel/   admin ar portal er interface
```
Local e chalate: `npm install` → `npm run dev` → http://localhost:3000
