# Narrower

A little room on either side. A Chrome extension for centering wide pages without turning them into reader mode.

**The page stays the page:** its typography, colors, navigation, sticky headers, fixed controls, and interactions. No toolbar, overlay, wrapper, zoom, or replacement stylesheet.

## Use

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this directory. No build required.
3. Open a website, click Narrower, and switch it on for that site.
4. Drag **Page width** to taste. Changes preview immediately and save when you release the slider.

New installations leave every site unchanged until you opt in. Width and enabled state are remembered separately per hostname, across tabs and browser sessions. Subdomains have separate settings; paths, ports, and HTTP/HTTPS share a setting. Other sites are not affected. Local files share a setting and require Chrome's **Allow access to file URLs** option.

Switch off to restore the original layout; switch back on to recover your width. **Reset site** restores the original page and the default preference (off, 80%). Closing the popup cancels an uncommitted slider preview.

### Shortcuts

| Action | Default |
| --- | --- |
| Toggle this site | Alt+Shift+N |
| Narrower | Alt+Shift+Left |
| Wider | Alt+Shift+Right |

Shortcuts change width in 5-point steps. Narrowing while off starts at 95%; toggling on uses the site's remembered width. Customize shortcuts at `chrome://extensions/shortcuts` if your OS or another extension uses these combinations. They are browser shortcuts, not system-wide shortcuts.

## Conservative by design

Narrower applies only a maximum width and horizontal auto margins to the document body, using one removable, screen-only style element. It never changes the site's classes, inline styles, DOM hierarchy, descendants, font sizes, or viewport. Off means that style element is removed. Printing uses the original layout, and narrowing pauses during fullscreen.

- Width ranges from 30–100% of the window, with a **640px minimum**. Narrow windows are left alone.
- Already-narrow pages are not widened or unnecessarily restyled.
- Padding and borders are included in the requested width.
- Layouts that cannot shrink or center safely, or that develop new horizontal overflow, are left unchanged. The popup explains when this happens.
- Body replacement, theme changes, and window resizing are handled without scanning or rewriting the page's contents. DOM observers disconnect when Narrower is off.

### An honest limit

**No CSS extension can guarantee safe centering on every website.** Narrower changes the body's available width, not the browser's actual viewport. Viewport-based media queries, `vw` sizing, fixed-position elements, and application assumptions still use the original window size. Some dashboards, canvases, full-width apps, and unusual root layouts therefore won't narrow. Narrower prefers doing nothing to introducing overflow, but overflow checks cannot detect every possible visual or behavioral problem. Switch it off for a site that doesn't cooperate.

Browser settings pages, extension pages, Chrome Web Store pages, and the browser's built-in PDF viewer cannot be modified. When site access is withheld, grant it through Chrome's extension settings. An existing tab can be initialized from the popup without reloading the page.

## Privacy and permissions

No analytics, remote code, external fonts, or page-content collection. Settings are stored in `chrome.storage.sync` and may sync through your Chrome account.

- **Storage:** remember width and enabled state for each hostname.
- **Website access:** restore opted-in layouts on future visits. Content scripts run only in the top-level page, not embedded frames.
- **Active tab / scripting:** initialize existing tabs when using the popup or a shortcut.

The extension does not need the broad `tabs` permission. The optional icon-credit link opens Flaticon only when clicked.

Upgrading from v0.1 preserves legacy global width/disabled-site preferences as a fallback. The first edit on a site creates its own setting; it no longer changes widths globally. Legacy zero-width settings are clamped to the safe range.

## Development

Vanilla JavaScript, Manifest V3. No runtime dependencies or build step.

```sh
npm ci
npx playwright install chromium
npm test
```

Tests include settings/migration unit tests and real Chromium tests with the unpacked extension loaded. Browser fixtures cover centering and restoration, page attributes and interactions, fixed/sticky positioning, same-site synchronization, persistence, shortcuts' actions, overflow protection, SPA body replacement, print/fullscreen, and popup preview/commit behavior.

## Credits

[Data merge icons created by Fuzzee — Flaticon](https://www.flaticon.com/free-icons/data-merge).

The initial prototype was developed with Claude 3.5 Sonnet and ChatGPT 4o; subsequent development also uses AI assistance.

## License

MIT. See [LICENSE](LICENSE).
