# Charity

Charity is a donations platform, inspired by crowdfunding sites like GoFundMe, where people can create donation campaigns and donors can support causes through direct bank deposits.

The application is bilingual (Spanish by default, English available). The language is detected from the browser and the user can switch at any time. All source code, database tables, fields, functions and libraries are written in English; all user-facing text lives in the translations file `lang.js`.

## Features

- Two kinds of users: fundraisers (campaign organizers) and donors, plus administrators.
- Fundraisers publish campaigns for a one-time posting fee of $5 deposited to the Charity bank account (no payment gateway yet).
- Fundraisers can upload up to 10 images per campaign (JPG, PNG, WEBP, GIF, max 1 MB each).
- Campaigns receive donations directly to the fundraiser bank account; the campaign page shows the organizer bank details.
- Donors confirm their deposit by entering their bank name and the deposit confirmation number.
- Donations may be anonymous, or donors can include their name.
- Campaigns close automatically on a preset date; afterwards the fundraiser can post progress updates about the use of the funds, including images.
- Landing page shows 4 urgent campaigns, 10 recently opened campaigns and 10 recently completed campaigns (counts are configurable via `.env`).
- Administrators manage the platform from a dashboard: latest campaigns, donations and users, deactivate inappropriate campaigns, and flag campaigns as urgent.
- Light and dark themes (light is the default), fully responsive, minimalist professional design with SVG icons only.

## Tech stack

- Node.js + Express (server)
- EJS templates rendered with `.html` extension (the view engine is configured in `app.js`)
- PostgreSQL (database) via the `pg` package, using a connection string
- Cookies + user token for login persistence (no sessions)
- Passwords hashed with sha256 from `node:crypto`
- Only five npm packages are used: `express`, `express-fileupload`, `ejs`, `cookie-parser`, `pg`
- No external libraries: no icon fonts, no Google Fonts, no CDNs; icons are inline SVG
- Environment configuration is read from a plain `.env` file (parsed manually, no `dotenv` package)

## Requirements

- Node.js 18 or newer
- PostgreSQL 12 or newer

## Installation

1. Clone or copy the project and install dependencies:

   ```bash
   npm install
   ```

2. Create the database and apply the schema:

   ```bash
   createdb charity
   psql -d charity -f database.sql
   ```

3. (Optional) Load demo data so the site is populated immediately:

   ```bash
   psql -d charity -f dummydata.sql
   node scripts/placeholder.js
   ```

   The placeholder script generates the dummy image files referenced by `dummydata.sql` inside `public/uploads` (it only uses Node built-ins).

4. Configure the environment. Copy the template and edit the values:

   ```bash
   cp .env.example .env
   ```

5. Start the application:

   ```bash
   npm start
   ```

   The app listens on `http://localhost:3000` by default.

## Environment variables

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string (used by the pg Pool constructor) | `postgres://postgres:password@localhost:5432/charity` |
| `COOKIE_SECRET` | Secret used to sign cookies | `cookie-secret` |

## Project structure

```
app.js                 main entry point: server, middleware, routes, uploads
database.js            Database class with every SQL query as a method
database.sql           schema (CREATE TABLE statements for the charity database)
dummydata.sql          demo data (users, campaigns, images, donations, progress)
lang.js                translations (Spanish default + English)
.env                   environment configuration (not committed)
.env.example           template for the environment file
views/                 EJS templates with .html extension
  header.html          shared header component (included at the top of every page)
  footer.html          shared footer component (included at the bottom)
  card.html            campaign card component
  index.html           landing page
  campaigns.html       campaign listings with filters
  campaign.html        campaign detail, donation form, bank details, progress
  create.html          create campaign form (fee notice + uploads)
  progress.html        post a progress update for a closed campaign
  mycampaigns.html     fundraiser management: donations, confirmations, close
  register.html        registration form
  login.html           login form
  forgot.html          forgot password (shows recovery link in dev mode)
  reset.html           set a new password
  dashboard.html       admin dashboard
  404.html, 403.html, 400.html, 500.html
public/
  media/               static images (favicon, logo)
  assets100/           styles and scripts, versioned (100)
    common.css         shared styles (all pages)
    common.js          theme toggle and mobile navigation
    index.css, campaigns.css, campaign.css, create.css,
    mycampaigns.css, auth.css, dashboard.css, error.css
    campaign.js, auth.js, create.js
  uploads/             uploaded campaign and progress images
scripts/
  placeholder.js       generates dummy images for the demo data
```

## Database

Database name: `charity`. All tables, columns, indexes and comments are in English. Timestamps are stored as BIGINT epoch milliseconds.

### Tables

- `users` — id, userid (unique lowercase identifier), name, govid, address, email, phone, country, password (sha256 hex), token (login cookie token), isadmin, resettoken, resetexp, created, updated.
- `campaigns` — id, userid (owner), title, description, goalamount, commission (reserved for the future, currently 0), bankname, bankaccount, bankholder (direct deposit details), enddate (preset closing date), status, urgent, coverimg, created, updated.
- `campaignimages` — id, campaignid, img (relative path under uploads), sort, created.
- `donations` — id, campaignid, userid (donor), amount, bankname, confirmation (deposit confirmation number), donorname, anonymous, status, created.
- `progress` — id, campaignid, title, text, created. Progress posts published by the fundraiser after the campaign closes.
- `progressimages` — id, progressid, img, sort, created.

