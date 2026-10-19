/* Shared by the service worker, popup, and isolated content script. */
(() => {
  const DEFAULTS = Object.freeze({ enabled: false, width: 80 });
  const MIN_WIDTH = 30;
  const STEP = 5;
  const MIN_PIXELS = 640;

  function normalize(value = {}) {
    const width = Number.isFinite(value?.width) ? value.width : DEFAULTS.width;
    return {
      enabled: value?.enabled === true,
      width: Math.max(MIN_WIDTH, Math.min(100, Math.round(width))),
    };
  }

  function siteKey(url) {
    const parsed = new URL(url);
    if (!["http:", "https:", "file:"].includes(parsed.protocol)) {
      throw new Error("Narrower isn't available on this page.");
    }
    return `narrower.site.${parsed.hostname || "local-files"}`;
  }

  async function load(url) {
    const key = siteKey(url);
    const values = await chrome.storage.sync.get([key, "globalSkew", "disabledSites"]);
    if (values[key]) return normalize(values[key]);

    // Read old settings without writing on every page load. The first change
    // creates a per-site setting and leaves other sites' legacy preferences alone.
    if (Number.isFinite(values.globalSkew) && values.globalSkew > 0) {
      return normalize({
        enabled: !(Array.isArray(values.disabledSites) && values.disabledSites.includes(new URL(url).hostname)),
        width: 100 - values.globalSkew,
      });
    }
    return { ...DEFAULTS };
  }

  async function save(url, value) {
    const settings = normalize(value);
    await chrome.storage.sync.set({ [siteKey(url)]: settings });
    return settings;
  }

  globalThis.Narrower = Object.freeze({
    DEFAULTS, MIN_WIDTH, STEP, MIN_PIXELS, normalize, siteKey, load, save,
  });
})();
