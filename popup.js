// Initialize immediately without waiting for DOMContentLoaded
(() => {
  // Cache DOM elements
  let elements = null;

  const initElements = () => {
    if (elements) return elements;
    elements = {
      range: document.getElementById("skewRange"),
      value: document.getElementById("skewValue"),
      enable: document.getElementById("enableSkew"),
      reset: document.getElementById("resetButton"),
    };
    return elements;
  };

  const showError = (message) => {
    document.body.innerHTML = `<div class="error-message">${message}</div>`;
  };

  const init = async () => {
    try {
      // Get current tab immediately
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab?.url) {
        showError("Unable to access current tab.");
        return;
      }

      // Check if URL is accessible
      const isRestrictedUrl =
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("edge://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("about:") ||
        tab.url.startsWith("data:");

      if (isRestrictedUrl) {
        showError("Skew is not available on this page.");
        return;
      }

      const hostname = new URL(tab.url).hostname;

      // Load saved settings
      const settings = await chrome.storage.sync.get({
        globalSkew: 0,
        disabledSites: [],
      });

      // Initialize UI state
      const els = initElements();
      els.range.value = settings.globalSkew;
      els.value.textContent = `${settings.globalSkew}%`;
      els.enable.checked = !settings.disabledSites.includes(hostname);

      // Batch storage updates
      const storageQueue = new Map();
      const processStorageQueue = () => {
        if (storageQueue.size > 0) {
          const updates = Object.fromEntries(storageQueue);
          chrome.storage.sync.set(updates);
          storageQueue.clear();
        }
      };

      // Update width with fallback
      const updateWidth = async (value) => {
        try {
          // Skip if URL is not accessible
          if (!tab.url || isRestrictedUrl) return;

          // Try messaging first
          await chrome.tabs.sendMessage(tab.id, {
            action: "updateSkew",
            value: parseInt(value),
          });
        } catch (error) {
          // Skip injection if URL is not accessible
          if (!tab.url || isRestrictedUrl) return;

          // Fallback to direct script injection
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: (value) => {
                let style = document.getElementById("skew-styles");
                if (!style) {
                  style = document.createElement("style");
                  style.id = "skew-styles";
                  document.documentElement.appendChild(style);
                }
                if (value > 0) {
                  const roundedValue = Math.round(value / 10) * 10;
                  document.documentElement.className = `skew-${roundedValue}`;
                  style.textContent = `.skew-${roundedValue} > * { max-width: ${
                    100 - roundedValue
                  }% !important; margin-inline: auto !important; }`;
                } else {
                  document.documentElement.className = "";
                  style.textContent = "";
                }
              },
              args: [parseInt(value)],
            });
          } catch (injectError) {
            if (!isRestrictedUrl) {
              console.error("Failed to update page:", injectError);
            }
          }
        }
      };

      // Event Listeners
      els.range.addEventListener(
        "input",
        () => {
          const value = els.range.value;
          els.value.textContent = `${value}%`;

          if (els.enable.checked) {
            updateWidth(value);
            storageQueue.set("globalSkew", parseInt(value));
            requestAnimationFrame(processStorageQueue);
          }
        },
        { passive: true }
      );

      els.enable.addEventListener(
        "change",
        () => {
          const disabledSites = settings.disabledSites;

          if (els.enable.checked) {
            const index = disabledSites.indexOf(hostname);
            if (index > -1) {
              disabledSites.splice(index, 1);
            }
            updateWidth(els.range.value);
          } else {
            if (!disabledSites.includes(hostname)) {
              disabledSites.push(hostname);
            }
            updateWidth(0);
          }

          storageQueue.set("disabledSites", disabledSites);
          requestAnimationFrame(processStorageQueue);
        },
        { passive: true }
      );

      els.reset.addEventListener(
        "click",
        () => {
          els.range.value = 0;
          els.value.textContent = "0%";
          if (els.enable.checked) {
            updateWidth(0);
          }
          storageQueue.set("globalSkew", 0);
          requestAnimationFrame(processStorageQueue);
        },
        { passive: true }
      );

      // Apply initial width if enabled
      if (els.enable.checked && settings.globalSkew > 0) {
        updateWidth(settings.globalSkew);
      }
    } catch (error) {
      console.error("Failed to initialize popup:", error);
      showError("Unable to initialize Skew. Please try again.");
    }
  };

  // Start initialization
  init();
})();
