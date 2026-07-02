/**
 * LeetCode Zen Mode — Popup Script
 */
(function () {
  "use strict";

  const STORAGE_KEY = "leetcodeZenEnabled";
  const toggle = document.getElementById("zenToggle");
  const statusText = document.getElementById("statusText");

  // Load saved state
  chrome.storage.sync.get([STORAGE_KEY], (result) => {
    const enabled = result[STORAGE_KEY] !== false; // default ON
    toggle.checked = enabled;
    updateStatusText(enabled);
  });

  // Handle toggle
  toggle.addEventListener("change", () => {
    const enabled = toggle.checked;
    chrome.storage.sync.set({ [STORAGE_KEY]: enabled });
    updateStatusText(enabled);

    // Notify the active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "ZEN_TOGGLE",
          enabled: enabled,
        });
      }
    });
  });

  function updateStatusText(enabled) {
    statusText.textContent = enabled ? "Active" : "Paused";
    statusText.classList.toggle("inactive", !enabled);
  }
})();
