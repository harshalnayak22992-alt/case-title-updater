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
const clearNotesBtn = document.getElementById('clearNotesBtn');
const warningEl = document.getElementById('warning');
const dateWarning = document.getElementById('dateWarning');

// Set default date to today
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
const todayString = `${yyyy}-${mm}-${dd}`;
dateInput.value = todayString;

// Disable past dates
dateInput.setAttribute('min', todayString);

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

// Extract NC date from internal title
// Matches patterns like "NC: 15-July", "NC: 15-Jul", or "NC: 15/7" etc.
function extractNCDate(text) {
  if (!text) return null;
  
  // Pattern to match NC: followed by date info
  // Matches: NC: DD-MonthName or NC: D-MonthName (case insensitive)
  const ncRegex = /NC:\s*(\d{1,2})-([A-Za-z]+)/i;
  const match = text.match(ncRegex);
  
  if (match) {
    const day = match[1];
    const monthStr = match[2].toLowerCase();
    
    // Find month index
    const monthIndex = monthNames.findIndex(m => m.toLowerCase().startsWith(monthStr));
    if (monthIndex !== -1) {
      // Create date for this year
      const ncDate = new Date(yyyy, monthIndex, parseInt(day));
      
      // Verify the date is valid (e.g., not April 31)
      if (ncDate.getDate() === parseInt(day)) {
        return ncDate;
      }
    }
  }
  
  return null;
}

// Check if date is in the past
function isDateInPast(date) {
  if (!date) return false;
  
  // Create today's date at midnight for comparison
  const todayMidnight = new Date(yyyy, today.getMonth(), today.getDate());
  
  // If date is before today, it's in the past
  return date < todayMidnight;
}

// Convert Date object to YYYY-MM-DD string
function dateToInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Update warning visibility and control state based on date
function updateDateWarningAndControls() {
  const selectedDateStr = dateInput.value;
  
  if (!selectedDateStr) {
    dateWarning.style.display = 'none';
    enableControls();
    return;
  }
  
  const selectedDate = new Date(selectedDateStr + 'T00:00:00');
  const isPast = isDateInPast(selectedDate);
  
  if (isPast) {
    dateWarning.style.display = 'block';
    applyBtn.disabled = true;
    copyBtn.disabled = true;
    previewBtn.disabled = false; // Allow preview to see what would be generated
  } else {
    dateWarning.style.display = 'none';
    enableControls();
  }
}

// Helper to extract text after NC: date
function extractNotesAfterNC(text) {
  // Match NC: followed by content (date), and capture everything after it
  const ncRegex = /NC:\s*[^\|]+(?:\|(.*))?$/i;
  const m = text.match(ncRegex);
  if (m && m[1]) {
    return m[1].trim();
  }
  return '';
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

// Compute preview - simplified logic without preserveRest
async function computePreviewOnPage(code, def, selectedDate, notes) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found');

  const resp = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (selector, code, def, selectedDate, notes, allCodes, monthNamesArray) => {
      const codePattern = Object.keys(allCodes).map(c => c.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('|');
      const allCodesRegex = new RegExp('(' + codePattern + ')(?:\\s*(?:[\\-:\\|–—]+\\s*)?)', 'gi');

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

      let ncString = null;
      if (selectedDate && selectedDate.trim()) {
        const d = new Date(selectedDate + 'T00:00:00');
        const day = String(d.getDate()).padStart(2, '0');
        const month = monthNamesArray[d.getMonth()];
        ncString = 'NC: ' + day + '-' + month;
      }

      // Build: code | ncString (if present) | notes (if present)
      const parts = [code];
      if (ncString) parts.push(ncString);
      if (notes && notes.trim()) parts.push(notes.trim());
      
      // If we have nc + no notes, ensure trailing pipe
      let newValue;
      if (ncString && !notes) {
        newValue = parts.join(' | ') + ' | ';
      } else {
        newValue = parts.join(' | ');
      }

      return { success: true, preview: newValue, original: current };
    },
    args: [INTERNAL_TITLE_SELECTOR, code, def, selectedDate, notes, mapping, monthNames]
  });

  return resp?.[0]?.result;
}

