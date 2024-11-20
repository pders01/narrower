// Inject styles immediately using document.documentElement
(() => {
  // Check if we're in a restricted URL
  const isRestrictedUrl =
    window.location.protocol === "chrome:" ||
    window.location.protocol === "edge:" ||
    window.location.protocol === "chrome-extension:" ||
    window.location.protocol === "about:" ||
    window.location.protocol === "data:";

  // Don't inject anything in restricted URLs
  if (isRestrictedUrl) return;

  // Create and inject style tag immediately
  const style = document.createElement("style");
  style.id = "skew-styles";
  document.documentElement.appendChild(style);

  // Pre-calculate all possible styles
  const styles = Array.from(
    { length: 11 },
    (_, i) =>
      `.skew-${i * 10} > * { max-width: ${
        100 - i * 10
      }% !important; margin-inline: auto !important; }`
  ).join("\n"); // Fixed escaped newline

  // Force immediate style application
  style.textContent = styles;

  // Apply stored settings as early as possible
  try {
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
          document.documentElement.className = `skew-${value}`;
        }
      }
    );

    // Listen for updates
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "updateSkew") {
        const value = Math.round(request.value / 10) * 10;
        document.documentElement.className = value > 0 ? `skew-${value}` : "";
        sendResponse({ success: true });
        return true;
      }
    });

    // Notify that content script is ready
    chrome.runtime.sendMessage({ action: "contentScriptReady" });
  } catch (error) {
    // Ignore chrome API errors in restricted contexts
    console.debug("Skew: Running in restricted context");
  }
})();
