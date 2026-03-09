/*
 * toast.js - Lightweight toast notification system
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

const TOAST_DURATION = 3000;
const TOAST_GAP = 8;

let container = null;

function ensureContainer() {
  if (container && document.body.contains(container)) return;
  container = document.createElement("div");
  container.className = "toast-container";
  document.body.appendChild(container);
}

export function showToast(message, { duration = TOAST_DURATION } = {}) {
  ensureContainer();

  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  container.appendChild(el);

  // Trigger enter animation on next frame
  requestAnimationFrame(() => {
    el.classList.add("toast-in");
  });

  const dismiss = () => {
    el.classList.remove("toast-in");
    el.classList.add("toast-out");
    const onEnd = () => el.remove();
    el.addEventListener("animationend", onEnd, { once: true });
    setTimeout(onEnd, 200);
  };

  setTimeout(dismiss, duration);
  return dismiss;
}
