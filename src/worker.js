import { calculatePrice } from "../public/js/pricing.js";
import { generateOutboundSignature, generateItnSignature, confirmWithPayFast, getPayfastUrls } from "./payfast.js";
import { sendOrderPendingEmail, sendPaymentConfirmedEmail, sendContactEmail } from "./email.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (err) {
    return null;
  }
}

async function handleContact(request, env, ctx) {
  const body = await readJson(request);
  const name = body?.name?.trim();
  const email = body?.email?.trim();
  const message = body?.message?.trim();

  if (!name || !email || !message) {
    return json({ error: "Missing required fields" }, 400);
  }

  ctx.waitUntil(
    sendContactEmail(env, { name, email, message }).catch((err) => console.error("contact email failed", err))
  );

  return json({ ok: true });
}

async function handleOrder(request, env, ctx) {
  const body = await readJson(request);
  const customer = body?.customer;
  const pudo = body?.pudo;
  const cart = body?.cart;

  if (!customer?.fullName || !customer?.email || !customer?.phone) {
    return json({ error: "Missing customer details" }, 400);
  }
  if (!pudo?.pudoPoint || !pudo?.suburb || !pudo?.province) {
    return json({ error: "Missing delivery details" }, 400);
  }
  if (!cart?.quantity || !Array.isArray(cart.items) || cart.items.length !== cart.quantity) {
    return json({ error: "Invalid cart" }, 400);
  }

  // Never trust the client's price — recompute from quantity server-side.
  const pricing = calculatePrice(cart.quantity);
  const orderRef = `CV-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

  // This is the only point photos are ever seen server-side. Send the order
  // record email now, while we still have them in memory for this request.
  ctx.waitUntil(
    sendOrderPendingEmail(env, { orderRef, customer, pudo, cart, pricing }).catch((err) =>
      console.error("order-pending email failed", err)
    )
  );

  const { processUrl } = getPayfastUrls(env.PAYFAST_MODE);
  const siteUrl = env.SITE_URL.replace(/\/$/, "");
  const nameParts = customer.fullName.trim().split(/\s+/);
  const pickupContext = JSON.stringify({
    q: pricing.qty,
    tier: pricing.tierLabel,
    pt: pudo.pudoPoint,
  }).slice(0, 255);

  const fields = {
    merchant_id: env.PAYFAST_MERCHANT_ID,
    merchant_key: env.PAYFAST_MERCHANT_KEY,
    return_url: `${siteUrl}/confirmation?ref=${encodeURIComponent(orderRef)}`,
    cancel_url: `${siteUrl}/checkout?cancelled=1`,
    notify_url: `${siteUrl}/api/payfast/notify`,
    name_first: nameParts[0] || customer.fullName,
    name_last: nameParts.slice(1).join(" ") || "-",
    email_address: customer.email,
    m_payment_id: orderRef,
    amount: pricing.total.toFixed(2),
    item_name: `CustomVibe magnets x${pricing.qty}`,
    item_description: `${pricing.qty} custom photo fridge magnets (${pricing.tierLabel})`,
    custom_str1: orderRef,
    custom_str2: customer.email,
    custom_str3: pickupContext,
    custom_int1: pricing.qty,
  };

  const signature = generateOutboundSignature(fields, env.PAYFAST_PASSPHRASE);

  return json({ orderRef, processUrl, fields: { ...fields, signature } });
}

async function handleItn(request, env, ctx) {
  const rawBody = await request.text();
  const posted = Object.fromEntries(new URLSearchParams(rawBody).entries());
  const orderRef = posted.custom_str1;

  const expectedSignature = generateItnSignature(rawBody, env.PAYFAST_PASSPHRASE);
  if (expectedSignature !== posted.signature) {
    console.error("PayFast ITN: signature mismatch", { orderRef });
    return new Response("invalid signature", { status: 400 });
  }

  const { validateUrl } = getPayfastUrls(env.PAYFAST_MODE);
  const confirmed = await confirmWithPayFast(validateUrl, rawBody).catch((err) => {
    console.error("PayFast ITN: confirm callback failed", err);
    return false;
  });
  if (!confirmed) {
    console.error("PayFast ITN: not confirmed by PayFast", { orderRef });
    return new Response("not confirmed", { status: 400 });
  }

  const qty = Number(posted.custom_int1);
  const expected = calculatePrice(qty);
  const amountGross = Number(posted.amount_gross);
  if (!Number.isFinite(amountGross) || Math.abs(amountGross - expected.total) > 0.05) {
    console.error("PayFast ITN: amount mismatch", { orderRef, expected: expected.total, got: amountGross });
    return new Response("amount mismatch", { status: 400 });
  }

  if (posted.payment_status === "COMPLETE") {
    ctx.waitUntil(
      sendPaymentConfirmedEmail(env, {
        orderRef,
        customerEmail: posted.custom_str2,
        amountGross,
        qty,
      }).catch((err) => console.error("payment-confirmed email failed", err))
    );
  }

  // PayFast source-IP validation would normally happen here via a DNS lookup
  // against their published hostnames. Workers has no native DNS API, and a
  // DoH subrequest is the most environment-fragile part of this integration —
  // the signature check + the confirm callback above are the hard gates.

  return new Response("OK", { status: 200 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/contact") {
      return handleContact(request, env, ctx);
    }
    if (request.method === "POST" && url.pathname === "/api/order") {
      return handleOrder(request, env, ctx);
    }
    if (request.method === "POST" && url.pathname === "/api/payfast/notify") {
      return handleItn(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};