// Apply changes - simplified logic without preserveRest
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

      const codePattern = Object.keys(allCodes).map(c => c.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('|');
      const allCodesRegex = new RegExp('(' + codePattern + ')(?:\\s*(?:[\\-:\\|–—]+\\s*)?)', 'gi');

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

        let ncString = null;
        if (selectedDate && selectedDate.trim()) {
          const d = new Date(selectedDate + 'T00:00:00');
          const day = String(d.getDate()).padStart(2, '0');
          const month = monthNamesArray[d.getMonth()];
          ncString = 'NC: ' + day + '-' + month;
        }

        // Build: code | ncString (if present) | notes (if present)
        const parts = [code];
        if (ncString) parts.push(ncString);
        if (notes && notes.trim()) parts.push(notes.trim());
        
        // If we have nc + no notes, ensure trailing pipe
        let newValue;
        if (ncString && !notes) {
          newValue = parts.join(' | ') + ' | ';
        } else {
          newValue = parts.join(' | ');
        }

        applyToElement(el, newValue);
        modified++;
      });

      return { success: true, modified };
    },
    args: [INTERNAL_TITLE_SELECTOR, code, def, selectedDate, notes, mapping, monthNames]
  });

  return resp?.[0]?.result;
}

// Initialization: check URL and try to read current internal title + detect code
async function init() {
  // disable controls until we validate
  disableControls();
  warningEl.style.display = 'none';
  dateWarning.style.display = 'none';
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

    // Extract NC date from current title and auto-populate date field
    const extractedNCDate = extractNCDate(currentTitle);
    if (extractedNCDate) {
      const dateString = dateToInputValue(extractedNCDate);
      dateInput.value = dateString;
      
      // Check if it's in the past and show warning
      if (isDateInPast(extractedNCDate)) {
        dateWarning.style.display = 'block';
        applyBtn.disabled = true;
        copyBtn.disabled = true;
        previewBtn.disabled = false;
        showStatus('⚠️ NC date is in the past');
      }
    }

    // Extract and auto-populate notes from existing title
    const extractedNotes = extractNotesAfterNC(currentTitle);
    if (extractedNotes) {
      notesInput.value = extractedNotes;
    }

    // enable controls (if not already disabled due to past date)
    warningEl.style.display = 'none';
    if (!dateWarning.style.display || dateWarning.style.display === 'none') {
      enableControls();
    }

    // initialize preview box with current title's preview (if desired)
    // We'll compute preview for the currently selected code and current date selection
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

// Standard preview/apply/copy handlers
applyBtn.addEventListener('click', async () => {
  // Check if date is in past before applying
  const selectedDateStr = dateInput.value;
  if (selectedDateStr) {
    const selectedDate = new Date(selectedDateStr + 'T00:00:00');
    if (isDateInPast(selectedDate)) {
      showStatus('Error: Next contact date is in the past', true);
      return;
    }
  }

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

copyBtn.addEventListener('click', async () => {
  // Check if date is in past before copying
  const selectedDateStr = dateInput.value;
  if (selectedDateStr) {
    const selectedDate = new Date(selectedDateStr + 'T00:00:00');
    if (isDateInPast(selectedDate)) {
      showStatus('Error: Next contact date is in the past', true);
      return;
    }
  }

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

clearNotesBtn.addEventListener('click', () => {
  notesInput.value = '';
  showStatus('Additional notes cleared');
  // Update preview after clearing
  try {
    const code = codeSelect.value;
    const def = mapping[code];
    const selectedDate = dateInput.value || '';
    const notes = notesInput.value || '';
    computePreviewOnPage(code, def, selectedDate, notes).then(res => {
      if (res && res.success) previewBox.value = res.preview || '';
    }).catch(e => { /* ignore */ });
  } catch (e) { /* ignore */ }
});

// When user manually changes codeSelect, update preview (nice UX)
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

// When date changes, check for past date and update preview
dateInput.addEventListener('change', async () => {
  updateDateWarningAndControls();
  
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

// Run init on load
document.addEventListener('DOMContentLoaded', init);
