(() => {
  const range = document.getElementById("narrowerRange");
  const value = document.getElementById("narrowerValue");
  const enable = document.getElementById("enableNarrower");
  const reset = document.getElementById("resetButton");
  const status = document.getElementById("status");
  let tabId;
  let connection;
  let sequence = 0;

  const messages = {
    off: "Off. This page is exactly as you found it.",
    active: "Centered. Nothing added to the page.",
    "already-fits": "Already fits. No need to change this layout.",
    "small-window": "Window is small enough. Original layout kept.",
    layout: "This layout resists narrowing. Left unchanged for safety.",
    fullscreen: "Paused while this page is in fullscreen.",
    loading: "Waiting for the page to finish loading…",
  };

  function showError(message) {
    status.textContent = message;
    status.dataset.error = "true";
  }

  function render(state) {
    enable.checked = state.enabled;
    range.disabled = !state.enabled;
    range.value = state.width;
    value.textContent = `${state.width}%`;
    status.textContent = messages[state.reason] || messages.off;
    delete status.dataset.error;
  }

  async function request(action, values = {}) {
    const result = await chrome.runtime.sendMessage({
      type: "narrower:request", tabId, action, ...values,
    });
    if (!result?.ok) throw new Error(result?.error || "Couldn't reach this page. Try reopening Narrower.");
    return result;
  }

  async function update(action, values) {
    const current = ++sequence;
    try {
      const result = await request(action, values);
      if (current === sequence) render(result);
    } catch (error) {
      if (current !== sequence) return;
      // Roll the controls back to saved state after a failed write.
      try { render(await request("get-state")); } catch { /* Keep the error visible. */ }
      showError(error.message);
    }
  }

  // Preview while dragging, persist only on commit. No sync-storage write storm,
  // and no unsaved timer that can be lost when the popup closes.
  range.addEventListener("input", () => {
    value.textContent = `${range.value}%`;
    update("preview-width", { width: Number(range.value) });
  });
  range.addEventListener("change", () => update("set-width", { width: Number(range.value) }));
  enable.addEventListener("change", () => update("set-enabled", { enabled: enable.checked }));
  reset.addEventListener("click", () => update("reset"));

  (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url) throw new Error("Narrower isn't available on this page.");
      const url = new URL(tab.url);
      if (!["http:", "https:", "file:"].includes(url.protocol)) {
        throw new Error("Narrower isn't available on browser pages. Open a website to try it.");
      }
      tabId = tab.id;
      document.getElementById("hostname").textContent = url.hostname || "Local files";
      render(await request("get-state"));
      // Disconnect on popup close cancels any uncommitted slider preview.
      connection = chrome.tabs.connect(tabId, { name: "narrower:popup" });
      connection.onDisconnect.addListener(() => {
        enable.disabled = range.disabled = reset.disabled = true;
        showError("This page changed. Reopen Narrower to reconnect.");
      });
      enable.disabled = false;
      reset.disabled = false;
    } catch (error) {
      showError(error.message);
    }
  })();
})();
