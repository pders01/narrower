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

  const updateSkew = (value) => {
    currentSkew = Math.max(0, Math.min(100, value));
    document.documentElement.className = currentSkew > 0 ? `skew-${currentSkew}` : "";
    chrome.storage.sync.set({ globalSkew: currentSkew });
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
        if (
          !settings.disabledSites.includes(hostname) &&
          settings.globalSkew > 0
        ) {
          const value = Math.round(settings.globalSkew / 10) * 10;
          updateSkew(value);
        }
      }
    );

    // Handle messages
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      try {
        if (request.action === "updateSkew") {
          const value = Math.round(request.value / 10) * 10;
          updateSkew(value);
          sendResponse({ success: true, value: currentSkew });
        } else if (request.action === "increase-width") {
          console.log('increase-width');
          if (currentSkew > 0) {
            updateSkew(currentSkew - 10);
            sendResponse({ success: true, value: currentSkew });
          }
        } else if (request.action === "decrease-width") {
          console.log('decrease-width');
          if (currentSkew < 100) {
            updateSkew(currentSkew + 10);
            sendResponse({ success: true, value: currentSkew });
          }
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
