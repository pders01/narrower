// Handle keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);
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
      console.log('Content script not loaded, injecting...');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    }

    console.log('Sending command to tab:', tab.id, command);
    // Send the command to the content script
    chrome.tabs.sendMessage(tab.id, { action: command }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('Response from content script:', response);
      }
    });
  } catch (error) {
    console.error('Command handling error:', error);
  }
});

// Listen for content script ready message
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "contentScriptReady") {
    console.log("Content script ready in tab:", sender.tab.id);
    sendResponse({ success: true });
  }
});