### Status codes

Campaign status (smallint): `0` open, `1` closed, `2` cancelled, `3` refunded, `4` invalid.

Donation status (smallint): `0` sent, `1` confirmed, `2` cancelled, `3` refunded, `4` invalid.

Donations are created as `sent` and the fundraiser confirms them (`confirmed`) once the deposit appears in their bank account. Only confirmed donations count toward the campaign raised amount.

## Routes

Public pages:

| Route | Description |
| --- | --- |
| `GET /` | Landing page with urgent, recent open and recent closed campaigns |
| `GET /campaigns` | Campaign listings, filter with `?f=all|open|closed|urgent` |
| `GET /campaign/:id` | Campaign detail: gallery, description, bank details, donations, progress |
| `GET /register` / `POST /register` | Create an account |
| `GET /login` / `POST /login` | Log in |
| `GET /logout` | Log out |
| `GET /forgot` / `POST /forgot` | Password recovery (no mailer yet: the recovery link is displayed on screen) |
| `GET /reset` / `POST /reset` | Set a new password with a recovery token |
| `GET /lang/:code` | Switch language (`es` or `en`), stored in a cookie |

Authenticated routes (fundraisers and donors):

| Route | Description |
| --- | --- |
| `GET /create` / `POST /create` | Create a campaign (multipart form, up to 10 images) |
| `GET /mycampaigns` | Manage own campaigns and their donations |
| `POST /campaign/:id/donate` | Record a donation (bank name + confirmation number) |
| `POST /campaign/:id/close` | Close own campaign |
| `GET /campaign/:id/progress` / `POST /campaign/:id/progress` | Post a progress update (closed campaigns) |
| `POST /campaign/:id/donation/:did/status` | Confirm or cancel a donation (owner or admin) |

Admin routes (admins only):

| Route | Description |
| --- | --- |
| `GET /dashboard` | Platform overview: stats, latest campaigns, donations, users |
| `POST /admin/campaign/:id/deactivate` | Deactivate a campaign (status invalid) |
| `POST /admin/campaign/:id/activate` | Reopen a campaign |
| `POST /admin/campaign/:id/urgent` | Flag a campaign as urgent |
| `POST /admin/campaign/:id/unurgent` | Remove the urgent flag |

## Authentication

- Registration stores the password as a sha256 hash (from `node:crypto`).
- On login, a random token is generated, stored in the `users.token` column and sent to the browser as a signed HttpOnly cookie.
- A middleware reads the cookie on every request and loads the user into `req.locals.user` (also exposed to templates as `res.locals.user`).
- Visitors can browse campaigns and campaign pages without an account; creating campaigns and donating requires login.
- Forgot password generates a one-hour token (`resettoken`/`resetexp`). Since no mailer is installed, the recovery link is shown on the screen; wire a real mailer later to send it.

## Language system

- All translations live in `lang.js` (`es` and `en` objects keyed by English identifiers).
- The language is detected from the `lang` cookie; when absent, it falls back to the browser `Accept-Language` header. Spanish is the default.
- Every render exposes the current translations as `res.locals.lang` and a helper `t('key')` used in templates, e.g. `<%= t('nav_home') %>`.
- Users switch language with the ES/EN control in the header, which sets the cookie through `/lang/:code`.

## Theming and versioning

- `public/assets100/` holds all styles and scripts. The `100` folder is the version identifier; bump it when you ship new assets.
- `common.css` contains the shared design system with CSS variables. Light mode is the default; the theme toggle in the header switches to dark mode and the choice is persisted in `localStorage`.
- Every page has its own stylesheet named after the page (`index.css`, `campaign.css`, ...) loaded through the header component when the page passes `extraCss`.
- Layout is responsive: the navigation collapses into a hamburger menu on mobile and grids reflow to single columns.

## Uploads

- Uploaded files go to `public/uploads`.
- Only JPG, JPEG, PNG, WEBP and GIF images are accepted, maximum 1 MB per file (validated on the server and in the browser).
- Campaign images are stored under `uploads/campaigns/<campaignid>/` and progress images under `uploads/progress/<progressid>/` with unique filenames.
- A campaign accepts up to 10 images; the first uploaded image becomes the cover.

## Demo accounts

After loading `dummydata.sql`:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@example.com` | `admin123` |
| Fundraiser | `maria@example.com` | `fund123` |
| Fundraiser | `carlos@example.com` | `fund123` |
| Fundraiser | `lucia@example.com` | `fund123` |
| Fundraiser | `pedro@example.com` | `fund123` |
| Donor | `ana@example.com` | `donor123` |
| Donor | `jorge@example.com` | `donor123` |
| Donor | `elena@example.com` | `donor123` |
| Donor | `luis@example.com` | `donor123` |

## Notes for the future

- The `commission` field on campaigns is reserved and stays at 0; a future commission per donation can be implemented on top of it.
- The forgot-password flow currently displays the reset link in the page because there is no mailer; replace that step with a real email send.
- The posting fee has no payment gateway: the fundraiser confirms the $5 deposit to the Charity bank account listed on the create page.
