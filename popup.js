// Hardcoded selector for Dynamics 365 Internal Title field
const INTERNAL_TITLE_SELECTOR = 'textarea[aria-label="Internal title"]';

// Mapping of codes 1 definitions (from your list)
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
const clearNotesBtn = document.getElementById('clearNotesBtn');
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
  opt.textContent = `${code} 1 ${def}`;
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

// Extract trailing notes: the text after NC if NC exists, otherwise after the code
function extractTrailingNotes(text) {
  if (!text) return '';
  // Look for NC first
  const ncRegex = /NC:\s*([^\|]+?)(?:\s*\||\s*$)/i;
  const ncMatch = ncRegex.exec(text);
  if (ncMatch) {
    const afterIndex = ncMatch.index + ncMatch[0].length;
    let trailing = text.slice(afterIndex);
    // remove separators and whitespace at start
    trailing = trailing.replace(/^[\s\|\-:–—]+/, '').trim();
    return trailing;
  }

  // No NC — try to find code and take everything after it
  const keys = Object.keys(mapping).map(k => k.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'));
  const codePattern = keys.join('|');
  const codeRegex = new RegExp('(?:^|[\\s\\|\\-:–—])(' + codePattern + ')(?:\\s*(?:[\\-:\\|–—]+\\s*)?)','i');
  const codeMatch = codeRegex.exec(text);
  if (codeMatch) {
    const afterIndex = codeMatch.index + codeMatch[0].length;
    let trailing = text.slice(afterIndex);
    trailing = trailing.replace(/^[\s\|\-:–—]+/, '').trim();
    return trailing;
  }

  return '';
}

// Compute preview (no preserveRest behavior anymore)
async function computePreviewOnPage(code, def, selectedDate, notes) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found');

  const resp = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (selector, code, def, selectedDate, notes, allCodes, monthNamesArray) => {
      const codePattern = Object.keys(allCodes).map(c => c.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('|');

      function extractNC(text) {
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

      // Determine NC string based on selectedDate
      let ncString = null;
      if (selectedDate && selectedDate.trim()) {
        const d = new Date(selectedDate + 'T00:00:00');
        const day = String(d.getDate()).padStart(2, '0');
        const month = monthNamesArray[d.getMonth()];
        ncString = 'NC: ' + day + '-' + month;
      }

      // Build: code [| NC] [| notes]
      const parts = [code];
      if (ncString) parts.push(ncString);
      if (notes && notes.trim()) parts.push(notes.trim());

      const newValue = parts.join(' | ');
      return { success: true, preview: newValue, original: current };
    },
    args: [INTERNAL_TITLE_SELECTOR, code, def, selectedDate, notes, mapping, monthNames]
  });

  return resp?.[0]?.result;
}

// Apply changes (no preserveRest)
async function applyUpdateOnPage(code, def, selectedDate, notes) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found');

  const resp = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (selector, code, def, selectedDate, notes, allCodes, monthNamesArray) => {
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

      let els;
      try {
        els = Array.from(document.querySelectorAll(selector));
      } catch (e) {
        return { success: false, error: 'Invalid selector: ' + e.message };
      }
      if (!els.length) return { success: false, error: 'Internal title field not found on this page' };

      // Prepare NC string
      let ncString = null;
      if (selectedDate && selectedDate.trim()) {
        const d = new Date(selectedDate + 'T00:00:00');
        const day = String(d.getDate()).padStart(2, '0');
        const month = monthNamesArray[d.getMonth()];
        ncString = 'NC: ' + day + '-' + month;
      }

      // Construct new title
      const parts = [code];
      if (ncString) parts.push(ncString);
      if (notes && notes.trim()) parts.push(notes.trim());
      const newValue = parts.join(' | ');

      let modified = 0;
      els.forEach(el => {
        applyToElement(el, newValue);
        modified++;
      });

      return { success: true, modified };
    },
    args: [INTERNAL_TITLE_SELECTOR, code, def, selectedDate, notes, mapping, monthNames]
  });

  return resp?.[0]?.result;
}

