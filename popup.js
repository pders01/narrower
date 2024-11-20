(() => {
  let elements = null;

  const initElements = () => {
    if (elements) return elements;
    elements = {
      range: document.getElementById("narrowerRange"),
      value: document.getElementById("narrowerValue"),
      enable: document.getElementById("enableNarrower"),
      reset: document.getElementById("resetButton"),
    };
    return elements;
  };

  const showError = (message) => {
    document.body.innerHTML = `<div class="error-message">${message}</div>`;
  };

  const init = async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab?.url) {
        showError("Unable to access current tab.");
        return;
      }

      const isRestrictedUrl =
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("edge://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("about:") ||
        tab.url.startsWith("data:");

      if (isRestrictedUrl) {
        showError("Narrower is not available on this page.");
        return;
      }

      const hostname = new URL(tab.url).hostname;

      const settings = await chrome.storage.sync.get({
        globalSkew: 0,
        disabledSites: [],
      });

      const els = initElements();
      if (!els) return;

      const isEnabled = !settings.disabledSites.includes(hostname);
      els.enable.checked = isEnabled;
      els.range.value = settings.globalSkew;
      els.value.textContent = `${settings.globalSkew}%`;
      els.range.disabled = !isEnabled;

      const updateTab = async (value) => {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: "updateSkew",
            value,
          });
        } catch (error) {
          console.error("Failed to update tab:", error);
        }
      };

      els.range.addEventListener("input", async (e) => {
        const value = parseInt(e.target.value);
        els.value.textContent = `${value}%`;
        await chrome.storage.sync.set({ globalSkew: value });
        updateTab(value);
      });

      els.enable.addEventListener("change", async (e) => {
        const disabled = !e.target.checked;
        els.range.disabled = disabled;

        const sites = settings.disabledSites;
        const index = sites.indexOf(hostname);

        if (disabled && index === -1) {
          sites.push(hostname);
        } else if (!disabled && index !== -1) {
          sites.splice(index, 1);
        }

        await chrome.storage.sync.set({ disabledSites: sites });
        updateTab(disabled ? 0 : parseInt(els.range.value));
      });

      els.reset.addEventListener("click", async () => {
        els.range.value = 0;
        els.value.textContent = "0%";
        await chrome.storage.sync.set({ globalSkew: 0 });
        updateTab(0);
      });
    } catch (error) {
      console.error("Initialization error:", error);
      showError("Failed to initialize. Please try again.");
    }
  };

  init();
})();
