# ☯ LeetCode Zen Mode

> Strip away the noise. Just you, the problem, and your code.

A Chrome extension that transforms LeetCode into a distraction-free coding environment. No difficulty labels, no discussion threads, no hints, no company tags, no question numbers — just the problem description, your code editor, and your submission history.

---

## ✨ What Gets Hidden

| Distraction | Status |
|---|---|
| Question numbers (e.g. "1970.") | 🚫 Hidden |
| Difficulty badge (Easy/Medium/Hard) | 🚫 Hidden |
| Solutions & Discussion tabs | 🚫 Hidden |
| Editorial tab | 🚫 Hidden |
| Hints section | 🚫 Hidden |
| Company tags | 🚫 Hidden |
| Topic tags (Array, DFS, etc.) | 🚫 Hidden |
| Acceptance rate & stats | 🚫 Hidden |
| Likes / Dislikes | 🚫 Hidden |
| Similar Questions | 🚫 Hidden |
| Failed testcase tabs and details | 🚫 Hidden* |

\*You'll still see the verdict, but Zen Mode hides testcase tabs like `Case 1` and details such as `Input`, `Output`, `Expected`, and `Use Testcase`.

## ✅ What Stays Visible

- **Problem description** — the actual question text and examples
- **Code editor** — write your solution
- **Submission history** — track your attempts
- **Run / Submit buttons** — test and submit your code
- **Pass/fail verdict** — know if it worked, without seeing which testcase failed

---

## 🚀 Installation

### From Source (Developer Mode)

1. **Clone this repo**
   ```bash
   git clone https://github.com/whyush7/leetcode-zen.git
   ```

2. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode** (toggle in the top-right corner)

3. **Load the extension**
   - Click **"Load unpacked"**
   - Select the `leetcode-zen` folder

4. **Visit any LeetCode problem** — Zen Mode activates automatically

---

## 🎛️ Toggle On/Off

Click the extension icon in your Chrome toolbar to toggle Zen Mode on or off. The extension remembers your preference across sessions.

When active, a small **☯ ZEN** badge appears in the bottom-left corner of the page.

---

## 🧠 Why Zen Mode?

- **No difficulty bias** — Approach every problem the same way, whether it's Easy or Hard
- **No question number lookup** — Resist the urge to Google the solution by problem number
- **No hint crutches** — Build your problem-solving muscles without training wheels
- **No social pressure** — Ignore acceptance rates and other people's discussions
- **Honest debugging** — When your code fails, work backward from the verdict instead of relying on the revealed testcase

---

## 🏗️ Project Structure

```
leetcode-zen/
├── manifest.json      # Chrome extension manifest (v3)
├── content.css        # CSS rules to hide distracting elements
├── content.js         # MutationObserver-based DOM scrubbing
├── popup.html         # Extension popup UI
├── popup.css          # Popup styling
├── popup.js           # Toggle logic + chrome.storage
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 🔧 How It Works

1. **CSS injection** (`content.css`) — Hides elements using attribute selectors, `:has()`, and class-name patterns, all scoped under `html.leetcode-zen-active`
2. **MutationObserver** (`content.js`) — Because LeetCode is a React SPA, elements mount and unmount on every navigation. The observer re-applies hiding rules on every DOM change and strips failed testcase panels down to the verdict only
3. **Text-based matching** — For elements CSS can't target (like stat labels or difficulty text), the script matches by `textContent`
4. **Chrome Storage** — Toggle state persists across sessions via `chrome.storage.sync`

---

## 📄 License

MIT — do whatever you want with it.

---

<p align="center">
  <i>Focus on solving, not judging.</i>
</p>
