// PayFast integration helpers: signature generation (outbound payment request
// and inbound ITN validation) and the "confirm" callback to PayFast's
// validate endpoint. See README.md for sandbox vs live credential setup.

import md5 from "blueimp-md5";

export const PAYFAST_SANDBOX_PROCESS_URL = "https://sandbox.payfast.co.za/eng/process";
export const PAYFAST_SANDBOX_VALIDATE_URL = "https://sandbox.payfast.co.za/eng/query/validate";
export const PAYFAST_LIVE_PROCESS_URL = "https://www.payfast.co.za/eng/process";
export const PAYFAST_LIVE_VALIDATE_URL = "https://www.payfast.co.za/eng/query/validate";

export function getPayfastUrls(mode) {
  return mode === "live"
    ? { processUrl: PAYFAST_LIVE_PROCESS_URL, validateUrl: PAYFAST_LIVE_VALIDATE_URL }
    : { processUrl: PAYFAST_SANDBOX_PROCESS_URL, validateUrl: PAYFAST_SANDBOX_VALIDATE_URL };
}

// PayFast's documented field order for the outbound payment request/signature.
// This is NOT alphabetical — using the wrong order is the most common PayFast
// integration bug. Do not "clean up" this ordering.
const OUTBOUND_FIELD_ORDER = [
  "merchant_id",
  "merchant_key",
  "return_url",
  "cancel_url",
  "notify_url",
  "name_first",
  "name_last",
  "email_address",
  "cell_number",
  "m_payment_id",
  "amount",
  "item_name",
  "item_description",
  "custom_int1",
  "custom_int2",
  "custom_int3",
  "custom_int4",
  "custom_int5",
  "custom_str1",
  "custom_str2",
  "custom_str3",
  "custom_str4",
  "custom_str5",
  "email_confirmation",
  "confirmation_address",
  "payment_method",
];

// PayFast's PHP sample code builds the signature string using PHP's urlencode()
// (spaces as "+"), so we approximate that with encodeURIComponent + a space fix.
// Note: this can diverge from PHP's urlencode for a handful of punctuation
// characters (e.g. ! * ' ( )) that rarely appear in the field values we send.
function phpUrlEncode(value) {
  return encodeURIComponent(String(value)).replace(/%20/g, "+");
}

/**
 * Builds the MD5 signature for an outbound PayFast payment request.
 * @param {Record<string, string|number>} fields
 * @param {string|undefined} passphrase
 */
export function generateOutboundSignature(fields, passphrase) {
  let paramString = OUTBOUND_FIELD_ORDER.filter(
    (key) => fields[key] !== undefined && fields[key] !== null && fields[key] !== ""
  )
    .map((key) => `${key}=${phpUrlEncode(fields[key])}`)
    .join("&");

  if (passphrase) {
    paramString += `&passphrase=${phpUrlEncode(passphrase)}`;
  }

  return md5(paramString);
}

function parseOrderedPairs(rawBody) {
  return rawBody
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf("=");
      const rawKey = idx === -1 ? pair : pair.slice(0, idx);
      const rawValue = idx === -1 ? "" : pair.slice(idx + 1);
      return [
        decodeURIComponent(rawKey.replace(/\+/g, " ")),
        decodeURIComponent(rawValue.replace(/\+/g, " ")),
      ];
    });
}

/**
 * Reconstructs and hashes the ITN signature per PayFast's rules: iterate the
 * POSTed fields IN THE ORDER THEY ARRIVED (a different rule from the fixed
 * outbound order above), excluding `signature` itself.
 * @param {string} rawBody
 * @param {string|undefined} passphrase
 */
export function generateItnSignature(rawBody, passphrase) {
  const pairs = parseOrderedPairs(rawBody).filter(([key]) => key !== "signature");
  let paramString = pairs.map(([key, value]) => `${key}=${phpUrlEncode(value)}`).join("&");

  if (passphrase) {
    paramString += `&passphrase=${phpUrlEncode(passphrase)}`;
  }

  return md5(paramString);
}

/**
 * PayFast's documented ITN validation step 2: POST the raw ITN body back to
 * PayFast and expect the literal response text "VALID".
 * @param {string} validateUrl
 * @param {string} rawBody
 */
export async function confirmWithPayFast(validateUrl, rawBody) {
  const res = await fetch(validateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: rawBody,
  });
  const text = (await res.text()).trim();
  return text === "VALID";
}
