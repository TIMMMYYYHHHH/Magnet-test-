import { calculatePrice, formatCurrency } from "./pricing.js";

const CART_KEY = "customvibe:cart";

const emptyState = document.getElementById("emptyState");
const checkoutFlow = document.getElementById("checkoutFlow");
const stepIndicator = document.getElementById("stepIndicator");
const panels = document.querySelectorAll("[data-step-panel]");

let cart = null;
try {
  const raw = sessionStorage.getItem(CART_KEY);
  cart = raw ? JSON.parse(raw) : null;
} catch (err) {
  cart = null;
}

if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
  emptyState.classList.remove("hidden");
  checkoutFlow.classList.add("hidden");
  stepIndicator.classList.add("hidden");
} else {
  initCheckout(cart);
}

function initCheckout(cart) {
  const pricing = calculatePrice(cart.quantity);

  // ---- Step 1: basket review ----
  const basketList = document.getElementById("basketList");
  cart.items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "magnet-preview pinned";
    const img = document.createElement("img");
    img.src = item.dataUrl;
    img.alt = "Magnet preview";
    div.appendChild(img);
    basketList.appendChild(div);
  });

  document.getElementById("rQty").textContent = String(pricing.qty);
  document.getElementById("rTier").textContent = pricing.tierLabel;
  document.getElementById("rTotal").textContent = formatCurrency(pricing.total);
  if (pricing.hasSavings) {
    document.getElementById("rSavingsRow").style.display = "flex";
    document.getElementById("rSavings").textContent = formatCurrency(pricing.savings);
  }

  document.getElementById("pQty").textContent = String(pricing.qty);
  document.getElementById("pTotal").textContent = formatCurrency(pricing.total);

  // ---- Step navigation ----
  let currentStep = 1;

  function goToStep(n) {
    currentStep = n;
    panels.forEach((p) => p.classList.toggle("hidden", Number(p.dataset.stepPanel) !== n));
    stepIndicator.querySelectorAll("li").forEach((li) => {
      const s = Number(li.dataset.step);
      li.classList.toggle("active", s === n);
      li.classList.toggle("done", s < n);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.getElementById("toStep2").addEventListener("click", () => goToStep(2));
  document.getElementById("toStep1").addEventListener("click", () => goToStep(1));
  document.getElementById("toStep2b").addEventListener("click", () => goToStep(2));

  // ---- Step 2: delivery form ----
  const deliveryForm = document.getElementById("deliveryForm");
  let delivery = null;

  deliveryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    let valid = true;
    deliveryForm.querySelectorAll(".form-field").forEach((field) => {
      const input = field.querySelector("input, select, textarea");
      if (input && input.hasAttribute("required") && !input.checkValidity()) {
        field.classList.add("invalid");
        valid = false;
      } else if (input) {
        field.classList.remove("invalid");
      }
    });
    if (!valid) return;

    delivery = {
      fullName: deliveryForm.fullName.value.trim(),
      phone: deliveryForm.phone.value.trim(),
      email: deliveryForm.email.value.trim(),
      pudoPoint: deliveryForm.pudoPoint.value.trim(),
      suburb: deliveryForm.suburb.value.trim(),
      province: deliveryForm.province.value,
      notes: deliveryForm.notes.value.trim(),
    };

    document.getElementById("pDelivery").textContent = `${delivery.pudoPoint}, ${delivery.suburb}`;
    goToStep(3);
  });

  // ---- Step 3: payment ----
  const placeOrderBtn = document.getElementById("placeOrderBtn");
  const orderStatus = document.getElementById("orderStatus");
  const termsCheckbox = document.getElementById("fTerms");

  const params = new URLSearchParams(window.location.search);
  if (params.get("cancelled") === "1") {
    goToStep(3);
    orderStatus.textContent = "Your payment was cancelled — your order details are still here whenever you're ready.";
    orderStatus.className = "form-status error";
  }

  placeOrderBtn.addEventListener("click", async () => {
    if (!delivery) {
      goToStep(2);
      return;
    }
    if (!termsCheckbox.checked) {
      orderStatus.textContent = "Please confirm the checkbox above before placing your order.";
      orderStatus.className = "form-status error";
      return;
    }

    placeOrderBtn.disabled = true;
    orderStatus.textContent = "Placing your order...";
    orderStatus.className = "form-status";

    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { fullName: delivery.fullName, phone: delivery.phone, email: delivery.email },
          pudo: { pudoPoint: delivery.pudoPoint, suburb: delivery.suburb, province: delivery.province, notes: delivery.notes },
          cart: { quantity: cart.quantity, items: cart.items },
        }),
      });

      if (!res.ok) throw new Error("Order request failed");
      const { processUrl, fields } = await res.json();

      const form = document.createElement("form");
      form.method = "POST";
      form.action = processUrl;
      Object.entries(fields).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      orderStatus.textContent = "Something went wrong placing your order. Please try again or reach us on WhatsApp.";
      orderStatus.className = "form-status error";
      placeOrderBtn.disabled = false;
    }
  });
}
