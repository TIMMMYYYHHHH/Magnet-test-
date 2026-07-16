import { calculatePrice, formatCurrency } from "./pricing.js";

const WORKING_RES = 700; // px, internal canvas resolution for crop working & JPEG export
const ZOOM_MIN = 100;
const ZOOM_MAX = 300;

const qtySlider = document.getElementById("qtySlider");
const qtyValue = document.getElementById("qtyValue");
const applyAllWrap = document.getElementById("applyAllWrap");
const applyAllBtn = document.getElementById("applyAllBtn");
const slotsGrid = document.getElementById("slotsGrid");
const slotsError = document.getElementById("slotsError");
const fileInput = document.getElementById("fileInput");
const continueBtn = document.getElementById("continueBtn");

const summaryQty = document.getElementById("summaryQty");
const summaryTier = document.getElementById("summaryTier");
const summaryUnit = document.getElementById("summaryUnit");
const summaryTotal = document.getElementById("summaryTotal");
const summarySavingsRow = document.getElementById("summarySavingsRow");
const summarySavings = document.getElementById("summarySavings");

/** @type {Array<{bitmap: ImageBitmap|null, crop: {zoom:number, offsetX:number, offsetY:number}, el: HTMLElement, canvas: HTMLCanvasElement, dropzone: HTMLElement, viewport: HTMLElement, controls: HTMLElement, zoomRange: HTMLInputElement}>} */
let slots = [];
let pendingUploadIndex = null;

function clampOffsets(slot) {
  if (!slot.bitmap) return;
  const baseScale = Math.max(WORKING_RES / slot.bitmap.width, WORKING_RES / slot.bitmap.height);
  const scale = baseScale * (slot.crop.zoom / 100);
  const drawW = slot.bitmap.width * scale;
  const drawH = slot.bitmap.height * scale;
  const maxOffsetX = Math.max(0, (drawW - WORKING_RES) / 2);
  const maxOffsetY = Math.max(0, (drawH - WORKING_RES) / 2);
  slot.crop.offsetX = Math.min(maxOffsetX, Math.max(-maxOffsetX, slot.crop.offsetX));
  slot.crop.offsetY = Math.min(maxOffsetY, Math.max(-maxOffsetY, slot.crop.offsetY));
}

function drawSlot(slot) {
  if (!slot.bitmap) return;
  const ctx = slot.canvas.getContext("2d");
  slot.canvas.width = WORKING_RES;
  slot.canvas.height = WORKING_RES;
  clampOffsets(slot);
  const baseScale = Math.max(WORKING_RES / slot.bitmap.width, WORKING_RES / slot.bitmap.height);
  const scale = baseScale * (slot.crop.zoom / 100);
  const drawW = slot.bitmap.width * scale;
  const drawH = slot.bitmap.height * scale;
  const cx = WORKING_RES / 2 + slot.crop.offsetX;
  const cy = WORKING_RES / 2 + slot.crop.offsetY;
  ctx.clearRect(0, 0, WORKING_RES, WORKING_RES);
  ctx.drawImage(slot.bitmap, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
}

function buildSlot(index) {
  const el = document.createElement("div");
  el.className = "magnet-slot";

  const dropzone = document.createElement("div");
  dropzone.className = "dropzone";
  dropzone.tabIndex = 0;
  dropzone.innerHTML = `
    <div class="icon">📤</div>
    <div>Drag &amp; drop or click to upload</div>
    <div class="hint">JPG or PNG, min 750×750px</div>
  `;

  const viewport = document.createElement("div");
  viewport.className = "crop-viewport hidden";
  const canvas = document.createElement("canvas");
  viewport.appendChild(canvas);

  const controls = document.createElement("div");
  controls.className = "slot-controls hidden";
  const zoomIcon = document.createElement("span");
  zoomIcon.textContent = "🔍";
  zoomIcon.style.fontSize = "0.85rem";
  const zoomRange = document.createElement("input");
  zoomRange.type = "range";
  zoomRange.min = String(ZOOM_MIN);
  zoomRange.max = String(ZOOM_MAX);
  zoomRange.value = String(ZOOM_MIN);
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-ghost";
  removeBtn.textContent = "✕";
  removeBtn.title = "Remove photo";
  controls.append(zoomIcon, zoomRange, removeBtn);

  const caption = document.createElement("div");
  caption.className = "slot-caption";
  caption.style.cssText = "text-align:center;font-size:0.8rem;color:var(--color-ink-soft);margin-top:8px;";
  caption.textContent = `Magnet #${index + 1}`;

  el.append(dropzone, viewport, controls, caption);

  const slot = { bitmap: null, crop: { zoom: 100, offsetX: 0, offsetY: 0 }, el, canvas, dropzone, viewport, controls, zoomRange, caption };

  dropzone.addEventListener("click", () => {
    pendingUploadIndex = slots.indexOf(slot);
    fileInput.click();
  });
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") dropzone.click();
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadImageIntoSlot(slot, file);
  });

  let dragging = false;
  let dragStart = null;
  viewport.addEventListener("pointerdown", (e) => {
    dragging = true;
    viewport.setPointerCapture(e.pointerId);
    dragStart = { x: e.clientX, y: e.clientY, offsetX: slot.crop.offsetX, offsetY: slot.crop.offsetY };
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!dragging || !dragStart) return;
    const scaleFactor = WORKING_RES / viewport.clientWidth;
    slot.crop.offsetX = dragStart.offsetX + (e.clientX - dragStart.x) * scaleFactor;
    slot.crop.offsetY = dragStart.offsetY + (e.clientY - dragStart.y) * scaleFactor;
    drawSlot(slot);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((evt) =>
    viewport.addEventListener(evt, () => {
      dragging = false;
      dragStart = null;
    })
  );

  zoomRange.addEventListener("input", () => {
    slot.crop.zoom = Number(zoomRange.value);
    drawSlot(slot);
  });

  removeBtn.addEventListener("click", () => {
    slot.bitmap = null;
    slot.crop = { zoom: 100, offsetX: 0, offsetY: 0 };
    zoomRange.value = String(ZOOM_MIN);
    dropzone.classList.remove("hidden");
    viewport.classList.add("hidden");
    controls.classList.add("hidden");
    refreshApplyAllVisibility();
  });

  return slot;
}