// Initialization: check URL and try to read current internal title + detect code + auto-populate notes
async function init() {
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
    warningEl.style.display = 'block';
    warningEl.textContent = 'Cannot detect DFM';
    showStatus('Extension only runs on the designated Dynamics pages', true);
    return;
  }

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
      codeSelect.selectedIndex = 0;
      showStatus('No known code detected in title (default selected)');
    }

    // Auto-populate notes from the trailing text after NC or after the code
    const extractedNotes = extractTrailingNotes(currentTitle);
    notesInput.value = extractedNotes;

    // enable controls now that detection succeeded
    warningEl.style.display = 'none';
    enableControls();

    // initialize preview box with current title's preview
    try {
      const code = codeSelect.value;
      const def = mapping[code];
      const selectedDate = dateInput.value || '';
      const notes = notesInput.value || '';
      const p = await computePreviewOnPage(code, def, selectedDate, notes);
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

// Apply handler
applyBtn.addEventListener('click', async () => {
  showStatus('Applying...');
  const code = codeSelect.value;
  const def = mapping[code];
  const selectedDate = dateInput.value || '';
  const notes = notesInput.value || '';

  try {
    const res = await applyUpdateOnPage(code, def, selectedDate, notes);
    if (!res) {
      showStatus('No response from content script', true);
    } else if (!res.success) {
      showStatus('Error: ' + res.error, true);
    } else {
      showStatus(`Updated ${res.modified} element(s)`);
      // refresh preview after apply
      try {
        const p = await computePreviewOnPage(code, def, selectedDate, notes);
        if (p && p.success) previewBox.value = p.preview;
      } catch (e) { /* ignore preview refresh errors */ }
    }
  } catch (err) {
    showStatus('Failed: ' + err.message, true);
  }
});

// Preview handler
previewBtn.addEventListener('click', async () => {
  showStatus('Computing preview...');
  const code = codeSelect.value;
  const def = mapping[code];
  const selectedDate = dateInput.value || '';
  const notes = notesInput.value || '';

  try {
    const res = await computePreviewOnPage(code, def, selectedDate, notes);
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

// Copy handler
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
    try {
      previewBox.select();
      document.execCommand('copy');
      showStatus('Copied to clipboard');
    } catch (e) {
      showStatus('Copy failed: ' + err.message, true);
    }
  }
});

// Recompute preview on control changes
codeSelect.addEventListener('change', async () => {
  try {
    const code = codeSelect.value;
    const def = mapping[code];
    const selectedDate = dateInput.value || '';
    const notes = notesInput.value || '';
    const res = await computePreviewOnPage(code, def, selectedDate, notes);
    if (res && res.success) previewBox.value = res.preview || '';
  } catch (e) { /* ignore */ }
});

dateInput.addEventListener('change', async () => {
  try {
    const code = codeSelect.value;
    const def = mapping[code];
    const selectedDate = dateInput.value || '';
    const notes = notesInput.value || '';
    const res = await computePreviewOnPage(code, def, selectedDate, notes);
    if (res && res.success) previewBox.value = res.preview || '';
  } catch (e) { /* ignore */ }
});

notesInput.addEventListener('input', async () => {
  try {
    const code = codeSelect.value;
    const def = mapping[code];
    const selectedDate = dateInput.value || '';
    const notes = notesInput.value || '';
    const res = await computePreviewOnPage(code, def, selectedDate, notes);
    if (res && res.success) previewBox.value = res.preview || '';
  } catch (e) { /* ignore */ }
});

// Clear notes button
clearNotesBtn.addEventListener('click', async () => {
  notesInput.value = '';
  try {
    const code = codeSelect.value;
    const def = mapping[code];
    const selectedDate = dateInput.value || '';
    const notes = '';
    const res = await computePreviewOnPage(code, def, selectedDate, notes);
    if (res && res.success) previewBox.value = res.preview || '';
    showStatus('Notes cleared');
  } catch (e) { /* ignore */ }
});

// Run init on load
document.addEventListener('DOMContentLoaded', init);
