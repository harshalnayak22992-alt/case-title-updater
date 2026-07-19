// Hardcoded selector for Dynamics 365 Internal Title field
const INTERNAL_TITLE_SELECTOR = 'textarea[aria-label="Internal title"]';

// Mapping of codes → definitions (from your list)
const mapping = {
  "WOSE": "Waiting on Support Engineer/troubleshooting",
  "WOCC": "Waiting on customer confirmation",
  "WBUG": "Pending Bug",
  "WICM": "Pending ICM",
  "WOCT": "Waiting on Customer information",
  "RTCL": "Ready to Close",
  "WSEE": "Waiting on SEE",
  "WOEE": "Waiting on EE",
  "UNRC": "Unresponsive Customer",
  "UNSU": "Unsupported scenario/out of scope",
  "DUPL": "Duplicate case",
  "WCOL": "Awaiting collaboration",
  "TRNF": "Transferred to other MS team",
  "WOTA": "Waiting on Technical Advisor",
  "MOTR": "Case on Monitoring",
  "TREC": "Pending technical Recovery",
  "MREC": "Pending manager Recovery",
  "WPTA": "Waiting on PTL"
};

// Month names
const monthNames = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const codeSelect = document.getElementById('codeSelect');
const dateInput = document.getElementById('dateInput');
const notesInput = document.getElementById('notesInput');
const applyBtn = document.getElementById('apply');
const previewBtn = document.getElementById('preview');
const status = document.getElementById('status');
const previewBox = document.getElementById('previewBox');
const copyBtn = document.getElementById('copyBtn');
const warningEl = document.getElementById('warning');

// Set default date to today
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
dateInput.value = `${yyyy}-${mm}-${dd}`;

// Disable past dates
dateInput.setAttribute('min', `${yyyy}-${mm}-${dd}`);

// Populate dropdown
Object.entries(mapping).forEach(([code, def]) => {
  const opt = document.createElement('option');
  opt.value = code;
  opt.textContent = `${code} — ${def}`;
  codeSelect.appendChild(opt);
});

function showStatus(msg, isError = false) {
  status.textContent = msg;
  status.style.color = isError ? '#a00' : '#060';
}

function disableControls() {
  previewBtn.disabled = true;
  applyBtn.disabled = true;
  copyBtn.disabled = true;
}

function enableControls() {
  previewBtn.disabled = false;
  applyBtn.disabled = false;
  copyBtn.disabled = false;
}

// Helper to extract NC token from a text (robust to missing pipe)
function extractNCToken(text) {
  // Match NC: followed by content, with or without trailing pipe
  const ncRegex = /NC:\s*([^\|]+?)(?:\s*\||\s*$)/i;
  const m = text.match(ncRegex);
  if (!m) return null;
  const val = m[1].trim();
  return 'NC: ' + val;
}

