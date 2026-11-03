# Deploying to Vercel

The marketplace runs as **two Vercel projects** from this one repo, plus a hosted Postgres database:

| Piece    | Where                                  | Root directory | Framework preset   |
| -------- | -------------------------------------- | -------------- | ------------------ |
| Frontend | Vercel project (e.g. `farm-web`)       | `frontend`     | Next.js (auto)     |
| Backend  | Vercel project (e.g. `farm-api`)       | `backend`      | NestJS (auto)      |
| Database | Neon, AWS **Sydney** (ap-southeast-2)  | —              | —                  |

Both projects pin their functions to Sydney (`"regions": ["syd1"]` in each `vercel.json`). Put the database in Sydney too, or every query crosses the Pacific.

**Plan:** Hobby works for a trial deploy. Move to **Pro** before taking real payments, because Hobby is for non-commercial use only. The promotion-expiry cron runs once a day, around 1am Sydney time, since Hobby fails any deploy with a more frequent cron. On Pro you can make it hourly by changing the schedule in `backend/vercel.json` to `0 * * * *`.

---

## 1. Database

1. Create a Neon project in **AWS Sydney**. (Supabase or any Postgres 15+ also works.)
2. Copy two connection strings from the Neon dashboard:
   - **Pooled** (host contains `-pooler`). Both Vercel projects use this as `DATABASE_URL`.
   - **Direct** (no `-pooler`). Use this only for running migrations.
3. Create the schema from your machine (PowerShell):

   ```powershell
   cd backend
   $env:DATABASE_URL = "<direct connection string>"
   npm run db:deploy
   Remove-Item Env:DATABASE_URL
   ```

   You should see 4 migrations applied. **Never** run `prisma db push`, `migrate reset` or `npm run seed:sample` against production.

## 2. Backend project

Import the repo in Vercel and set **Root Directory = `backend`**. Vercel detects NestJS and deploys `src/main.ts` as one function. You don't need a build command. `npm install` runs `prisma generate` through `postinstall`.

Set the environment variables (scope: **Production**):

| Variable                        | Value                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | Neon **pooled** connection string                                                               |
| `AUTH_SECRET`                   | Random 32+ bytes, e.g. `npx auth secret`. **Must be identical in both projects.** The frontend signs API tokens with it and the backend verifies them. |
| `FRONTEND_URL`                  | Public site URL, no trailing slash, e.g. `https://yourfarm.com.au`. Used for CORS, email links and Stripe return URLs. Fill in after step 3 if you don't know it yet. |
| `STRIPE_SECRET_KEY`             | `sk_live_…`                                                                                     |
| `STRIPE_WEBHOOK_SECRET`         | `whsec_…` from the **"Your account"** webhook endpoint (step 4)                                |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | `whsec_…` from the **"Connected accounts"** webhook endpoint (step 4)                          |
| `RESEND_API_KEY`                | `re_…`                                                                                          |
| `FROM_EMAIL`                    | Sender on a domain you've verified in Resend, e.g. `orders@yourfarm.com.au`                    |
| `CRON_SECRET`                   | Random string, 16+ characters. Vercel sends it to the cron route automatically.                |

Optional: `REPORTING_TIMEZONE` (default `Australia/Sydney`) and `ANALYTICS_CACHE_TTL_MS` (default `60000`).

