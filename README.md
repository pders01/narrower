# Narrower Chrome Extension

A Chrome extension that dynamically adjusts webpage content width for users with ultra-wide monitors.

## Features

- Dynamic width adjustment using a slider (0-100%)
- Site-specific enable/disable functionality
- Persistent settings across browser sessions
- Light/dark mode support

## Installation

1. Clone this repository or download the source code
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory

## Usage

1. Click the extension icon in your browser toolbar to open the popup
2. Use the slider to adjust the content width
3. Toggle the extension on/off for specific sites using the switch

## Development

The extension is built using vanilla JavaScript and follows Chrome's Manifest V3 specifications. It uses Chrome's Storage API for persistent settings and injects CSS for width adjustments.

## License

MIT License