// Find known code in a title string (prefer code near start)
function findCodeInText(text) {
  if (!text) return null;
  const keys = Object.keys(mapping).map(k => k.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'));
  const codePattern = keys.join('|');
  // match either at start or after a separator/space
  const regex = new RegExp('(?:^|[\\s\\|\\-:–—])(' + codePattern + ')(?:\\s*(?:[\\-:\\|–—]+\\s*)?)','i');
  const m = text.match(regex);
  if (m && m[1]) return m[1].toUpperCase();
  return null;
}

// Compute preview (now includes notes parameter)
async function computePreviewOnPage(code, def, preserveRest, selectedDate, notes) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found');

  const resp = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (selector, code, def, preserveRest, selectedDate, notes, allCodes, monthNamesArray) => {
      const codePattern = Object.keys(allCodes).map(c => c.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('|');
      const allCodesRegex = new RegExp('(' + codePattern + ')(?:\\s*(?:[\\-:\\|–—]+\\s*)?)', 'gi');

      function extractNC(text) {
        // Robust to missing pipe
        const ncRegex = /NC:\s*([^\|]+?)(?:\s*\||\s*$)/i;
        const m = text.match(ncRegex);
        if (!m) return null;
        return 'NC: ' + m[1].trim();
      }

      let els;
      try {
        els = Array.from(document.querySelectorAll(selector));
      } catch (e) {
        return { success: false, error: 'Invalid selector: ' + e.message };
      }
      if (!els.length) return { success: false, error: 'Internal title field not found on this page' };

      const el = els[0];
      const isInput = ('value' in el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.isContentEditable;
      const current = isInput ? (el.value || '') : (el.textContent || '');

      const existingNC = extractNC(current);

      // Clean content: remove codes, NC strings, and separators
      let cleanContent = current
        .replace(allCodesRegex, '')
        .replace(/NC:\s*[^\|]+(?:\||$)/gi, '')
        .replace(/^\s*[\|\-:\–—]+\s*/, '')
        .replace(/\s*[\|\-:\–—]+\s*$/, '')
        .replace(/\|\s*\|/g, '|')
        .replace(/\s+\|\s+/g, ' | ')
        .trim();

      let ncString = null;
      if (selectedDate && selectedDate.trim()) {
        const d = new Date(selectedDate + 'T00:00:00');
        const day = String(d.getDate()).padStart(2, '0');
        const month = monthNamesArray[d.getMonth()];
        ncString = 'NC: ' + day + '-' + month;
      } else if (!selectedDate || !selectedDate.trim()) {
        if (preserveRest && existingNC) {
          ncString = existingNC;
        }
      }

      let newValue;
      if (preserveRest) {
        // Build: code | ncString (if present) | cleanContent (if present) | notes (if present)
        const parts = [code];
        if (ncString) parts.push(ncString);
        if (cleanContent) parts.push(cleanContent);
        if (notes && notes.trim()) parts.push(notes.trim());
        
        // If we have nc + no notes + no cleanContent, ensure trailing pipe
        if (ncString && !cleanContent && !notes) {
          newValue = parts.join(' | ') + ' | ';
        } else {
          newValue = parts.join(' | ');
        }
      } else {
        // Build: code | ncString (if present) | notes (if present)
        const parts = [code];
        if (ncString) parts.push(ncString);
        if (notes && notes.trim()) parts.push(notes.trim());
        
        // If we have nc + no notes, ensure trailing pipe
        if (ncString && !notes) {
          newValue = parts.join(' | ') + ' | ';
        } else {
          newValue = parts.join(' | ');
        }
      }

      return { success: true, preview: newValue, original: current };
    },
    args: [INTERNAL_TITLE_SELECTOR, code, def, preserveRest, selectedDate, notes, mapping, monthNames]
  });

  return resp?.[0]?.result;
}

