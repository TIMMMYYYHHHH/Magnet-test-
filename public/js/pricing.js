// Single source of truth for CustomVibe pricing. Pure module — no DOM, no
// storage — so the exact same file runs in the browser and inside the
// Cloudflare Worker (imported by src/worker.js at build time).

export const MIN_QTY = 1;
export const SLIDER_MAX_QTY = 24; // slider caps here; pricing still applies beyond it

const TIERS = [
  { min: 1, max: 1, label: "Single Shot Trial", pricePerUnit: 50 },
  { min: 2, max: 5, label: "Tribe Starter", pricePerUnit: 50 },
  { min: 6, max: 6, label: "Tribe Half-Dozen Discount", flatTotal: 250 },
  { min: 7, max: 9, label: "Tribe Starter", pricePerUnit: 50 },
  { min: 10, max: Infinity, label: "Ultimate Pack Bulk Rate", pricePerUnit: 40 },
];

function findTier(qty) {
  return TIERS.find((t) => qty >= t.min && qty <= t.max) || TIERS[TIERS.length - 1];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {number} qtyInput
 * @returns {{ qty: number, total: number, unitPrice: number, tierLabel: string, savings: number, hasSavings: boolean }}
 */
export function calculatePrice(qtyInput) {
  const qty = Math.max(MIN_QTY, Math.floor(Number(qtyInput) || MIN_QTY));
  const tier = findTier(qty);
  const total = tier.flatTotal !== undefined ? tier.flatTotal : round2(tier.pricePerUnit * qty);
  const unitPrice = round2(total / qty);
  const fullPrice = 50 * qty;
  const savings = Math.max(0, round2(fullPrice - total));

  return {
    qty,
    total,
    unitPrice,
    tierLabel: tier.label,
    savings,
    hasSavings: savings > 0,
  };
}

/** @param {number} amount */
export function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return Number.isInteger(n) ? `R${n}` : `R${n.toFixed(2)}`;
}
