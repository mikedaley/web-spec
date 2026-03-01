/*
 * message-panel.js - Custom themed message panel replacing window.alert/confirm
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

export class MessagePanel {
  /**
   * Show a message panel with action buttons.
   *
   * @param {Object} options
   * @param {string} options.message - The message to display
   * @param {Array<{label: string, value: *, primary?: boolean}>} options.buttons - Button definitions
   * @param {boolean} [options.dismissable=true] - Whether backdrop click / Escape dismisses
   * @returns {Promise<*>} Resolves with the clicked button's value, or null if dismissed
   */
  static show({ message, buttons, dismissable = true }) {
    return new Promise((resolve) => {
      let resolved = false;

      const backdrop = document.createElement("div");
      backdrop.className = "message-panel-backdrop";

      const panel = document.createElement("div");
      panel.className = "message-panel";

      const msg = document.createElement("div");
      msg.className = "message-panel-text";
      msg.textContent = message;
      panel.appendChild(msg);

      const btnRow = document.createElement("div");
      btnRow.className = "message-panel-buttons";

      const finish = (value) => {
        if (resolved) return;
        resolved = true;
        backdrop.classList.add("message-panel-backdrop-out");
        panel.classList.add("message-panel-out");
        const onEnd = () => {
          backdrop.remove();
          document.removeEventListener("keydown", onKey);
          resolve(value);
        };
        panel.addEventListener("animationend", onEnd, { once: true });
        // Fallback if animation doesn't fire
        setTimeout(onEnd, 200);
      };

      buttons.forEach((btn) => {
        const el = document.createElement("button");
        el.className = "message-panel-btn" + (btn.primary ? " message-panel-btn-primary" : "");
        el.textContent = btn.label;
        el.addEventListener("click", () => finish(btn.value));
        btnRow.appendChild(el);
      });

      panel.appendChild(btnRow);
      backdrop.appendChild(panel);

      if (dismissable) {
        backdrop.addEventListener("click", (e) => {
          if (e.target === backdrop) finish(null);
        });
      }

      const onKey = (e) => {
        if (e.key === "Escape" && dismissable) {
          finish(null);
        } else if (e.key === "Enter") {
          const primary = buttons.find((b) => b.primary);
          if (primary) finish(primary.value);
        }
      };
      document.addEventListener("keydown", onKey);

      document.body.appendChild(backdrop);

      // Force reflow then trigger enter animation
      void backdrop.offsetHeight;
      backdrop.classList.add("message-panel-backdrop-in");
      panel.classList.add("message-panel-in");

      // Focus primary button
      const primaryBtn = btnRow.querySelector(".message-panel-btn-primary");
      if (primaryBtn) primaryBtn.focus();
    });
  }
}
