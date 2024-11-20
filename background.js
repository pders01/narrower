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
