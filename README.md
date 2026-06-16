# Bookmark to Existing Tab

A tiny, resource-light Chrome extension. When you open a bookmark, if a tab with
the **exact same URL** is already open, it switches you to that tab instead of
opening a duplicate. If no such tab exists, the bookmark opens in a **new tab**
(instead of replacing your current one).

Works even with hundreds of tabs open — it does no polling, runs no content
scripts, and only wakes up when you actually click a bookmark (Chrome's
`auto_bookmark` navigation type).

## How it works

- Listens to `chrome.webNavigation.onCommitted` and reacts **only** to
  navigations tagged `auto_bookmark` (i.e. bookmark clicks).
- Looks for another open tab whose URL matches exactly.
- If found: activates that tab + focuses its window, **reloads it** (hard
  refresh by default, so you don't see a stale page), then either closes the
  newly-opened bookmark tab or goes back (so you land where you were).
- If not found (a new URL): opens it in a **new tab** and leaves your current
  tab untouched.

## Install (unpacked)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
   (`F:\OneDrive\claude\chrome-extension-bookmarks-tab`)

The extension activates immediately. No options page, no icon click needed.

## URL matching

By default matching is **exact**, including query strings — so this URL:

```
https://www.ebay.com.au/b/PC-Laptops-Notebooks/177/bn_504116?LH_ItemCondition=3000%7C2500%7C7000&LH_PrefLoc=1&_dmd=2&_sop=10&mag=1&rt=nc
```

only matches a tab with that identical query string. A different filter/sort is
treated as a different page.

To treat URLs that differ only by `#hash` as the same page, set
`IGNORE_HASH = true` at the top of `background.js` and reload the extension.

## Refresh behavior

When it switches to an existing tab it reloads that tab, so you never land on a
stale page. This is controlled by two flags at the top of `background.js`:

- `REFRESH_ON_SWITCH` (default `true`) — reload the tab on switch. Set to
  `false` to switch without reloading.
- `BYPASS_CACHE` (default `true`) — hard refresh that ignores the browser cache
  (cache-busting). Set to `false` for a normal reload.

## New-tab behavior

- `OPEN_NEW_URLS_IN_NEW_TAB` (default `true`) — when a bookmark is a new URL
  (no tab has it yet), open it in a new tab instead of replacing the current
  tab. Set to `false` to keep Chrome's default behavior.

Reload the extension after changing any of these flags.

## Permissions

- `tabs` — read tab URLs so it can find a matching tab and switch to it.
- `webNavigation` — detect bookmark navigations.

No host permissions, no network access.
