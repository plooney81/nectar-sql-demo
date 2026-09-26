/* ── Example Queries ─────────────────────────────────────────────────────── */
const EXAMPLES = {
  "simple-select": `SELECT *
  FROM people
 WHERE age > 25
 ORDER BY age DESC`,

  "select-join": `SELECT o.id, o.total, c.name, c.email
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
 WHERE o.status = 'pending'
 ORDER BY o.created_at DESC`,

  "select-aggregate": `SELECT department, COUNT(*) AS headcount, AVG(salary) AS avg_salary
  FROM employees
 WHERE active = true
 GROUP BY department
HAVING COUNT(*) > 5
 ORDER BY avg_salary DESC`,

  "select-cte": `WITH big_spenders AS (
  SELECT customer_id, SUM(total) AS spent
    FROM orders
   GROUP BY customer_id
  HAVING SUM(total) > 1000
)
SELECT c.name, b.spent
  FROM customers c
  JOIN big_spenders b ON b.customer_id = c.id
 WHERE c.id IN (SELECT customer_id FROM subscriptions WHERE active = true)
   AND c.region = 'US'
 ORDER BY b.spent DESC`,

  "insert": `INSERT INTO users (name, email, role)
VALUES ('Pete', 'pete@example.com', 'admin')`,

  "insert-select": `INSERT INTO archived_orders (id, customer_id, total)
SELECT id, customer_id, total
  FROM orders
 WHERE created_at < '2024-01-01'`,

  "update": `UPDATE employees
   SET salary = salary * 1.05,
       updated_at = CURRENT_TIMESTAMP
 WHERE department = 'engineering'
   AND active = true`,

  "delete": `DELETE FROM sessions
 WHERE expires_at < CURRENT_TIMESTAMP
    OR user_id IN (SELECT id FROM users WHERE banned = true)`,
};

/* ── CodeMirror Setup ────────────────────────────────────────────────────── */
const sqlEditor = CodeMirror(document.getElementById("sql-editor"), {
  mode:        "text/x-sql",
  theme:       "material-darker",
  lineNumbers: true,
  tabSize:     2,
  autofocus:   true,
  value:       EXAMPLES["simple-select"],
  extraKeys: {
    "Ctrl-Enter": convert,
    "Cmd-Enter":  convert,
  },
});

const honeyEditor = CodeMirror(document.getElementById("honeysql-editor"), {
  mode:        "text/x-clojure",
  theme:       "material-darker",
  lineNumbers: true,
  readOnly:    true,
  value:       "",
  cursorBlinkRate: -1, // hide cursor in read-only
});

/* ── Output Views (Data map | Helpers) ───────────────────────────────────── */
const VIEWS = ["map", "helpers"];
const VIEW_STORAGE_KEY = "nectar-sql:view";
const tabs = document.querySelectorAll('[role="tab"]');

// The latest output for each view; the editor shows the active one.
let outputs = { map: "", helpers: "" };
let currentView = initialView();

function initialView() {
  const fromUrl = new URLSearchParams(window.location.search).get("view");
  if (VIEWS.includes(fromUrl)) return fromUrl;
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (VIEWS.includes(stored)) return stored;
  } catch (_) {
    // storage unavailable (private mode, blocked site data) — use the default
  }
  return "map";
}

function renderOutput() {
  honeyEditor.setValue(outputs[currentView]);
}

function setView(view) {
  currentView = view;

  tabs.forEach((tab) => {
    const selected = tab.dataset.view === view;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected) {
      document.getElementById("honeysql-editor").setAttribute("aria-labelledby", tab.id);
    }
  });

  // `?view=helpers` makes shared links open on the same tab. The SQL stays in
  // the hash, so links from before the tabs existed still work.
  const url = new URL(window.location.href);
  if (view === "map") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  history.replaceState(null, "", url);

  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch (_) {
    // storage unavailable — the URL still carries the view
  }

  renderOutput();
}

tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
  // Arrow keys move between tabs, per the WAI-ARIA tabs pattern
  tab.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    setView(next.dataset.view);
    next.focus();
  });
});

/* ── Conversion ──────────────────────────────────────────────────────────── */
async function convert() {
  const sql = sqlEditor.getValue().trim();
  if (!sql) return;

  const outputPane = document.getElementById("honeysql-editor").closest(".pane");
  const convertBtn = document.getElementById("convert-btn");

  convertBtn.textContent = "Converting…";
  convertBtn.disabled = true;
  outputPane.classList.remove("has-error");

  try {
    const res = await fetch("/api/convert", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ sql }),
    });

    const data = await res.json();

    if (res.ok) {
      outputs = {
        map:     data.honeysql,
        helpers: data.helpers ?? ";; Helper output isn't available",
      };
      renderOutput();
      // Shareable link via URL hash
      window.location.hash = encodeURIComponent(sql);
    } else {
      outputPane.classList.add("has-error");
      const message = `;; Error\n;; ${data.error}`;
      outputs = { map: message, helpers: message };
      renderOutput();
      window.location.hash = "";
    }
  } catch (err) {
    outputPane.classList.add("has-error");
    const message = `;; Network error\n;; ${err.message}`;
    outputs = { map: message, helpers: message };
    renderOutput();
  } finally {
    convertBtn.innerHTML = "Convert <kbd>⌘↵</kbd>";
    convertBtn.disabled = false;
  }
}

/* ── Shareable Links ─────────────────────────────────────────────────────── */
function loadFromHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  try {
    const sql = decodeURIComponent(hash);
    sqlEditor.setValue(sql);
    convert();
  } catch (_) {
    // malformed hash — ignore
  }
}

/* ── Examples Dropdown ───────────────────────────────────────────────────── */
document.getElementById("examples").addEventListener("change", (e) => {
  const key = e.target.value;
  if (!key) return;
  sqlEditor.setValue(EXAMPLES[key]);
  e.target.value = ""; // reset dropdown
  sqlEditor.focus();
});

/* ── Convert Button ──────────────────────────────────────────────────────── */
document.getElementById("convert-btn").addEventListener("click", convert);

/* ── Copy Button ─────────────────────────────────────────────────────────── */
document.getElementById("copy-btn").addEventListener("click", () => {
  const text = honeyEditor.getValue();
  if (!text) return;

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("copy-btn");
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = "Copy";
      btn.classList.remove("copied");
    }, 1500);
  });
});

/* ── Library version ─────────────────────────────────────────────────────── */
fetch("/health")
  .then((r) => r.json())
  .then((data) => {
    const v = data["nectar-sql-version"];
    if (v) document.getElementById("lib-version").textContent = `v${v}`;
  })
  .catch(() => {});

/* ── Init ────────────────────────────────────────────────────────────────── */
setView(currentView);
window.addEventListener("load", loadFromHash);
