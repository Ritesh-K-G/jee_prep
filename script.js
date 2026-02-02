const DB_BASE = "https://jee-prep-464d2-default-rtdb.firebaseio.com";

/**
 * showToast(message, timeout = 3000, type = 'info')
 * type can be: 'success', 'error', 'info'
 */
function showToast(message, timeout = 3000, type = 'info') {
  const container = document.getElementById('toasts');
  if (!container) { console.warn('Toast container not found, falling back to alert'); alert(message); return; }

  const item = document.createElement('div');
  item.className = `toast-item ${type}`;

  const icon = document.createElement('div');
  icon.className = 'toast-icon';
  icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';

  const body = document.createElement('div');
  body.className = 'toast-body';
  const title = document.createElement('div');
  title.className = 'toast-title';
  title.textContent = type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Info';
  const text = document.createElement('div');
  text.className = 'toast-text';
  text.textContent = message;

  body.appendChild(title);
  body.appendChild(text);
  item.appendChild(icon);
  item.appendChild(body);

  // add a close button
  const close = document.createElement('button');
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '✕';
  close.style.background = 'transparent';
  close.style.border = 'none';
  close.style.color = 'rgba(255,255,255,0.6)';
  close.style.cursor = 'pointer';
  close.style.fontSize = '14px';
  close.addEventListener('click', () => {
    container.removeChild(item);
  });
  item.appendChild(close);

  container.appendChild(item);

  // auto remove
  const to = setTimeout(() => {
    if (container.contains(item)) container.removeChild(item);
  }, timeout);

  // remove earlier if clicked anywhere on the item
  item.addEventListener('click', (e) => {
    if (e.target === close) return; // close handled separately
    clearTimeout(to);
    if (container.contains(item)) container.removeChild(item);
  });
}

document.getElementById("date").value =
  new Date().toISOString().slice(0, 10);

async function loadChapters() {
  const res = await fetch(`${DB_BASE}/chapters.json`);
  const chapters = await res.json();

  const container = document.getElementById("subjects-container");
  // Build collapsible sections for each subject. Math/Physics/Chemistry will be collapsible by default.
  Object.entries(chapters).forEach(([subject, units]) => {
    const sect = document.createElement('div');
    sect.className = 'subject';

    // Header with a clear chevron button, chapter count and a hint
    const header = document.createElement('div');
    header.className = 'subject-header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');

    const chapterCount = Object.keys(units).length;
    header.innerHTML = `
      <div class="subject-header-left">
        <h2>${capitalize(subject)}</h2>
        <span class="chapter-count">${chapterCount} chapters</span>
      </div>
      <div class="subject-header-right">
        <span class="hint">Click to expand</span>
        <button class="chev" aria-expanded="false" aria-label="Toggle ${capitalize(subject)}">▸</button>
      </div>
    `;

    // Body contains the table
    const body = document.createElement('div');
    body.className = 'subject-body';

    const table = document.createElement('table');
    table.innerHTML = `
      <thead>
        <tr>
          <th>Chapter</th>
          <th>Total</th>
          <th>Correct</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement('tbody');
    Object.entries(units).forEach(([id, name]) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-id', id);
      tr.innerHTML = `
        <td>${name}</td>
        <td><input type="number" min="0"></td>
        <td><input type="number" min="0"></td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    body.appendChild(table);

    sect.appendChild(header);
    sect.appendChild(body);
    container.appendChild(sect);

    // Collapse behavior: default expanded for core subjects
    const chevron = header.querySelector('.chev');
    const hint = header.querySelector('.hint');
    const core = ['maths','math','physics','chemistry','chem'];
    const key = subject.toLowerCase();
    const isCore = core.some(k => key.includes(k));

    if (isCore) {
      body.classList.add('expanded');
      chevron.classList.add('open');
      chevron.setAttribute('aria-expanded', 'true');
      header.setAttribute('aria-expanded', 'true');
      hint.textContent = 'Click to collapse';
    } else {
      body.classList.add('collapsed');
    }

    function toggleSection() {
      const open = body.classList.contains('expanded');
      if (open) {
        body.classList.remove('expanded');
        body.classList.add('collapsed');
        chevron.classList.remove('open');
        chevron.setAttribute('aria-expanded', 'false');
        header.setAttribute('aria-expanded', 'false');
        hint.textContent = 'Click to expand';
      } else {
        body.classList.remove('collapsed');
        body.classList.add('expanded');
        chevron.classList.add('open');
        chevron.setAttribute('aria-expanded', 'true');
        header.setAttribute('aria-expanded', 'true');
        hint.textContent = 'Click to collapse';
      }
    }

    header.addEventListener('click', toggleSection);
    // keyboard accessibility: Enter or Space to toggle
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSection();
      }
    });
    // also make the chevron button clickable (prevents double-handling)
    chevron.addEventListener('click', (ev) => { ev.stopPropagation(); toggleSection(); });
  });
}

async function saveDay() {
  const date = document.getElementById("date").value;
  const score = Number(document.getElementById("score").value);

  if (!date || !score) {
    showToast("Please enter date and score");
    return;
  }

  const chapterData = {};

  document.querySelectorAll("tr[data-id]").forEach(row => {
    const id = row.dataset.id;
    const total = Number(row.children[1].children[0].value);
    const correct = Number(row.children[2].children[0].value);

    if (total > 0) {
      chapterData[id] = { total, correct };
    }
  });

  await fetch(`${DB_BASE}/days/${date}.json`, {
    method: "PUT",
    body: JSON.stringify({
      score,
      chapters: chapterData
    })
  });

  showToast("Saved successfully ✅");
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

loadChapters();
