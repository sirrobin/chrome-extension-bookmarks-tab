// Bookmark to Existing Tab
//
// Chrome tags any navigation that came from clicking a bookmark with the
// transitionType "auto_bookmark". We listen ONLY for those, so this code does
// nothing at all during normal browsing — no polling, no content scripts, no
// per-tab listeners. That keeps it cheap even with hundreds of tabs open.
//
// Flow when a bookmark is opened:
//   1. Find another tab that already has the exact same URL.
//   2a. If found, activate that tab (and focus its window) and reload it, then
//       clean up the tab the bookmark just opened:
//        - if the bookmark created a brand-new tab, close it;
//        - if it replaced the current tab's page, go back so you land where
//          you were before clicking.
//   2b. If NOT found (a new URL) and the bookmark replaced the current tab,
//       open it in a new tab instead and restore the current tab.

// --- Config ---------------------------------------------------------------

// Set to true to treat URLs that differ only by #hash as the same page.
const IGNORE_HASH = false;

// When we switch to an existing tab, reload it so you don't see a stale page.
const REFRESH_ON_SWITCH = true;

// Reload ignoring the browser cache (hard refresh / cache-busting). Set to
// false to do a normal reload that may serve cached resources.
const BYPASS_CACHE = true;

// When a bookmark is a NEW url (no tab already has it) and it would have
// replaced the current tab, open it in a new tab instead and keep the current
// tab where it was. Set to false to keep Chrome's default (replace current tab).
const OPEN_NEW_URLS_IN_NEW_TAB = true;

// --- Track tabs that were freshly created --------------------------------
// Lets us tell "bookmark opened a new tab" (close it) from "bookmark replaced
// the current tab" (go back). This Set lives in the service worker's memory,
// which is fine: onCreated fires immediately before the bookmark's onCommitted,
// so the worker is always alive across that short burst.
const freshTabs = new Set();

chrome.tabs.onCreated.addListener((tab) => {
  freshTabs.add(tab.id);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  freshTabs.delete(tabId);
});

// --- Helpers --------------------------------------------------------------

function normalize(url) {
  if (!IGNORE_HASH) return url;
  const i = url.indexOf("#");
  return i === -1 ? url : url.slice(0, i);
}

// --- Main listener --------------------------------------------------------

chrome.webNavigation.onCommitted.addListener(async (details) => {
  // Only top-frame bookmark navigations.
  if (details.frameId !== 0) return;
  if (details.transitionType !== "auto_bookmark") return;

  const navTabId = details.tabId;
  const wasFresh = freshTabs.has(navTabId);
  freshTabs.delete(navTabId);

  const target = normalize(details.url);

  let existing;
  try {
    const tabs = await chrome.tabs.query({});
    existing = tabs.find(
      (t) => t.id !== navTabId && t.url && normalize(t.url) === target
    );
  } catch (e) {
    return; // querying failed; let the bookmark open normally
  }

  if (!existing) {
    // New URL — no tab has it yet.
    // If it opened in its own new tab already, that's exactly what we want.
    // If it replaced the current tab, move it into a new tab and restore
    // the current tab to where it was.
    if (OPEN_NEW_URLS_IN_NEW_TAB && !wasFresh) {
      let navTab;
      try {
        navTab = await chrome.tabs.get(navTabId);
      } catch (e) {
        return;
      }
      let newTab;
      try {
        newTab = await chrome.tabs.create({
          url: details.url,
          active: true,
          index: navTab.index + 1,
          windowId: navTab.windowId,
        });
      } catch (e) {
        return;
      }
      // Restore the current tab; if it had no back history, the bookmark URL
      // would otherwise linger here as a duplicate of the new tab — close
      // that tab and leave the bookmark in place instead.
      chrome.tabs.goBack(navTabId).catch(() => {
        chrome.tabs.remove(newTab.id).catch(() => {});
      });
    }
    return; // new URL handled (or left to open normally)
  }

  // Switch to the existing tab.
  try {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } catch (e) {
    return;
  }

  // Reload it so you don't see a stale page from when it was last loaded.
  if (REFRESH_ON_SWITCH) {
    chrome.tabs.reload(existing.id, { bypassCache: BYPASS_CACHE }).catch(() => {});
  }

  // Clean up the tab the bookmark just opened.
  if (wasFresh) {
    chrome.tabs.remove(navTabId).catch(() => {});
  } else {
    // The bookmark replaced the current tab's page; return to where we were.
    chrome.tabs.goBack(navTabId).catch(() => {
      // No back history (e.g. it was effectively a new tab) — close it instead.
      chrome.tabs.remove(navTabId).catch(() => {});
    });
  }
});
