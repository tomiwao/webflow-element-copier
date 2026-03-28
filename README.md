# Element to Webflow

A Chrome extension that lets you copy any element from any website and paste it directly into Webflow Designer with styles preserved.

## Features

- **Visual Element Picker**: Click any element on any page to select it
- **Full Subtree Capture**: Copies the element and all its children
- **Computed Style Extraction**: Captures the actual rendered styles, not just class definitions
- **Webflow-Compatible Output**: Generates JSON in Webflow's native clipboard format
- **Keyboard Navigation**: Use arrow keys to navigate to parent/child elements

## Installation

### From Source (Developer Mode)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked**
5. Select the `webflow-element-copier` folder
6. The extension icon should appear in your toolbar

## Usage

### Step 1: Select an Element

1. Navigate to any website with elements you want to copy
2. Click the extension icon in your toolbar
3. Click **"Select Element"**
4. The page will enter selection mode:
   - Hover over elements to highlight them
   - Click to select an element
   - Use **↑** arrow to select parent element
   - Use **↓** arrow to select child element
   - Press **Esc** to cancel

### Step 2: Copy for Webflow

1. After selecting, click the extension icon again
2. Click **"Copy for Webflow"**
3. The element is now in your clipboard in Webflow's format

### Step 3: Paste in Webflow

1. Open Webflow Designer
2. Click anywhere on the canvas
3. Press **Ctrl+V** (Windows) or **Cmd+V** (Mac)
4. The element will appear with styles preserved!

## How It Works

### Style Extraction

The extension uses `window.getComputedStyle()` to capture the **actual rendered styles** of each element. This means:

- Cascaded styles from multiple CSS rules are combined
- Inherited styles are captured
- Media query states are respected
- Browser-computed values are used

### Webflow JSON Format

The output follows Webflow's `@webflow/XscpData` format:

```json
{
  "type": "@webflow/XscpData",
  "payload": {
    "nodes": [...],     // Element hierarchy
    "styles": [...],    // Class definitions
    "assets": [],       // Images/files (URLs referenced)
    "ix1": [],          // Legacy interactions
    "ix2": {...}        // Interactions 2.0
  }
}
```

## Limitations

### Known Limitations

1. **Images**: Image sources reference original URLs. You may need to re-upload images to Webflow.

2. **Custom Fonts**: If the source site uses fonts not available in Webflow, they'll fall back to system fonts.

3. **JavaScript Interactions**: Hover effects, animations, and other JS-driven interactions are not captured. You'll need to recreate them using Webflow Interactions.

4. **Pseudo-elements**: `::before` and `::after` content is not captured (Webflow doesn't support direct CSS pseudo-elements).

5. **CSS Variables**: Custom properties (CSS variables) are resolved to their computed values, not preserved as variables.

6. **Complex Layouts**: Some advanced CSS Grid or Flexbox layouts may need minor adjustments in Webflow.

### What Works Well

- Basic layout (flexbox, positioning)
- Typography (fonts, sizes, colors, spacing)
- Backgrounds (colors, gradients, images)
- Borders and border-radius
- Box shadows
- Opacity and visibility
- Basic transforms

## Troubleshooting

### "Cannot access this page"
- The extension can't run on `chrome://` pages, the Chrome Web Store, or other restricted pages
- Try on a regular website

### "Refresh page and try again"
- The content script didn't load properly
- Refresh the page and try again

### Styles don't look right in Webflow
- Some CSS properties don't have Webflow equivalents
- Complex animations need to be recreated manually
- Try adjusting the element in Webflow Designer

### Copy doesn't work
- Make sure you've selected an element first
- Try refreshing the page
- Check Chrome's console for errors

## Development

### Project Structure

```
webflow-element-copier/
├── manifest.json      # Extension manifest (V3)
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic
├── content.js         # Main content script (selection + conversion)
├── content.css        # Selection overlay styles
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### Key Files

- **content.js**: Contains the element picker, style extractor, and Webflow JSON generator
- **popup.js**: Handles UI state and communication with content script

### Building

No build step required - the extension runs directly from source.

## License

MIT License - feel free to modify and distribute.

## Credits

- Webflow clipboard format research from the Webflow community
- Finsweet's CopyJSONButton implementation reference
- Luca Mlakar's component library tutorial
