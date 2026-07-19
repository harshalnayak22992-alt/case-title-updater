# Case Title Updater Extension

A Chrome and Edge browser extension that helps you quickly update case titles by selecting from predefined case codes and their definitions.

## Features

- **Case Code Selection**: Pick from 16 predefined case codes (WBUG, WICM, WPTA, etc.)
- **Preview**: See what the new title will look like before applying
- **Copy to Clipboard**: Copy the generated title to easily paste elsewhere
- **Direct Apply**: Update the page directly with optional save button click
- **Smart Replacement**: Optionally preserve the rest of the title after the case code
- **Cross-Browser**: Works in Chrome and Edge (Chromium-based)

## Supported Case Codes

| Code | Definition |
|------|------------|
| WBUG | Pending Bug |
| WICM | Pending ICM |
| WPTA | Waiting on PTL |
| WSEE | Waiting on MS EE's |
| UNSU | Unsupported scenario/out of scope |
| DUPL | Duplicate case |
| WCOL | Awaiting collaboration |
| TRNF | Transferred to other MS |
| WOCT | Waiting on Customer |
| WOSE | Waiting on Support Engineer |
| WOEE | Waiting on EE |
| WOTA | Waiting on Technical Advisor |
| MOTR | Case on Monitoring |
| UNRC | Unresponsive Customer |
| TREC | Pending technical Recovery |
| MREC | Pending manager Recovery |
| RTCL | Ready to Close |

## How to Install

### Chrome
1. Download and extract the extension folder
2. Open `chrome://extensions`
3. Enable "Developer mode" (top-right)
4. Click "Load unpacked"
5. Select the `case-title-updater` folder

### Microsoft Edge
1. Download and extract the extension folder
2. Open `edge://extensions`
3. Enable "Developer mode" (bottom-left)
4. Click "Load unpacked"
5. Select the `case-title-updater` folder

## How to Use

1. Open the page containing the case title you want to update
2. Click the extension icon in your toolbar
3. **Enter CSS selector**: Specify the element containing the title (e.g., `input[name='title']`, `.case-title`, `#title_field`)
4. **Choose a case code** from the dropdown
5. **(Optional) Preserve rest of title**: Check this to keep any text after the case code
6. **(Optional) Save button selector**: If the page has a save button, enter its selector
7. Click **Preview** to see the result, then **Copy** to copy to clipboard, or click **Apply** to update directly

## Examples

### Example 1: Copy and Paste
1. Enter selector: `input[name='title']`
2. Choose code: `WBUG`
3. Click Preview → see "WBUG - Pending Bug"
4. Click Copy → paste into title field manually

### Example 2: Direct Update with Save
1. Enter selector: `input[name='title']`
2. Choose code: `WOCT`
3. Enter save button selector: `button[type='submit']`
4. Click Apply → updates title to "WOCT - Waiting on Customer" and clicks save

### Example 3: Preserve Rest of Title
1. Current title: "Original issue description"
2. Enter selector: `input[name='title']`
3. Choose code: `DUPL`
4. Check "Replace only leading code (preserve the rest of the title)"
5. Click Apply → becomes "DUPL - Duplicate case Original issue description"

## Permissions

- `scripting` - Execute scripts on web pages
- `activeTab` - Access the current active tab
- `storage` - Store user preferences
- `clipboardWrite` - Copy text to clipboard

## Notes

- The extension currently works on all websites (`<all_urls>`). For production use, this can be restricted to specific domains.
- The extension only modifies the page DOM. Persistence depends on the website's save mechanism.
- If the title field is inside an iframe from a different origin or shadow DOM, the extension may not be able to access it.
