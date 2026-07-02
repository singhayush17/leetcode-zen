/**
 * LeetCode Zen Mode — Content Script
 *
 * Targets the real LeetCode DOM (Next.js SPA with Tailwind-like classes).
 * Uses MutationObserver because React re-renders on every route change.
 *
 * FLASH PREVENTION: The class is added to <html> (not <body>) synchronously
 * at document_start, so the injected CSS hides elements before they paint.
 *
 * What gets hidden:
 *   - Question numbers ("1970." prefix)
 *   - Difficulty badge (Easy/Medium/Hard)
 *   - Solutions, Discussion, Editorial tabs
 *   - Hints section
 *   - Company tags & topic tags
 *   - Stats (Accepted, Submissions, Acceptance Rate)
 *   - Similar Questions
 *   - Likes / Dislikes / Comment icon
 *   - Failing test case details (Input/Output/Expected)
 *
 * What stays visible:
 *   - Problem description
 *   - Code editor
 *   - Submission history
 *   - Run / Submit buttons
 *   - Pass/fail verdict (without revealing which cases failed)
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
  const ROOT_CLASS = "leetcode-zen-active";
  const PROBLEM_PAGE_CLASS = "zen-problem-page";
  const SETTING_CLASS_MAP = {
    questionNumbers: "zen-hide-question-numbers",
    difficulty: "zen-hide-difficulty",
    discussionTabs: "zen-hide-discussion-tabs",
    hints: "zen-hide-hints",
    tagsCompanies: "zen-hide-tags-companies",
    stats: "zen-hide-stats",
    likes: "zen-hide-likes",
    similarQuestions: "zen-hide-similar-questions",
    failingTests: "zen-hide-failing-tests",
  };
  let zenEnabled = true;
  let zenSettings = normalizeSettings();
  let observer = null;
  let debounceTimer = null;

  function isContestPage() {
    const path = window.location.pathname.toLowerCase();
    return path.includes("/contest/");
  }

  function isProblemPage() {
    const path = window.location.pathname.toLowerCase();
    return path.includes("/problems/") || path.includes("/contest/");
  }

  function getActiveHideSettings() {
    if (isContestPage() && zenSettings.useContestOverrides) {
      return zenSettings.contest;
    }
    return zenSettings.regular;
  }

  function isZenActiveForPage() {
    return zenEnabled && isProblemPage();
  }

  /* ------------------------------------------------------------------
   *  IMMEDIATE: Add class to <html> synchronously to activate CSS
   *  before any content renders. This prevents the flash.
   *  We default to ON and will remove the class if storage says OFF.
   * ------------------------------------------------------------------ */
  document.documentElement.classList.add(ROOT_CLASS);
  for (const className of Object.values(SETTING_CLASS_MAP)) {
    document.documentElement.classList.add(className);
  }

  function normalizeSettings(settings) {
    const source = settings || {};
    return {
      useContestOverrides: source.useContestOverrides === true,
      regular: { ...BASE_HIDE_SETTINGS, ...(source.regular || {}) },
      contest: { ...BASE_HIDE_SETTINGS, ...(source.contest || {}) },
    };
  }

  function syncRootClasses() {
    const pageEnabled = isZenActiveForPage();
    const activeSettings = getActiveHideSettings();
    document.documentElement.classList.toggle(ROOT_CLASS, pageEnabled);
    document.documentElement.classList.toggle(PROBLEM_PAGE_CLASS, pageEnabled && isProblemPage());
    for (const [key, className] of Object.entries(SETTING_CLASS_MAP)) {
      document.documentElement.classList.toggle(className, pageEnabled && activeSettings[key]);
    }
  }

  /* ------------------------------------------------------------------
   *  SELECTOR-BASED HIDING (fast, belt-and-suspenders with CSS)
   * ------------------------------------------------------------------ */

  const SELECTORS_TO_HIDE = {
    questionNumbers: [
      '[data-cy="question-frontend-id"]',
      '[class*="question-id"]',
      ".question-frontend-id",
    ],
    difficulty: [
      '[class*="text-difficulty-easy"]',
      '[class*="text-difficulty-medium"]',
      '[class*="text-difficulty-hard"]',
      '[data-cy="question-difficulty"]',
    ],
    tagsCompanies: [
      '[data-cy="topic-tags"]',
      '[data-cy="company-tags"]',
      'a[href*="/tag/"]',
    ],
    hints: [
      '[data-cy="hints-section"]',
    ],
    discussionTabs: [
      'a[href*="/solutions"]',
      'a[href*="/discuss"]',
      'a[href*="/editorial"]',
      '[data-cy="solutions-tab"]',
      '[data-cy="discuss-tab"]',
      '[data-cy="editorial-tab"]',
    ],
    likes: [
      '[data-icon="thumbs-up"]',
      '[data-icon="thumbs-down"]',
      '[data-icon="comment"]',
      '[data-icon="share"]',
    ],
    failingTests: [
      '[data-e2e-locator="console-testcase-result"]',
    ],
    stats: [
      '[data-cy="ac-rate"]',
      '[data-cy="question-ac-rate"]',
    ],
  };

  function hideBySelectors() {
    const activeSettings = getActiveHideSettings();
    for (const [key, selectors] of Object.entries(SELECTORS_TO_HIDE)) {
      if (!activeSettings[key]) continue;
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          if (el.dataset.zenHidden) continue;
          el.style.setProperty("display", "none", "important");
          el.dataset.zenHidden = "1";
        }
      }
    }
  }

  /* ------------------------------------------------------------------
   *  TEXT-BASED HIDING (for elements CSS can't reliably target)
   * ------------------------------------------------------------------ */

  /** Known difficulty label texts */
  const DIFFICULTY_WORDS = new Set(["easy", "medium", "hard"]);

  /** Known difficulty colors (computed rgb values) */
  const DIFFICULTY_COLORS = new Set([
    "rgb(0, 175, 155)",    // easy teal
    "rgb(0, 184, 163)",    // easy alt
    "rgb(255, 184, 0)",    // medium amber
    "rgb(255, 192, 30)",   // medium alt
    "rgb(255, 55, 95)",    // hard red
    "rgb(255, 45, 85)",    // hard alt
  ]);

  function hideDifficultyLabels() {
    if (!getActiveHideSettings().difficulty) return;
    const candidates = document.querySelectorAll("span, div");
    for (const el of candidates) {
      if (el.dataset.zenHidden) continue;
      const text = el.textContent?.trim().toLowerCase();
      if (!DIFFICULTY_WORDS.has(text)) continue;

      // Verify it's actually a difficulty label by checking color or class
      const cls = el.className || "";
      const color = getComputedStyle(el).color;
      if (cls.includes("difficulty") || DIFFICULTY_COLORS.has(color)) {
        el.style.setProperty("display", "none", "important");
        el.dataset.zenHidden = "1";
      }
    }
  }

  /** Stats labels we want to hide */
  const STAT_LABELS = new Set([
    "accepted", "submissions", "acceptance rate",
    "total accepted", "total submissions",
  ]);

  function hideStats() {
    if (!getActiveHideSettings().stats) return;
    const candidates = document.querySelectorAll("span, div, p");
    for (const el of candidates) {
      if (el.dataset.zenHidden) continue;
      const text = el.textContent?.trim().toLowerCase();
      if (!STAT_LABELS.has(text)) continue;

      // Hide the parent row that contains the label + value pair
      const row = el.parentElement;
      if (row) {
        row.style.setProperty("display", "none", "important");
        row.dataset.zenHidden = "1";
      }
    }
  }

  function hideSectionsByHeading() {
    const activeSettings = getActiveHideSettings();
    const headings = document.querySelectorAll("div, h3, h4, h5, span, p");
    const HEADING_TO_SETTING = {
      "similar questions": "similarQuestions",
      "companies": "tagsCompanies",
      "related topics": "tagsCompanies",
      "company tags": "tagsCompanies",
      "topic tags": "tagsCompanies",
    };

    for (const el of headings) {
      if (el.dataset.zenHidden) continue;
      const text = el.textContent?.trim().toLowerCase();
      const settingKey = HEADING_TO_SETTING[text];
      if (!settingKey || !activeSettings[settingKey]) continue;
      if (el.children.length > 3) continue;

      const container = el.closest("div[class]") || el.parentElement;
      if (container && !container.dataset.zenHidden) {
        container.style.setProperty("display", "none", "important");
        container.dataset.zenHidden = "1";
      }
    }
  }

  function hideHintButtons() {
    if (!getActiveHideSettings().hints) return;
    const buttons = document.querySelectorAll('button, div[role="button"]');
    for (const btn of buttons) {
      if (btn.dataset.zenHidden) continue;
      const text = btn.textContent?.trim();
      if (/^Hint\s*\d*$/i.test(text)) {
        const container = btn.closest("div[class]") || btn.parentElement;
        if (container) {
          container.style.setProperty("display", "none", "important");
          container.dataset.zenHidden = "1";
        }
      }
    }
  }

  function hideLikesDislikesRow() {
    if (!getActiveHideSettings().likes) return;
    // Strategy: find ANY element with thumbs-up icon and walk up to the
    // container row that holds the entire like/dislike/comment bar.
    const icons = document.querySelectorAll(
      '[data-icon="thumbs-up"], [data-icon="thumbs-down"], [data-icon="comment"], [data-icon="share"]'
    );
    const hiddenContainers = new Set();

    for (const icon of icons) {
      // Walk up from the icon to find the action bar container
      let el = icon;
      for (let i = 0; i < 8; i++) {
        if (!el.parentElement) break;
        el = el.parentElement;

        // We've found the row if it contains multiple action icons
        const iconCount = el.querySelectorAll(
          '[data-icon="thumbs-up"], [data-icon="thumbs-down"], [data-icon="comment"]'
        ).length;
        if (iconCount >= 2 && !hiddenContainers.has(el)) {
          el.style.setProperty("display", "none", "important");
          el.dataset.zenHidden = "1";
          hiddenContainers.add(el);
          break;
        }
      }
    }

    // Also hide individual like/dislike buttons and their count labels
    // in case the icon walk-up didn't catch a specific layout
    const likeButtons = document.querySelectorAll(
      'button:has([data-icon="thumbs-up"]), button:has([data-icon="thumbs-down"]), button:has([data-icon="comment"])'
    );
    for (const btn of likeButtons) {
      if (btn.dataset.zenHidden) continue;
      btn.style.setProperty("display", "none", "important");
      btn.dataset.zenHidden = "1";
    }
  }

  function hideTabsByText() {
    if (!getActiveHideSettings().discussionTabs) return;
    if (!isProblemPage()) return;
    const HIDDEN_TABS = new Set([
      "solutions", "editorial", "discussion",
      "discuss", "solution",
    ]);

    // Helper: given any element inside a tab, hide the outermost tab wrapper
    function hideTabWrapper(el) {
      // Best case: walk up to the flexlayout tab button wrapper
      const wrapper = el.closest(".flexlayout__tab_button");
      if (wrapper && !wrapper.dataset.zenHidden) {
        wrapper.style.setProperty("display", "none", "important");
        wrapper.dataset.zenHidden = "1";
        return;
      }
      // Fallback: walk up a few levels to find a container with an SVG
      let parent = el.parentElement;
      for (let i = 0; i < 6; i++) {
        if (!parent) break;
        if (parent.classList.contains("flexlayout__tab_button")) {
          parent.style.setProperty("display", "none", "important");
          parent.dataset.zenHidden = "1";
          return;
        }
        parent = parent.parentElement;
      }
      // Last resort: just hide the element itself
      el.style.setProperty("display", "none", "important");
      el.dataset.zenHidden = "1";
    }

    // 1. By FontAwesome icon classes
    const icons = document.querySelectorAll(".fa-flask, .fa-book-open");
    for (const icon of icons) {
      hideTabWrapper(icon);
    }

    // 2. By tab element IDs
    const tabIds = ["#solutions_tab", "#editorial_tab", "#discuss_tab", "#discussion_tab"];
    for (const id of tabIds) {
      const el = document.querySelector(id);
      if (el && !el.dataset.zenHidden) {
        hideTabWrapper(el);
      }
    }

    // 3. By visible text content
    const tabElements = document.querySelectorAll(
      'a, div[role="tab"], button, span[role="tab"], div.whitespace-nowrap, div.font-medium'
    );
    for (const el of tabElements) {
      if (el.dataset.zenHidden) continue;
      const text = el.textContent?.trim().toLowerCase();
      if (HIDDEN_TABS.has(text)) {
        hideTabWrapper(el);
      }
    }

    // 4. By href
    const linkSelectors = [
      'a[href*="/solutions"]',
      'a[href*="/discuss"]',
      'a[href*="/editorial"]',
    ];
    for (const sel of linkSelectors) {
      const links = document.querySelectorAll(sel);
      for (const link of links) {
        if (link.dataset.zenHidden) continue;
        hideTabWrapper(link);
      }
    }
  }

  function hideFailingTestDetails() {
    if (!getActiveHideSettings().failingTests) return;
    // The result area is: div.max-w-[700px] containing an h3 with the verdict.
    // Structure:
    //   div.max-w-[700px]
    //     └── div.flex.flex-col.gap-4
    //         ├── div.space-y-4  (verdict h3 + buttons — KEEP)
    //         └── div.space-y-4  (Input/Output/Expected — HIDE)
    //         └── div.flex-col   (Code section — HIDE)
    //         └── div.flex-col   (Notes section — HIDE)

    // 1. Find verdict headers
    const VERDICTS = [
      "wrong answer", "accepted", "time limit exceeded",
      "memory limit exceeded", "runtime error", "compile error",
      "output limit exceeded",
    ];

    const h3s = document.querySelectorAll("h3");
    for (const h3 of h3s) {
      const h3Text = h3.textContent?.trim().toLowerCase() || "";
      const isVerdict = VERDICTS.some(v => h3Text.startsWith(v));
      if (!isVerdict) continue;

      // 2. Find the result container (max-w-[700px] ancestor)
      const resultContainer = h3.closest('div[class*="max-w-"]') ||
                              h3.closest('div[class*="mx-auto"]');
      if (!resultContainer) continue;

      // 3. Keep only the verdict branch visible.
      // LeetCode changes class names often, so we hide sibling branches
      // around the verdict section instead of relying on one specific layout.
      const verdictSection =
        h3.closest("div.space-y-4") ||
        h3.closest("section") ||
        h3.parentElement;

      const hideSection = (section) => {
        if (!section || section === verdictSection) return;
        if (section.contains(verdictSection)) return;
        if (section.dataset.zenHidden) return;
        section.style.setProperty("display", "none", "important");
        section.dataset.zenHidden = "1";
      };

      let current = verdictSection;
      while (current && current !== resultContainer) {
        const parent = current.parentElement;
        if (!parent) break;
        for (const sibling of parent.children) {
          if (sibling === current) continue;
          if (!resultContainer.contains(sibling)) continue;
          hideSection(sibling);
        }
        current = parent;
      }

      // 4. Clean up testcase-specific labels/tabs that can sometimes render
      // inside the same subtree as the verdict section.
      const HIDDEN_LABELS = new Set([
        "input",
        "output",
        "expected",
        "stdout",
        "code",
        "testcase",
        "test result",
        "last executed input",
        "your input",
        "compile output",
      ]);

      const labelCandidates = resultContainer.querySelectorAll("button, div, span, p");
      for (const el of labelCandidates) {
        if (el === h3 || el.contains(h3)) continue;
        const text = el.textContent?.trim().toLowerCase() || "";
        if (!text) continue;

        const isCaseTab = /^case\s*\d+$/i.test(text) || /^case\s*\d+:\s*/i.test(text);
        const isHiddenLabel = HIDDEN_LABELS.has(text);
        const isUseTestcase = text === "use testcase";

        if (!isCaseTab && !isHiddenLabel && !isUseTestcase) continue;

        const section =
          el.closest('[role="tab"]') ||
          el.closest("button") ||
          el.closest("div.space-y-4") ||
          el.closest("div.flex-col") ||
          el.closest("section") ||
          el.parentElement;
        hideSection(section);
      }

      // 5. Hide the "Use Testcase" button area
      const useTestcase = resultContainer.querySelector(".testcaseAsInputClass");
      if (useTestcase) {
        const container = useTestcase.closest("div.absolute") || useTestcase.closest("div");
        if (container) {
          container.style.setProperty("display", "none", "important");
          container.dataset.zenHidden = "1";
        }
      }

      // 6. Hide the code section and notes section below the test results
      const codeLabel = resultContainer.querySelector("div.flex.items-center.justify-between");
      if (codeLabel) {
        const codeText = codeLabel.textContent?.trim().toLowerCase() || "";
        if (codeText.startsWith("code")) {
          const codeSection = codeLabel.closest("div.flex-col");
          hideSection(codeSection);
        }
      }
    }
  }

  /* ------------------------------------------------------------------
   *  QUESTION NUMBER STRIPPING
   *  Removes "1970. " prefix from titles, list items, contest pages.
   * ------------------------------------------------------------------ */

  const QUESTION_NUM_RE = /^\d+\.\s+/;
  const QUESTION_NUM_TEXT_ATTR = "zenQuestionOriginalText";
  const QUESTION_NUM_DISPLAY_ATTR = "zenQuestionOriginalDisplay";
  const QUESTION_NUM_HIDDEN_ATTR = "zenQuestionHidden";
  const QUESTION_NUM_TITLE_ATTR = "zenQuestionOriginalTitle";
  const QUESTION_NUM_TEXT_SELECTOR = "[data-zen-question-original-text]";
  const QUESTION_NUM_HIDDEN_SELECTOR = '[data-zen-question-hidden="1"]';

  function restoreQuestionNumbers() {
    const originalTitle = document.documentElement.dataset[QUESTION_NUM_TITLE_ATTR];
    if (originalTitle) {
      document.title = originalTitle;
      delete document.documentElement.dataset[QUESTION_NUM_TITLE_ATTR];
    }

    const stripped = document.querySelectorAll(QUESTION_NUM_TEXT_SELECTOR);
    for (const el of stripped) {
      el.textContent = el.dataset[QUESTION_NUM_TEXT_ATTR];
      delete el.dataset[QUESTION_NUM_TEXT_ATTR];
      delete el.dataset.zenNumStripped;
    }

    const hidden = document.querySelectorAll(QUESTION_NUM_HIDDEN_SELECTOR);
    for (const el of hidden) {
      const originalDisplay = el.dataset[QUESTION_NUM_DISPLAY_ATTR] || "";
      if (originalDisplay) {
        el.style.setProperty("display", originalDisplay);
      } else {
        el.style.removeProperty("display");
      }
      delete el.dataset[QUESTION_NUM_DISPLAY_ATTR];
      delete el.dataset[QUESTION_NUM_HIDDEN_ATTR];
      delete el.dataset.zenHidden;
    }
  }

  function hideQuestionNumbers() {
    if (!getActiveHideSettings().questionNumbers) {
      restoreQuestionNumbers();
      return;
    }

    // 1. Strip from the page <title> (browser tab)
    if (document.title && QUESTION_NUM_RE.test(document.title)) {
      if (!document.documentElement.dataset[QUESTION_NUM_TITLE_ATTR]) {
        document.documentElement.dataset[QUESTION_NUM_TITLE_ATTR] = document.title;
      }
      document.title = document.title.replace(QUESTION_NUM_RE, "");
    }

    // 2. Strip from visible title elements on the problem page.
    // Use the element's direct text node so the change is reversible.
    const titleCandidates = document.querySelectorAll(
      'a[href*="/problems/"], h1, h2, h3, h4, span, div'
    );
    for (const el of titleCandidates) {
      if (el.dataset.zenNumStripped) continue;
      const firstNode = el.firstChild;
      if (!firstNode || firstNode.nodeType !== Node.TEXT_NODE) continue;

      const text = firstNode.textContent || "";
      if (QUESTION_NUM_RE.test(text.trim())) {
        el.dataset[QUESTION_NUM_TEXT_ATTR] = text;
        firstNode.textContent = text.replace(QUESTION_NUM_RE, "");
        el.dataset.zenNumStripped = "1";
      }
    }

    // 3. Problem list table rows — standalone number cells
    const numberCells = document.querySelectorAll("td, span, div, a");
    for (const el of numberCells) {
      if (el.dataset[QUESTION_NUM_HIDDEN_ATTR] === "1") continue;
      if (el.children.length > 0) continue;
      const text = el.textContent?.trim() || "";
      if (/^\d{1,5}$/.test(text)) {
        const row = el.closest('tr, div[role="row"], div[class*="odd"], div[class*="even"]');
        if (row && row.querySelector('a[href*="/problems/"]')) {
          el.dataset[QUESTION_NUM_DISPLAY_ATTR] = el.style.display || "";
          el.style.setProperty("display", "none", "important");
          el.dataset[QUESTION_NUM_HIDDEN_ATTR] = "1";
          el.dataset.zenHidden = "1";
        }
      }
    }
  }

  /* ------------------------------------------------------------------
   *  ORCHESTRATOR — runs all hiding passes
   * ------------------------------------------------------------------ */

  function applyZenMode() {
    if (!isZenActiveForPage()) return;
    hideBySelectors();
    hideQuestionNumbers();
    hideDifficultyLabels();
    hideStats();
    hideSectionsByHeading();
    hideHintButtons();
    hideLikesDislikesRow();
    hideTabsByText();
    hideFailingTestDetails();
  }

  /* ------------------------------------------------------------------
   *  ZEN BADGE — floating indicator
   * ------------------------------------------------------------------ */

  function ensureIndicator() {
    if (!document.body) return;

    const existing = document.querySelector(".zen-mode-indicator");
    if (!isZenActiveForPage()) {
      if (existing) existing.remove();
      return;
    }
    if (!existing) {
      const badge = document.createElement("div");
      badge.className = "zen-mode-indicator";
      badge.textContent = "☯ ZEN";
      document.body.appendChild(badge);
    }
  }

  /* ------------------------------------------------------------------
   *  MUTATION OBSERVER — debounced for performance
   * ------------------------------------------------------------------ */

  function isResultMutationNode(node) {
    if (!(node instanceof Element)) return false;

    if (
      node.matches('[data-e2e-locator="console-testcase-result"]') ||
      node.matches('[data-e2e-locator="console-testcase-tab"]') ||
      node.matches('[data-e2e-locator="console-testcase-list"]') ||
      node.matches("h3")
    ) {
      return true;
    }

    if (
      node.querySelector?.('[data-e2e-locator="console-testcase-result"]') ||
      node.querySelector?.('[data-e2e-locator="console-testcase-tab"]') ||
      node.querySelector?.('[data-e2e-locator="console-testcase-list"]') ||
      node.querySelector?.("h3")
    ) {
      return true;
    }

    const text = node.textContent?.trim().toLowerCase() || "";
    return (
      text.includes("wrong answer") ||
      text.includes("use testcase") ||
      text.includes("expected") ||
      text.includes("your input")
    );
  }

  function onMutation(mutations) {
    const hasResultMutation = mutations.some((mutation) => {
      if (mutation.target && isResultMutationNode(mutation.target)) return true;
      return Array.from(mutation.addedNodes).some(isResultMutationNode);
    });

    if (hasResultMutation && isZenActiveForPage()) {
      hideBySelectors();
      hideFailingTestDetails();
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      applyZenMode();
      ensureIndicator();
    }, 80);
  }

  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver(onMutation);

    const waitForBody = setInterval(() => {
      if (document.body) {
        clearInterval(waitForBody);
        applyZenMode();
        ensureIndicator();
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }, 50);
  }

  /* ------------------------------------------------------------------
   *  ENABLE / DISABLE
   * ------------------------------------------------------------------ */

  function enableZen() {
    zenEnabled = true;
    syncRootClasses();
    applyZenMode();
    ensureIndicator();
    startObserver();
  }

  function disableZen() {
    zenEnabled = false;
    syncRootClasses();
    const badge = document.querySelector(".zen-mode-indicator");
    if (badge) badge.remove();
    if (observer) observer.disconnect();
    // Reload to cleanly restore all hidden elements
    window.location.reload();
  }

  /* ------------------------------------------------------------------
   *  MESSAGE LISTENER (from popup toggle)
   * ------------------------------------------------------------------ */

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "ZEN_TOGGLE") {
      msg.enabled ? enableZen() : disableZen();
    } else if (msg.type === "ZEN_SETTINGS_UPDATE") {
      zenEnabled = msg.enabled !== false;
      zenSettings = normalizeSettings(msg.settings);
      syncRootClasses();
      if (isZenActiveForPage()) {
        applyZenMode();
        ensureIndicator();
        startObserver();
      } else {
        disableZen();
      }
    }
  });

  /* ------------------------------------------------------------------
   *  INIT — read stored preference. If OFF, remove the class we
   *  added synchronously at the top. If ON (default), start observer.
   * ------------------------------------------------------------------ */

  chrome.storage.sync.get([STORAGE_KEY, SETTINGS_KEY], (result) => {
    zenEnabled = result[STORAGE_KEY] !== false; // default ON
    zenSettings = normalizeSettings(result[SETTINGS_KEY]);
    syncRootClasses();
    if (isZenActiveForPage()) {
      startObserver();
    } else {
      // User had it disabled — remove the class we eagerly added
      document.documentElement.classList.remove(ROOT_CLASS);
    }
  });
})();
