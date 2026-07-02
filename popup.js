/**
 * LeetCode Zen Mode — Popup Script
 */
(function () {
  "use strict";

  const STORAGE_KEY = "leetcodeZenEnabled";
  const SETTINGS_KEY = "leetcodeZenSettings";
  const BASE_HIDE_SETTINGS = {
    questionNumbers: true,
    difficulty: true,
    discussionTabs: true,
    hints: true,
    tagsCompanies: true,
    stats: true,
    likes: true,
    similarQuestions: true,
    failingTests: true,
  };
  const DEFAULT_SETTINGS = {
    useContestOverrides: false,
    regular: { ...BASE_HIDE_SETTINGS },
    contest: { ...BASE_HIDE_SETTINGS },
  };

  const toggle = document.getElementById("zenToggle");
  const statusText = document.getElementById("statusText");
  const applyNotice = document.getElementById("applyNotice");
  const settingsHint = document.getElementById("settingsHint");
  const resetButton = document.getElementById("resetDefaults");
  const cancelButton = document.getElementById("cancelChanges");
  const applyButton = document.getElementById("applyChanges");
  const overrideToggle = document.getElementById("contestOverridesToggle");
  const contestSection = document.getElementById("contestSettingsSection");
  const regularInputs = Array.from(document.querySelectorAll('[data-scope="regular"][data-setting]'));
  const contestInputs = Array.from(document.querySelectorAll('[data-scope="contest"][data-setting]'));

  let savedEnabled = true;
  let savedSettings = normalizeSettings();
  let isDirty = false;

  function normalizeSettings(settings) {
    const source = settings || {};
    return {
      useContestOverrides: source.useContestOverrides === true,
      regular: { ...BASE_HIDE_SETTINGS, ...(source.regular || {}) },
      contest: { ...BASE_HIDE_SETTINGS, ...(source.contest || {}) },
    };
  }

  function cloneSettings(settings) {
    return JSON.parse(JSON.stringify(settings));
  }

  function applyScopeSettings(inputs, values) {
    for (const input of inputs) {
      input.checked = values[input.dataset.setting];
    }
  }

  function getScopeSettings(inputs) {
    const values = {};
    for (const input of inputs) {
      values[input.dataset.setting] = input.checked;
    }
    return values;
  }

  function getDraftState() {
    return {
      enabled: toggle.checked,
      settings: {
        useContestOverrides: overrideToggle.checked,
        regular: getScopeSettings(regularInputs),
        contest: getScopeSettings(contestInputs),
      },
    };
  }

  function statesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function updateStatusText(enabled) {
    statusText.textContent = enabled ? "Active" : "Paused";
    statusText.classList.toggle("inactive", !enabled);
  }

  function updateContestSectionState() {
    const showContestSettings = toggle.checked && overrideToggle.checked;
    contestSection.hidden = !showContestSettings;
    for (const input of contestInputs) {
      input.disabled = !showContestSettings;
      input.closest(".setting-row")?.classList.toggle("setting-row--disabled", !showContestSettings);
    }
  }

  function updateDisabledState(enabled) {
    for (const input of regularInputs) {
      input.disabled = !enabled;
      input.closest(".setting-row")?.classList.toggle("setting-row--disabled", !enabled);
    }

    overrideToggle.disabled = !enabled;
    overrideToggle.closest(".setting-row")?.classList.toggle("setting-row--disabled", !enabled);
    resetButton.disabled = !enabled;
    updateContestSectionState();
  }

  function updateDirtyState() {
    const savedState = { enabled: savedEnabled, settings: savedSettings };
    const draftState = getDraftState();
    isDirty = !statesEqual(savedState, draftState);

    applyButton.disabled = !isDirty;
    cancelButton.disabled = !isDirty;
    applyNotice.innerHTML = isDirty
      ? 'You have unsaved changes. Click <strong>Apply changes</strong> below to use them on LeetCode.'
      : 'Toggle your settings, then click <strong>Apply changes</strong> below to use them on LeetCode.';
    settingsHint.textContent = isDirty
      ? "Unsaved changes. Apply to reload the current LeetCode tab."
      : "Changes stay local until you apply them.";
  }

  function syncFormState() {
    updateStatusText(toggle.checked);
    updateDisabledState(toggle.checked);
    updateDirtyState();
  }

  function applySavedStateToForm() {
    toggle.checked = savedEnabled;
    overrideToggle.checked = savedSettings.useContestOverrides;
    applyScopeSettings(regularInputs, savedSettings.regular);
    applyScopeSettings(contestInputs, savedSettings.contest);
    syncFormState();
  }

  function reloadLeetCodeTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id || !activeTab.url) return;
      if (/https:\/\/(www\.)?leetcode\.com\//.test(activeTab.url)) {
        chrome.tabs.reload(activeTab.id);
      }
    });
  }

  function applyChanges() {
    const draftState = getDraftState();
    savedEnabled = draftState.enabled;
    savedSettings = normalizeSettings(draftState.settings);

    chrome.storage.sync.set({
      [STORAGE_KEY]: savedEnabled,
      [SETTINGS_KEY]: savedSettings,
    }, () => {
      syncFormState();
      reloadLeetCodeTab();
    });
  }

  chrome.storage.sync.get([STORAGE_KEY, SETTINGS_KEY], (result) => {
    savedEnabled = result[STORAGE_KEY] !== false;
    savedSettings = normalizeSettings(result[SETTINGS_KEY]);
    savedSettings = cloneSettings(savedSettings);
    applySavedStateToForm();
  });

  function handleDraftChange() {
    syncFormState();
  }

  toggle.addEventListener("change", handleDraftChange);
  overrideToggle.addEventListener("change", handleDraftChange);

  for (const input of [...regularInputs, ...contestInputs]) {
    input.addEventListener("change", handleDraftChange);
  }

  resetButton.addEventListener("click", () => {
    const settings = normalizeSettings(DEFAULT_SETTINGS);
    overrideToggle.checked = settings.useContestOverrides;
    applyScopeSettings(regularInputs, settings.regular);
    applyScopeSettings(contestInputs, settings.contest);
    syncFormState();
  });

  cancelButton.addEventListener("click", applySavedStateToForm);
  applyButton.addEventListener("click", applyChanges);
})();
