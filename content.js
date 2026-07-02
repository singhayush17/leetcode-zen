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
  let zenEnabled = true;
  let observer = null;
  let debounceTimer = null;

  /* ------------------------------------------------------------------
   *  IMMEDIATE: Add class to <html> synchronously to activate CSS
   *  before any content renders. This prevents the flash.
   *  We default to ON and will remove the class if storage says OFF.
   * ------------------------------------------------------------------ */
  document.documentElement.classList.add("leetcode-zen-active");

  /* ------------------------------------------------------------------
   *  SELECTOR-BASED HIDING (fast, belt-and-suspenders with CSS)
   * ------------------------------------------------------------------ */

  const SELECTORS_TO_HIDE = [
    // Question number / frontend ID
    '[data-cy="question-frontend-id"]',
    '[class*="question-id"]',
    '.question-frontend-id',

    // Difficulty
    '[class*="text-difficulty-easy"]',
    '[class*="text-difficulty-medium"]',
    '[class*="text-difficulty-hard"]',
    '[data-cy="question-difficulty"]',

    // Tags
    '[data-cy="topic-tags"]',
    '[data-cy="company-tags"]',
    'a[href*="/tag/"]',

    // Hints
    '[data-cy="hints-section"]',

    // Tabs (solutions, discussion, editorial) — by href
    'a[href*="/solutions"]',
    'a[href*="/discuss"]',
    'a[href*="/editorial"]',
    // Tabs — by data-cy
    '[data-cy="solutions-tab"]',
    '[data-cy="discuss-tab"]',
    '[data-cy="editorial-tab"]',

    // Likes / dislikes / comment icons
    '[data-icon="thumbs-up"]',
    '[data-icon="thumbs-down"]',
    '[data-icon="comment"]',
    '[data-icon="share"]',

    // Test case result details
    '[data-e2e-locator="console-testcase-result"]',

    // Acceptance rate on problem lists
    '[data-cy="ac-rate"]',
    '[data-cy="question-ac-rate"]',
  ];

  function hideBySelectors() {
    for (const sel of SELECTORS_TO_HIDE) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (el.dataset.zenHidden) continue;
        el.style.setProperty("display", "none", "important");
        el.dataset.zenHidden = "1";
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
    const headings = document.querySelectorAll("div, h3, h4, h5, span, p");
    const SECTIONS_TO_HIDE = new Set([
      "similar questions", "companies", "related topics",
      "company tags", "topic tags",
    ]);

    for (const el of headings) {
      if (el.dataset.zenHidden) continue;
      const text = el.textContent?.trim().toLowerCase();
      if (!SECTIONS_TO_HIDE.has(text)) continue;
      if (el.children.length > 3) continue;

      const container = el.closest("div[class]") || el.parentElement;
      if (container && !container.dataset.zenHidden) {
        container.style.setProperty("display", "none", "important");
        container.dataset.zenHidden = "1";
      }
    }
  }

  function hideHintButtons() {
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
    const HIDDEN_TABS = new Set([
      "solutions", "editorial", "discussion",
      "discuss", "solution",
    ]);

    // 1. Hide by FontAwesome icon classes used by the tab icons
    //    Solutions = fa-flask, Editorial = fa-book-open
    const iconSelectors = [
      ".fa-flask",       // Solutions tab icon
      ".fa-book-open",   // Editorial tab icon
    ];
    for (const sel of iconSelectors) {
      const icons = document.querySelectorAll(sel);
      for (const icon of icons) {
        // Walk up to hide the entire tab (icon container + text sibling)
        let tab = icon;
        for (let i = 0; i < 5; i++) {
          if (!tab.parentElement) break;
          tab = tab.parentElement;
          // We've reached the tab wrapper when it contains both an SVG and text
          const hasIcon = tab.querySelector("svg");
          const textContent = tab.textContent?.trim().toLowerCase() || "";
          const isTab = [...HIDDEN_TABS].some(t => textContent === t || textContent.startsWith(t));
          if (hasIcon && isTab) {
            tab.style.setProperty("display", "none", "important");
            tab.dataset.zenHidden = "1";
            break;
          }
        }
        // Fallback: at minimum hide the icon's container div
        const iconContainer = icon.closest("div");
        if (iconContainer && !iconContainer.dataset.zenHidden) {
          iconContainer.style.setProperty("display", "none", "important");
          iconContainer.dataset.zenHidden = "1";
        }
      }
    }

    // 2. By visible text content — hide text AND walk up to parent tab
    const tabElements = document.querySelectorAll(
      'a, div[role="tab"], button, span[role="tab"], div.whitespace-nowrap, div.font-medium'
    );
    for (const el of tabElements) {
      if (el.dataset.zenHidden) continue;
      const text = el.textContent?.trim().toLowerCase();
      if (!HIDDEN_TABS.has(text)) continue;

      // Hide the text element itself
      el.style.setProperty("display", "none", "important");
      el.dataset.zenHidden = "1";

      // Walk up to hide the parent tab wrapper (contains icon + text)
      let parent = el.parentElement;
      for (let i = 0; i < 4; i++) {
        if (!parent) break;
        const hasSvg = parent.querySelector("svg");
        if (hasSvg) {
          parent.style.setProperty("display", "none", "important");
          parent.dataset.zenHidden = "1";
          break;
        }
        parent = parent.parentElement;
      }
    }

    // 3. By href — catches anchor-based tabs
    const linkSelectors = [
      'a[href*="/solutions"]',
      'a[href*="/discuss"]',
      'a[href*="/editorial"]',
    ];
    for (const sel of linkSelectors) {
      const links = document.querySelectorAll(sel);
      for (const link of links) {
        if (link.dataset.zenHidden) continue;
        link.style.setProperty("display", "none", "important");
        link.dataset.zenHidden = "1";
      }
    }
  }

  function hideFailingTestDetails() {
    const resultArea = document.querySelector('[class*="result"], [class*="Result"]');
    if (!resultArea) return;

    const allDivs = resultArea.querySelectorAll("div, pre");
    const DETAIL_PREFIXES = ["input", "output", "expected", "stdout"];

    for (const el of allDivs) {
      if (el.dataset.zenHidden) continue;
      const text = el.textContent?.trim().toLowerCase();
      for (const prefix of DETAIL_PREFIXES) {
        if (text.startsWith(prefix + ":") || text.startsWith(prefix + " =")) {
          el.style.setProperty("display", "none", "important");
          el.dataset.zenHidden = "1";
          break;
        }
      }
    }
  }

  /* ------------------------------------------------------------------
   *  QUESTION NUMBER STRIPPING
   *  Removes "1970. " prefix from titles, list items, contest pages.
   * ------------------------------------------------------------------ */

  const QUESTION_NUM_RE = /^\d+\.\s+/;

  function hideQuestionNumbers() {
    // 1. Strip from the page <title> (browser tab)
    if (document.title && QUESTION_NUM_RE.test(document.title)) {
      document.title = document.title.replace(QUESTION_NUM_RE, "");
    }

    // 2. Strip from visible title elements on the problem page
    const titleCandidates = document.querySelectorAll(
      'a[href*="/problems/"], span, div'
    );
    for (const el of titleCandidates) {
      if (el.dataset.zenNumStripped) continue;
      if (el.children.length > 0) continue; // only leaf text nodes

      const text = el.textContent?.trim() || "";
      if (QUESTION_NUM_RE.test(text)) {
        el.textContent = text.replace(QUESTION_NUM_RE, "");
        el.dataset.zenNumStripped = "1";
      }
    }

    // 3. Problem list table rows — standalone number cells
    const numberCells = document.querySelectorAll("td, span, div, a");
    for (const el of numberCells) {
      if (el.dataset.zenHidden) continue;
      if (el.children.length > 0) continue;
      const text = el.textContent?.trim() || "";
      if (/^\d{1,5}$/.test(text)) {
        const row = el.closest('tr, div[role="row"], div[class*="odd"], div[class*="even"]');
        if (row && row.querySelector('a[href*="/problems/"]')) {
          el.style.setProperty("display", "none", "important");
          el.dataset.zenHidden = "1";
        }
      }
    }
  }

  /* ------------------------------------------------------------------
   *  ORCHESTRATOR — runs all hiding passes
   * ------------------------------------------------------------------ */

  function applyZenMode() {
    if (!zenEnabled) return;
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
    if (!zenEnabled) {
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

  function onMutation() {
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
    document.documentElement.classList.add("leetcode-zen-active");
    applyZenMode();
    ensureIndicator();
    startObserver();
  }

  function disableZen() {
    zenEnabled = false;
    document.documentElement.classList.remove("leetcode-zen-active");
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
    }
  });

  /* ------------------------------------------------------------------
   *  INIT — read stored preference. If OFF, remove the class we
   *  added synchronously at the top. If ON (default), start observer.
   * ------------------------------------------------------------------ */

  chrome.storage.sync.get([STORAGE_KEY], (result) => {
    zenEnabled = result[STORAGE_KEY] !== false; // default ON
    if (zenEnabled) {
      startObserver();
    } else {
      // User had it disabled — remove the class we eagerly added
      document.documentElement.classList.remove("leetcode-zen-active");
    }
  });
})();
