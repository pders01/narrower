(() => {
  // Mark script as loaded
  window.__narrowerLoaded = true;

  const isRestrictedUrl =
    window.location.protocol === "chrome:" ||
    window.location.protocol === "edge:" ||
    window.location.protocol === "chrome-extension:" ||
    window.location.protocol === "about:" ||
    window.location.protocol === "data:";

  if (isRestrictedUrl) return;

  const style = document.createElement("style");
  style.id = "skew-styles";
  document.documentElement.appendChild(style);

  const styles = Array.from(
    { length: 11 },
    (_, i) =>
      `.skew-${i * 10} > * { max-width: ${
        100 - i * 10
      }% !important; margin-inline: auto !important; }`
  ).join("\n");

  style.textContent = styles;

  let currentSkew = 0;
  let lastSkewValue = 0;
  let isEnabled = true;

  const updateSkew = (value, updateStorage = true) => {
    currentSkew = Math.max(0, Math.min(100, value));
    document.documentElement.className = currentSkew > 0 ? `skew-${currentSkew}` : "";
    if (updateStorage) {
      chrome.storage.sync.set({ globalSkew: currentSkew });
    }
  };

  const toggleNarrower = async () => {
    const hostname = window.location.hostname;
    const { disabledSites } = await chrome.storage.sync.get({ disabledSites: [] });
    const sites = [...disabledSites];
    const index = sites.indexOf(hostname);

    if (isEnabled) {
      // Disable
      if (index === -1) {
        sites.push(hostname);
      }
      lastSkewValue = currentSkew;
      updateSkew(0, false);
    } else {
      // Enable
      if (index !== -1) {
        sites.splice(index, 1);
      }
      updateSkew(lastSkewValue || currentSkew);
    }

    isEnabled = !isEnabled;
    await chrome.storage.sync.set({ disabledSites: sites });
    return { success: true, enabled: isEnabled };
  };

  try {
    // Initialize from storage
    chrome.storage.sync.get(
      {
        globalSkew: 0,
        disabledSites: [],
      },
      (settings) => {
        const hostname = window.location.hostname;
        isEnabled = !settings.disabledSites.includes(hostname);
        if (isEnabled && settings.globalSkew > 0) {
          const value = Math.round(settings.globalSkew / 10) * 10;
          lastSkewValue = value;
          updateSkew(value);
        }
      }
    );

    // Handle messages
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      try {
        if (request.action === "updateSkew") {
          const value = Math.round(request.value / 10) * 10;
          lastSkewValue = value;
          updateSkew(value);
          sendResponse({ success: true, value: currentSkew });
        } else if (request.action === "increase-width") {
          if (isEnabled && currentSkew > 0) {
            updateSkew(currentSkew - 10);
            sendResponse({ success: true, value: currentSkew });
          }
        } else if (request.action === "decrease-width") {
          if (isEnabled && currentSkew < 100) {
            updateSkew(currentSkew + 10);
            sendResponse({ success: true, value: currentSkew });
          }
        } else if (request.action === "toggle-narrower") {
          toggleNarrower().then(sendResponse);
          return true;
        }
        return true; // Keep the message channel open for async response
      } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ success: false, error: error.message });
        return true;
      }
    });

    // Notify background script that content script is ready
    chrome.runtime.sendMessage({ action: "contentScriptReady" });
  } catch (error) {
    console.debug("Skew: Running in restricted context");
  }
})();
