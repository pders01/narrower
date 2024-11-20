// Handle keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      console.error('No active tab found');
      return;
    }

    // Inject content script if not already present
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return window.__narrowerLoaded === true;
        }
      });
    } catch (error) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    }

    // Send the command to the content script
    chrome.tabs.sendMessage(tab.id, { action: command }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
      }
    });
  } catch (error) {
    console.error('Command handling error:', error);
  }
});

// Listen for content script ready message
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "contentScriptReady") {
    sendResponse({ success: true });
  }
});
