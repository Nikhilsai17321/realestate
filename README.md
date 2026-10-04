# PropertyHub

A global-ready property discovery platform with a geographic map powered by OpenStreetMap.

## Run locally

Requirements: Node.js 22.12 or newer.

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` before starting. Generate a unique session secret locally in PowerShell with `$secret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`, then place it in `SESSION_SECRET`. Set an `ADMIN_EMAIL` and unique `ADMIN_PASSWORD` of at least 14 characters. To enable AI search, create a key in your DeepSeek account and set `DEEPSEEK_API_KEY` in `.env`; keep it out of browser code, screenshots, and source control. `DEEPSEEK_MODEL` defaults to `deepseek-flash`. Do not reuse production credentials for development. Then run:

```powershell
npm run dev
```

Open <http://127.0.0.1:5173/>. Vite serves the app and proxies `/api` and Socket.IO to the Node API on port 3000. SQLite data is stored in `data/propertyhub.sqlite`.

The first server start creates the configured admin account if that email does not already exist. Configure credentials before first start; changing the environment password does not reset an existing account.

## App features

- OpenStreetMap city maps, listing-location search, Google Maps directions, and clear approximate-location notices; the map never requests the visitor's GPS coordinates.
- Multi-market buy and rental search across sample listings in more than 20 cities and 20 currencies, with country/location, property type, sorting, and list/map controls.
- A persistent language selector for English, Hindi, Spanish, French, Arabic, Simplified Chinese, Portuguese, German, Japanese, and Italian. Main discovery controls and authentication forms are localized; additional pages can be added to the locale catalogue in `locales.js`.
- SQLite-backed registration, bcrypt password hashes, HttpOnly session cookies, saved homes, and private enquiries.
- Password recovery with one-time, 30-minute reset links; local development links are printed in the API terminal.
- Admin-only listing publishing, exact-title duplicate checks within a city, inquiry review, and live inventory updates over Socket.IO. Admins attest to listing authorization and current details; non-demo listings are hidden after 30 days without rechecking.
- Zod request validation, Helmet security headers/CSP, same-origin mutation checks, request-size limits, and API/auth/inquiry rate limiting.
- Locally hosted DM Sans and Fraunces fonts, Lucide icons, keyboard skip/focus support, mobile navigation, dark theme, and print styles.

## Data and launch notes

The worldwide city listings and property photos are fictional illustrative samples, not verified offers. Four Hyderabad project references link to 99acres; they require authorization and a fresh manual check before they become visible. Do not scrape or republish third-party portal listings without permission. Map pins show city centers, not exact parcels; map and directions services receive the selected city only. Visitors choose their starting point in Google Maps. The market selector filters by the listing's native currency and does not convert currencies. Enquiries are stored privately in the local database and rate-limited; email/SMS delivery, email verification, production password-reset email delivery, real estate-agent identity checks, payment processing, WhatsApp, analytics, and Google Search Console are not configured. In development, reset links are written to the API terminal; production reset requests remain disabled until a mail-delivery service is configured.

For production, set `NODE_ENV=production`, `SESSION_SECRET`, `APP_ORIGIN` to the exact HTTPS origin, and the admin credentials. Run `npm run build` and `npm start` behind a trusted HTTPS reverse proxy. Persist and back up the SQLite `data/` directory; it is intentionally excluded from Git. Configure `TRUST_PROXY=true` only when the server is behind a trusted single proxy. Review the CSP and image allowlist if your approved listing image host changes.

## Checks

```powershell
npm test
npm run build
```
