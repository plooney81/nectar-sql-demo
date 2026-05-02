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

  "insert": `INSERT INTO users (name, email, role)
VALUES ('Pete', 'pete@example.com', 'admin')`,
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
      honeyEditor.setValue(data.honeysql);
      // Shareable link via URL hash
      window.location.hash = encodeURIComponent(sql);
    } else {
      outputPane.classList.add("has-error");
      honeyEditor.setValue(`;; Error\n;; ${data.error}`);
      window.location.hash = "";
    }
  } catch (err) {
    outputPane.classList.add("has-error");
    honeyEditor.setValue(`;; Network error\n;; ${err.message}`);
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
window.addEventListener("load", loadFromHash);