// Apply changes (now includes notes parameter)
async function applyUpdateOnPage(code, def, preserveRest, selectedDate, notes) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found');

  const resp = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (selector, code, def, preserveRest, selectedDate, notes, allCodes, monthNamesArray) => {
      function applyToElement(el, newValue) {
        const isInput = ('value' in el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.isContentEditable;
        if (isInput) {
          el.value = newValue;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (el.isContentEditable) {
          el.textContent = newValue;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          el.textContent = newValue;
        }
      }

      const codePattern = Object.keys(allCodes).map(c => c.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('|');
      const allCodesRegex = new RegExp('(' + codePattern + ')(?:\\s*(?:[\\-:\\|–—]+\\s*)?)', 'gi');

      function extractNC(text) {
        // Robust to missing pipe
        const ncRegex = /NC:\s*([^\|]+?)(?:\s*\||\s*$)/i;
        const m = text.match(ncRegex);
        if (!m) return null;
        return 'NC: ' + m[1].trim();
      }

      let els;
      try {
        els = Array.from(document.querySelectorAll(selector));
      } catch (e) {
        return { success: false, error: 'Invalid selector: ' + e.message };
      }
      if (!els.length) return { success: false, error: 'Internal title field not found on this page' };

      let modified = 0;
      els.forEach(el => {
        const isInput = ('value' in el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.isContentEditable;
        const current = isInput ? (el.value || '') : (el.textContent || '');

        const existingNC = extractNC(current);

        // Clean content: remove codes, NC strings, and separators
        let cleanContent = current
          .replace(allCodesRegex, '')
          .replace(/NC:\s*[^\|]+(?:\||$)/gi, '')
          .replace(/^\s*[\|\-:\–—]+\s*/, '')
          .replace(/\s*[\|\-:\–—]+\s*$/, '')
          .replace(/\|\s*\|/g, '|')
          .replace(/\s+\|\s+/g, ' | ')
          .trim();

        let ncString = null;
        if (selectedDate && selectedDate.trim()) {
          const d = new Date(selectedDate + 'T00:00:00');
          const day = String(d.getDate()).padStart(2, '0');
          const month = monthNamesArray[d.getMonth()];
          ncString = 'NC: ' + day + '-' + month;
        } else if (!selectedDate || !selectedDate.trim()) {
          if (preserveRest && existingNC) {
            ncString = existingNC;
          }
        }

        let newValue;
        if (preserveRest) {
          // Build: code | ncString (if present) | cleanContent (if present) | notes (if present)
          const parts = [code];
          if (ncString) parts.push(ncString);
          if (cleanContent) parts.push(cleanContent);
          if (notes && notes.trim()) parts.push(notes.trim());
          
          // If we have nc + no notes + no cleanContent, ensure trailing pipe
          if (ncString && !cleanContent && !notes) {
            newValue = parts.join(' | ') + ' | ';
          } else {
            newValue = parts.join(' | ');
          }
        } else {
          // Build: code | ncString (if present) | notes (if present)
          const parts = [code];
          if (ncString) parts.push(ncString);
          if (notes && notes.trim()) parts.push(notes.trim());
          
          // If we have nc + no notes, ensure trailing pipe
          if (ncString && !notes) {
            newValue = parts.join(' | ') + ' | ';
          } else {
            newValue = parts.join(' | ');
          }
        }

        applyToElement(el, newValue);
        modified++;
      });

      return { success: true, modified };
    },
    args: [INTERNAL_TITLE_SELECTOR, code, def, preserveRest, selectedDate, notes, mapping, monthNames]
  });

  return resp?.[0]?.result;
}

// Initialization: check URL and try to read current internal title + detect code
async function init() {
  // disable controls until we validate
  disableControls();
  warningEl.style.display = 'none';
  showStatus('');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    showStatus('No active tab', true);
    warningEl.style.display = 'block';
    warningEl.textContent = 'Cannot detect DFM';
    return;
  }

  const url = tab.url;
  const allowed1 = 'https://onesupport.crm.dynamics.com/main.aspx';
  const allowed2 = 'https://eudfm.crm4.dynamics.com/main.aspx';
  if (!(url.startsWith(allowed1) || url.startsWith(allowed2))) {
    // Not one of the allowed main.aspx pages
    warningEl.style.display = 'block';
    warningEl.textContent = 'Cannot detect DFM';
    showStatus('Extension only runs on the designated Dynamics pages', true);
    return;
  }

  // Try to read the internal title value from the page
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (selector) => {
        try {
          const el = document.querySelector(selector);
          if (!el) return { found: false };
          const isInput = ('value' in el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.isContentEditable;
          const value = isInput ? (el.value || '') : (el.textContent || '');
          return { found: true, value };
        } catch (e) {
          return { found: false, error: e.message };
        }
      },
      args: [INTERNAL_TITLE_SELECTOR]
    });

    const result = res?.[0]?.result;
    if (!result || !result.found) {
      showStatus('Internal title field not found on this page', true);
      warningEl.style.display = 'block';
      warningEl.textContent = 'Cannot detect DFM';
      return;
    }

    const currentTitle = result.value || '';
    // detect code
    const detectedCode = findCodeInText(currentTitle);
    if (detectedCode && Array.from(codeSelect.options).some(o => o.value === detectedCode)) {
      codeSelect.value = detectedCode;
      showStatus('Detected code: ' + detectedCode);
    } else {
      // leave default first option
      codeSelect.selectedIndex = 0;
      showStatus('No known code detected in title (default selected)');
    }

    // enable controls now that detection succeeded
    warningEl.style.display = 'none';
    enableControls();

    // initialize preview box with current title's preview (if desired)
    // We'll compute preview for the currently selected code and current date selection
    try {
      const code = codeSelect.value;
      const def = mapping[code];
      const preserve = document.getElementById('preserveRest').checked;
      const selectedDate = dateInput.value || '';
      const notes = notesInput.value || '';
      const p = await computePreviewOnPage(code, def, preserve, selectedDate, notes);
      if (p && p.success) previewBox.value = p.preview;
    } catch (e) {
      // ignore preview init errors
    }
  } catch (err) {
    showStatus('Failed to read page: ' + err.message, true);
    warningEl.style.display = 'block';
    warningEl.textContent = 'Cannot detect DFM';
    return;
  }
}