async function loadImageIntoSlot(slot, file) {
  if (!file || !file.type.startsWith("image/")) return;
  const bitmap = await createImageBitmap(file);
  slot.bitmap = bitmap;
  slot.crop = { zoom: 100, offsetX: 0, offsetY: 0 };
  slot.zoomRange.value = String(ZOOM_MIN);
  slot.dropzone.classList.add("hidden");
  slot.viewport.classList.remove("hidden");
  slot.controls.classList.remove("hidden");
  drawSlot(slot);
  refreshApplyAllVisibility();
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (file && pendingUploadIndex !== null && slots[pendingUploadIndex]) {
    loadImageIntoSlot(slots[pendingUploadIndex], file);
  }
  fileInput.value = "";
  pendingUploadIndex = null;
});

function refreshApplyAllVisibility() {
  const hasAnyImage = slots.some((s) => s.bitmap);
  applyAllWrap.classList.toggle("hidden", !hasAnyImage || slots.length < 2);
}

applyAllBtn.addEventListener("click", () => {
  const source = slots.find((s) => s.bitmap);
  if (!source) return;
  slots.forEach((slot) => {
    if (slot === source) return;
    slot.bitmap = source.bitmap;
    slot.crop = { ...source.crop };
    slot.zoomRange.value = String(slot.crop.zoom);
    slot.dropzone.classList.add("hidden");
    slot.viewport.classList.remove("hidden");
    slot.controls.classList.remove("hidden");
    drawSlot(slot);
  });
});

function syncSlotCount(qty) {
  if (qty > slots.length) {
    for (let i = slots.length; i < qty; i++) {
      const slot = buildSlot(i);
      slots.push(slot);
      slotsGrid.appendChild(slot.el);
    }
  } else if (qty < slots.length) {
    const removed = slots.splice(qty);
    removed.forEach((s) => s.el.remove());
  }
  slots.forEach((s, i) => {
    s.caption.textContent = `Magnet #${i + 1}`;
  });
  refreshApplyAllVisibility();
}

function renderSummary() {
  const qty = Number(qtySlider.value);
  qtyValue.textContent = String(qty);
  const { unitPrice, total, tierLabel, savings, hasSavings } = calculatePrice(qty);
  summaryQty.textContent = String(qty);
  summaryTier.textContent = tierLabel;
  summaryUnit.textContent = formatCurrency(unitPrice);
  summaryTotal.textContent = formatCurrency(total);
  if (hasSavings) {
    summarySavingsRow.style.display = "flex";
    summarySavings.textContent = formatCurrency(savings);
  } else {
    summarySavingsRow.style.display = "none";
  }
}

qtySlider.addEventListener("input", () => {
  syncSlotCount(Number(qtySlider.value));
  renderSummary();
});

function exportSlot(slot) {
  drawSlot(slot);
  return slot.canvas.toDataURL("image/jpeg", 0.82);
}

continueBtn.addEventListener("click", () => {
  const missing = slots.some((s) => !s.bitmap);
  if (missing) {
    slotsError.style.display = "block";
    slotsError.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  slotsError.style.display = "none";

  const qty = Number(qtySlider.value);
  const pricing = calculatePrice(qty);
  const items = slots.map((slot, i) => ({
    id: i,
    dataUrl: exportSlot(slot),
    cropMeta: { ...slot.crop },
  }));

  const cart = {
    version: 1,
    quantity: qty,
    items,
    pricing: { unitPrice: pricing.unitPrice, total: pricing.total, tierLabel: pricing.tierLabel, savings: pricing.savings },
    createdAt: new Date().toISOString(),
  };

  try {
    sessionStorage.setItem("customvibe:cart", JSON.stringify(cart));
    window.location.href = "/checkout";
  } catch (err) {
    slotsError.textContent = "Your photos are too large to continue — try a smaller quantity or simpler photos, then try again.";
    slotsError.style.display = "block";
  }
});

// init with 1 slot
syncSlotCount(Number(qtySlider.value));
renderSummary();
