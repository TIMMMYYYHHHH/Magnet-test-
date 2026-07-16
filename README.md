# CustomVibe

Custom photo fridge magnets (7.5×7.5cm), handmade in Durban, delivered nationwide across South Africa via PUDO pickup points. Single-product e-commerce site running entirely on Cloudflare Workers — plain HTML/CSS/JS, no framework.

## Stack

- **Static pages** (`public/`) served via Wrangler's `[assets]` binding — landing page, Design Studio, 3-step checkout, confirmation page.
- **Worker** (`src/worker.js`) handles `/api/contact`, `/api/order`, and `/api/payfast/notify` (PayFast ITN webhook); everything else falls through to static asset serving.
- **Pricing** (`public/js/pricing.js`) is a single pure ESM module imported both by the browser and by the worker, so the price shown on the landing calculator, the Design Studio, and what's actually charged server-side can never drift apart.

## Local development

```bash
npm install
npm run dev
```

This runs `wrangler dev`. The landing page, pricing calculator, Design Studio (photo upload/crop/zoom), and full checkout step flow all work locally. `/api/contact` and `/api/order` will run but **email sending will fail/no-op locally** — Cloudflare Email Routing requires a real Cloudflare-managed domain (see below), which isn't available under local `wrangler dev`. This is expected; check the terminal for logged errors rather than an inbox.

## Deploying

```bash
npm run deploy
```

## Order lifecycle (read this before wondering "where do orders go?")

There is **no database** in this project (no D1/KV/R2) — that was a deliberate choice to ship fast. Instead:

1. When a customer places an order, the worker emails **"New order — pending payment"** to `EMAIL_TO`, with their photos attached. **This email is the order record.** There is currently no dashboard, order list, or reprint lookup beyond searching your inbox for the order reference (`CV-XXXXXXXX-XXXXXX`).
2. The customer is redirected to PayFast to pay.
3. PayFast independently POSTs a server-to-server confirmation (the "ITN") once payment completes. The worker validates it and sends a second email, **"Payment confirmed"**, referencing the same order reference — cross-check the two emails together to see a paid order's full details.
4. If the order-pending email ever fails to send, there is currently no retry or fallback — the order details would only exist in the customer's browser session until they close the tab.

If order volume grows, revisit this with Cloudflare D1 (orders table) + R2 (photo storage) — the `/api/order` handler is the natural place to add persistence.

## Payments — PayFast

Ships wired against **PayFast's public sandbox test credentials** (`merchant_id` 10000100, `merchant_key` 46f0cd694581a), set in `wrangler.toml` under `[vars]`. Nothing here charges real money until you switch to live credentials:

1. Get your live `merchant_id` and `merchant_key` from your PayFast merchant dashboard.
2. Update `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` in `wrangler.toml`, and set `PAYFAST_MODE = "live"`.
3. If your PayFast account has a passphrase configured, set it as a secret (never commit it):
   ```bash
   wrangler secret put PAYFAST_PASSPHRASE
   ```
4. Update `SITE_URL` in `wrangler.toml` to your real deployed domain — PayFast's `return_url`/`cancel_url`/`notify_url` are all built from this.

**Testing the ITN webhook**: PayFast's sandbox needs to reach `notify_url` over the public internet, so the ITN leg can't be exercised against `wrangler dev` on localhost — deploy first (`npm run deploy`), then run a full sandbox checkout using [PayFast's sandbox test buyer credentials](https://developers.payfast.co.za/docs#testing), and confirm the "Payment confirmed" email arrives.

## Email — Cloudflare Email Routing

Order and contact-form emails send via the Workers `send_email` binding (`cloudflare:email`). **This binding does not work on a bare `*.workers.dev` URL** — it requires:

1. A custom domain added to your Cloudflare account (DNS managed by Cloudflare).
2. Email Routing enabled for that domain (Cloudflare dashboard → Email → Email Routing).
3. Your destination address (currently `timmymorton1@gmail.com`, set via `EMAIL_TO` in `wrangler.toml`) added and verified as a destination address.
4. Update `FROM_EMAIL` in `wrangler.toml` to an address on your new domain (e.g. `orders@customvibe.co.za`) — the binding's `destination_address` in the `[[send_email]]` block should also match your real domain setup.

Until this is configured, contact/order form submissions will still succeed from the customer's point of view (the API returns success), but no email will actually be delivered — check `wrangler tail` logs for the underlying error.

## PUDO delivery

Pickup point selection is a manual text field at checkout (no live PUDO API integration yet) — customers type their preferred point's name and suburb. Revisit with a real PUDO/uAfrica API integration if wrong-pickup-point support requests become a problem.

## Known limitations

- **No order persistence** — see "Order lifecycle" above. The pending-order email is the source of truth.
- **No live PUDO point lookup** — self-reported by the customer, unvalidated.
- **`sessionStorage` cart size** — Design Studio photos are capped at 700px JPEG export to keep the cart within `sessionStorage`'s ~5–10MB per-origin limit; very large quantities with unique photos per magnet could still hit this ceiling (handled with a user-facing error, not a crash).
- **PayFast ITN source-IP validation is not implemented** — Workers has no native DNS API, and a DoH-based check was judged too fragile to be a hard gate. The MD5 signature check and PayFast's own "confirm" callback are what actually gate a payment as valid.