Not needed on Vercel: `PORT`, `DISABLE_BACKGROUND_JOBS` (the in-process timer turns itself off on Vercel), `CLOUDINARY_*` and `STRIPE_PUBLISHABLE_KEY` (the backend doesn't read them).

Deploy, then open `https://<backend-url>/`. You should get the hello response.

## 3. Frontend project

Import the repo again as a second project with **Root Directory = `frontend`**.

| Variable                               | Value                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`                         | Same Neon **pooled** connection string                                   |
| `AUTH_SECRET`                          | **Same value as the backend**                                            |
| `NEXT_PUBLIC_BACKEND_URL`              | Backend URL, no trailing slash, e.g. `https://api.yourfarm.com.au`       |
| `NEXT_PUBLIC_SITE_URL`                 | Public site URL, no trailing slash. Used for metadata and canonical links. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`   | `pk_live_…`                                                              |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`    | Your Cloudinary cloud name                                               |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Unsigned upload preset (see `CLOUDINARY_SETUP.md`)                       |

`NEXT_PUBLIC_*` values are compiled into the build. After changing one, **redeploy**. You don't need `AUTH_URL`: Auth.js trusts the Vercel host automatically.

Then go back to the backend project, set `FRONTEND_URL` to the frontend's URL and **redeploy the backend**. Vercel only applies env var changes on the next deployment.

**Custom domains** (optional): add `yourfarm.com.au` to the frontend and `api.yourfarm.com.au` to the backend. Then update `FRONTEND_URL`, `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_BACKEND_URL` and redeploy both. CORS allows exactly one origin (`FRONTEND_URL`), so let Vercel redirect the other hostnames (www, `*.vercel.app`) to the canonical one.

## 4. Stripe (live mode)

In Stripe → Developers → Webhooks, create **two** endpoints, both pointing at `https://<backend-url>/stripe/webhook`:

| Endpoint listens to    | Events                                                                                                                   | Secret goes in                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| **Your account**       | `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed` | `STRIPE_WEBHOOK_SECRET`          |
| **Connected accounts** | `account.updated`                                                                                                        | `STRIPE_CONNECT_WEBHOOK_SECRET`  |

Redeploy the backend after adding the secrets. Also check that Connect is enabled for live mode, and that your platform profile and branding are filled in.

## 5. Other services

- **Resend:** verify the sending domain (SPF/DKIM DNS records), otherwise production emails are rejected.
- **Cloudinary:** nothing to change. Uploads go straight from the browser using the unsigned preset.

## 6. First admin

Sign up on the live site with your own email, then in the Neon SQL editor:

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@yourfarm.com.au';
```

Sign out and back in. Then review **Admin → Settings** (commission, minimum payout, promotion pricing) before inviting vendors.

## 7. Smoke test

- [ ] Homepage loads; sign up, sign in, sign out
- [ ] Vendor: register → admin approves → Stripe Connect onboarding completes → vendor's payout status shows enabled
- [ ] Create a product with an image (Cloudinary upload works)
- [ ] Customer: place a small real order. Stripe shows the webhook delivered with 2xx, the order appears for customer and vendor, and confirmation and new-order emails arrive.
- [ ] Refund that order (vendor or admin). Stock is restored and Stripe shows the refund.
- [ ] Backend project → Settings → Cron Jobs → **Run** `/cron/promotion-expiry`. The logs show 200 with `{"expired":0}`.

## Changing the schema after launch

Production is now migration-based, so `db push` is for throwaway databases only.

1. Edit `backend/prisma/schema.prisma`, then locally run `npx prisma migrate dev --name <what-changed>` (the local DB is baselined, so this works). Commit the new migration folder.
2. Before or with the deploy that needs it, apply it to production with `npm run db:deploy` using the **direct** connection string, as in step 1.
3. `frontend/prisma/schema.prisma` is a separate, smaller copy that the frontend uses only for Auth.js and sign-up (the `User`, `Account`, `Session` and `VerificationToken` models). If you change those models, mirror the change there. Never run migrations from the frontend.

## Notes on running serverless

- **Cold starts:** the first request after an idle period boots Nest and Prisma and takes noticeably longer. Fluid compute keeps instances warm under steady traffic.
- **Analytics cache:** it's per instance, so dashboard figures can lag by up to `ANALYTICS_CACHE_TTL_MS` (60 s) after a change.
- **Promotion expiry:** runs once a day (hourly is possible on Pro), and only on production deployments. The storefront already hides ended promotions by date, so the daily run only delays the status change and the vendor's "listing ended" notice. Vercel can occasionally deliver a run twice, and the job only notifies for promotions that run actually expired, so vendors aren't emailed twice.
