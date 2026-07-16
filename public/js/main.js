import { calculatePrice, formatCurrency } from "./pricing.js";

// ---- Scroll reveal (below-the-fold sections only; hero is visible immediately) ----
if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));
} else {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in-view"));
}

// ---- Mobile nav toggle -------------------------------------------------
const navToggle = document.getElementById("navToggle");
const navMobile = document.getElementById("navMobile");

if (navToggle && navMobile) {
  navToggle.addEventListener("click", () => {
    const isOpen = navMobile.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
  navMobile.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      navMobile.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    })
  );
}

// ---- Pricing calculator -------------------------------------------------
const calcSlider = document.getElementById("calcSlider");
const calcQtyValue = document.getElementById("calcQtyValue");
const calcUnitPrice = document.getElementById("calcUnitPrice");
const calcTotal = document.getElementById("calcTotal");
const calcSavings = document.getElementById("calcSavings");
const calcTierBadge = document.getElementById("calcTierBadge");

function renderCalculator() {
  if (!calcSlider) return;
  const { qty, unitPrice, total, tierLabel, savings, hasSavings } = calculatePrice(calcSlider.value);
  calcQtyValue.textContent = String(qty);
  calcUnitPrice.textContent = formatCurrency(unitPrice);
  calcTotal.textContent = formatCurrency(total);
  calcTierBadge.textContent = tierLabel;
  calcSavings.innerHTML = hasSavings
    ? `<span class="badge badge-success">You save ${formatCurrency(savings)}</span>`
    : "";
}

if (calcSlider) {
  calcSlider.addEventListener("input", renderCalculator);
  renderCalculator();
}

// ---- FAQ accordion --------------------------------------------------------
document.querySelectorAll(".accordion-item").forEach((item) => {
  const trigger = item.querySelector(".accordion-trigger");
  const panel = item.querySelector(".accordion-panel");
  trigger.addEventListener("click", () => {
    const isOpen = item.classList.contains("open");
    item.classList.toggle("open", !isOpen);
    trigger.setAttribute("aria-expanded", String(!isOpen));
    panel.style.maxHeight = !isOpen ? `${panel.scrollHeight}px` : "0px";
  });
});

// ---- Contact form -----------------------------------------------------
const contactForm = document.getElementById("contactForm");
const contactStatus = document.getElementById("contactStatus");

if (contactForm) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    let valid = true;
    contactForm.querySelectorAll(".form-field").forEach((field) => {
      const input = field.querySelector("input, textarea");
      if (input && !input.checkValidity()) {
        field.classList.add("invalid");
        valid = false;
      } else if (input) {
        field.classList.remove("invalid");
      }
    });
    if (!valid) return;

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    contactStatus.textContent = "Sending...";
    contactStatus.className = "form-status";

    const payload = {
      name: contactForm.name.value.trim(),
      email: contactForm.email.value.trim(),
      message: contactForm.message.value.trim(),
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Request failed");
      contactStatus.textContent = "Thanks — we'll be in touch soon!";
      contactStatus.className = "form-status success";
      contactForm.reset();
    } catch (err) {
      contactStatus.textContent = "Something went wrong. Please try WhatsApp instead.";
      contactStatus.className = "form-status error";
    } finally {
      submitBtn.disabled = false;
    }
  });
}
