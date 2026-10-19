importScripts("settings.js");

async function sendToTab(tabId, action, values = {}) {
  const tab = await chrome.tabs.get(tabId);
  Narrower.siteKey(tab.url); // Reject browser/extension pages before injection.
  const message = { type: "narrower:content", action, ...values };
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Also works on tabs opened before the extension was installed/reloaded.
    // The isolated-world guard in content.js makes repeated injection harmless.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["settings.js", "content.js"],
    });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

chrome.runtime.onMessage.addListener((request, _sender, respond) => {
  if (request.type !== "narrower:request") return;
  sendToTab(request.tabId, request.action, {
    width: request.width,
    enabled: request.enabled,
  }).then(respond, () => respond({
    ok: false,
    error: "Narrower can't access this page. Try a regular website, or check this extension's site access.",
  }));
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (!["increase-width", "decrease-width", "toggle-narrower"].includes(command)) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await sendToTab(tab.id, command);
  } catch {
    // Browser UI, web stores, and other protected pages cannot be modified.
  }
});
