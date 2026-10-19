(() => {
  if (globalThis.__narrowerContentV2) return;
  if (!["http:", "https:", "file:"].includes(location.protocol)) return;
  globalThis.__narrowerContentV2 = true;

  const { DEFAULTS, MIN_PIXELS, STEP, normalize, siteKey, load, save } = Narrower;
  const url = location.href;
  const key = siteKey(url);
  const style = document.createElement("style");
  // Never wrap content, replace classes, or change the site's inline styles.
  style.dataset.narrower = "";
  let settings = { ...DEFAULTS };
  let committed = settings;
  let reason = "off";
  let frame = 0;
  let body = null;
  let checkFrame = 0;
  let overflowLimits = null;
  let queue = Promise.resolve();

  const state = () => ({ ...settings, reason, pixels: document.body?.getBoundingClientRect().width ?? 0 });

  function apply() {
    style.remove();
    reason = "off";
    overflowLimits = null;
    observeBody();
    const currentBody = document.body;
    if (!settings.enabled) return;
    if (!currentBody) { reason = "loading"; return; }
    if (document.fullscreenElement) { reason = "fullscreen"; return; }

    const viewport = document.documentElement.clientWidth;
    const originalWidth = currentBody.getBoundingClientRect().width;
    const target = Math.max(MIN_PIXELS, viewport * settings.width / 100);
    if (settings.width === 100 || originalWidth <= target + 1) {
      reason = viewport <= MIN_PIXELS ? "small-window" : "already-fits";
      return;
    }

    const computed = getComputedStyle(currentBody);
    const root = getComputedStyle(document.documentElement);
    if (["absolute", "fixed"].includes(computed.position) ||
        computed.display === "contents" ||
        ["flex", "inline-flex", "grid", "inline-grid"].includes(root.display) ||
        computed.writingMode !== "horizontal-tb" ||
        computed.transform !== "none") {
      reason = "layout";
      return;
    }

    const inset = ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"]
      .reduce((sum, name) => sum + (parseFloat(computed[name]) || 0), 0);
    const maxWidth = Math.max(0, target - (computed.boxSizing === "border-box" ? 0 : inset));
    const originalOverflow = Math.max(0, currentBody.scrollWidth - currentBody.clientWidth);
    const originalPageWidth = document.documentElement.scrollWidth;

    // Screen-only: printing uses the unmodified page. Fixed/sticky positioning,
    // viewport units, fonts, backgrounds, and all descendants remain untouched.
    style.textContent = `@media screen {
      html > body {
        max-width: ${maxWidth}px !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
    }`;
    (document.head || document.documentElement).appendChild(style);

    // Refuse an adjustment that creates horizontal overflow, or cannot shrink
    // the body (e.g. a site's own min-width or stronger inline declarations).
    const overflow = Math.max(0, currentBody.scrollWidth - currentBody.clientWidth);
    const box = currentBody.getBoundingClientRect();
    if (document.documentElement.scrollWidth > Math.max(viewport, originalPageWidth) + 2 ||
        overflow > originalOverflow + 2 || box.width > target + 2 ||
        Math.abs((box.left + box.right) / 2 + window.scrollX - viewport / 2) > 2) {
      style.remove();
      reason = "layout";
      return;
    }
    overflowLimits = { pageWidth: Math.max(viewport, originalPageWidth), bodyOverflow: originalOverflow };
    reason = "active";
  }

  function scheduleCheck() {
    if (checkFrame) return;
    checkFrame = requestAnimationFrame(() => {
      checkFrame = 0;
      if (reason !== "active" || !overflowLimits || !document.body) return;
      if (document.documentElement.scrollWidth > overflowLimits.pageWidth + 2 ||
          document.body.scrollWidth - document.body.clientWidth > overflowLimits.bodyOverflow + 2) {
        style.remove();
        reason = "layout";
      }
    });
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; apply(); });
  }

  // Reattach to a replaced SPA body, but do not scan or restyle its descendants.
  const attributes = new MutationObserver(schedule);
  const sizes = new ResizeObserver(scheduleCheck);
  function observeBody() {
    if (!settings.enabled) {
      attributes.disconnect();
      sizes.disconnect();
      lifecycle.disconnect();
      body = null;
      return;
    }
    lifecycle.observe(document, { childList: true, subtree: true });
    if (body && body === document.body) return;
    body = document.body;
    attributes.disconnect();
    sizes.disconnect();
    if (document.documentElement) {
      attributes.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    }
    if (body) {
      attributes.observe(body, { attributes: true, attributeFilter: ["class", "style"] });
      sizes.observe(body);
    }
  }
  const lifecycle = new MutationObserver(() => {
    if (body !== document.body) { observeBody(); schedule(); }
    if (reason === "active") {
      if (!style.isConnected) schedule();
      else scheduleCheck();
    }
  });
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("load", schedule, { once: true });
  window.addEventListener("pageshow", schedule);
  document.addEventListener("fullscreenchange", schedule);

  const ready = load(url).then((value) => { committed = settings = value; schedule(); });
  // A storage failure is surfaced to the popup, not as an unhandled rejection.
  ready.catch(() => {});
  // Storage is the source of truth for other tabs on the same hostname.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !(key in changes || "globalSkew" in changes || "disabledSites" in changes)) return;
    queue = queue.catch(() => {}).then(async () => {
      await ready;
      committed = settings = await load(url);
      schedule();
    }).catch(() => {});
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "narrower:popup") return;
    port.onDisconnect.addListener(() => {
      queue = queue.catch(() => {}).then(async () => {
        await ready;
        settings = committed;
        schedule();
      }).catch(() => {});
    });
  });

  chrome.runtime.onMessage.addListener((request, _sender, respond) => {
    if (request.type !== "narrower:content") return;
    queue = queue.catch(() => {}).then(async () => {
      await ready;
      let next = settings;
      switch (request.action) {
        case "get-state": break;
        case "preview-width":
          settings = normalize({ ...settings, width: request.width });
          apply();
          return state();
        case "set-width": next = { ...settings, width: request.width }; break;
        case "set-enabled": next = { ...settings, enabled: request.enabled }; break;
        case "toggle-narrower": next = { ...settings, enabled: !settings.enabled }; break;
        case "decrease-width":
          next = { enabled: true, width: (settings.enabled ? settings.width : 100) - STEP };
          break;
        case "increase-width":
          if (settings.enabled) next = { ...settings, width: settings.width + STEP };
          break;
        case "reset": next = { ...DEFAULTS }; break;
        default: throw new Error("Unknown Narrower action.");
      }
      if (next !== settings) {
        // Do not report success before persistence succeeds.
        try {
          committed = settings = await save(url, next);
        } catch (error) {
          settings = committed;
          apply();
          throw error;
        }
      }
      apply();
      return state();
    });
    queue.then(
      (value) => respond({ ok: true, ...value }),
      () => respond({ ok: false, error: "Couldn't save this setting. Please try again." }),
    );
    return true;
  });
})();