// Standard preview/apply/copy handlers
applyBtn.addEventListener('click', async () => {
  showStatus('Applying...');
  const code = codeSelect.value;
  const def = mapping[code];
  const preserve = document.getElementById('preserveRest').checked;
  const selectedDate = dateInput.value || '';
  const notes = notesInput.value || '';

  try {
    const res = await applyUpdateOnPage(code, def, preserve, selectedDate, notes);
    if (!res) {
      showStatus('No response from content script', true);
    } else if (!res.success) {
      showStatus('Error: ' + res.error, true);
    } else {
      showStatus(`Updated ${res.modified} element(s)`);
      // refresh preview after apply
      try {
        const p = await computePreviewOnPage(code, def, preserve, selectedDate, notes);
        if (p && p.success) previewBox.value = p.preview;
      } catch (e) { /* ignore preview refresh errors */ }
    }
  } catch (err) {
    showStatus('Failed: ' + err.message, true);
  }
});

previewBtn.addEventListener('click', async () => {
  showStatus('Computing preview...');
  const code = codeSelect.value;
  const def = mapping[code];
  const preserve = document.getElementById('preserveRest').checked;
  const selectedDate = dateInput.value || '';
  const notes = notesInput.value || '';

  try {
    const res = await computePreviewOnPage(code, def, preserve, selectedDate, notes);
    if (!res) {
      showStatus('No response from page', true);
    } else if (!res.success) {
      showStatus('Error: ' + res.error, true);
      previewBox.value = '';
    } else {
      previewBox.value = res.preview || '';
      showStatus('Preview ready');
    }
  } catch (err) {
    showStatus('Failed: ' + err.message, true);
  }
});

copyBtn.addEventListener('click', async () => {
  const text = previewBox.value || '';
  if (!text) {
    showStatus('Nothing to copy. Generate a preview first.', true);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showStatus('Copied to clipboard');
  } catch (err) {
    // fallback for older browsers: select and execCommand
    try {
      previewBox.select();
      document.execCommand('copy');
      showStatus('Copied to clipboard');
    } catch (e) {
      showStatus('Copy failed: ' + err.message, true);
    }
  }
});

// When user manually changes codeSelect, update preview (nice UX)
codeSelect.addEventListener('change', async () => {
  try {
    const code = codeSelect.value;
    const def = mapping[code];
    const preserve = document.getElementById('preserveRest').checked;
    const selectedDate = dateInput.value || '';
    const notes = notesInput.value || '';
    const res = await computePreviewOnPage(code, def, preserve, selectedDate, notes);
    if (res && res.success) previewBox.value = res.preview || '';
  } catch (e) { /* ignore */ }
});

// When date or notes change, auto-update preview
dateInput.addEventListener('change', async () => {
  try {
    const code = codeSelect.value;
    const def = mapping[code];
    const preserve = document.getElementById('preserveRest').checked;
    const selectedDate = dateInput.value || '';
    const notes = notesInput.value || '';
    const res = await computePreviewOnPage(code, def, preserve, selectedDate, notes);
    if (res && res.success) previewBox.value = res.preview || '';
  } catch (e) { /* ignore */ }
});

notesInput.addEventListener('input', async () => {
  try {
    const code = codeSelect.value;
    const def = mapping[code];
    const preserve = document.getElementById('preserveRest').checked;
    const selectedDate = dateInput.value || '';
    const notes = notesInput.value || '';
    const res = await computePreviewOnPage(code, def, preserve, selectedDate, notes);
    if (res && res.success) previewBox.value = res.preview || '';
  } catch (e) { /* ignore */ }
});

// Run init on load
document.addEventListener('DOMContentLoaded', init);
