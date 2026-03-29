// Element to Webflow - Content Script
// Handles element selection, style extraction, and Webflow JSON generation

(function() {
  'use strict';

  // State
  let isSelecting = false;
  let selectedElement = null;
  let hoveredElement = null;

  // UI Elements
  let tooltip = null;
  let instructions = null;

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    switch (request.action) {

      case 'ping':
        sendResponse({ ok: true });
        break;

      case 'startSelection':
        startSelection();
        sendResponse({ success: true });
        break;

      case 'getState':
        sendResponse({
          hasSelection: selectedElement !== null,
          data: selectedElement ? getElementSummary(selectedElement) : null
        });
        break;

      case 'copyToWebflow':
        if (selectedElement) {
          try {
            const options = { usePageStyles: request.usePageStyles !== false };
            const json = generateWebflowJSON(selectedElement, options);
            copyToClipboard(json);
            sendResponse({ success: true });
          } catch (error) {
            console.error('Error generating Webflow JSON:', error);
            sendResponse({ success: false, error: error.message });
          }
        } else {
          sendResponse({ success: false, error: 'No element selected' });
        }
        break;

      case 'copyFullPage':
        try {
          const options = { usePageStyles: request.usePageStyles !== false };
          const root = document.querySelector('main') || document.body;
          const json = generateWebflowJSON(root, options);
          copyToClipboard(json);
          sendResponse({ success: true });
        } catch (error) {
          console.error('Error generating full-page Webflow JSON:', error);
          sendResponse({ success: false, error: error.message });
        }
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
    return true;
  });

  // ── Selection UI ─────────────────────────────────────────────────────────

  function startSelection() {
    if (isSelecting) return;
    isSelecting = true;
    document.body.classList.add('etw-selecting');
    showInstructions();
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
  }

  function stopSelection() {
    isSelecting = false;
    document.body.classList.remove('etw-selecting');
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    hideInstructions();
    hideTooltip();
    if (hoveredElement) {
      hoveredElement.classList.remove('etw-highlight');
      hoveredElement = null;
    }
  }

  function handleMouseOver(e) {
    if (!isSelecting) return;
    const target = e.target;
    if (target.classList.contains('etw-tooltip') || target.classList.contains('etw-instructions') ||
        target.closest('.etw-tooltip') || target.closest('.etw-instructions')) return;
    if (hoveredElement && hoveredElement !== target) hoveredElement.classList.remove('etw-highlight');
    hoveredElement = target;
    hoveredElement.classList.add('etw-highlight');
    showTooltip(target, e.clientX, e.clientY);
  }

  function handleMouseOut(e) {
    if (!isSelecting) return;
    if (e.target === hoveredElement) e.target.classList.remove('etw-highlight');
  }

  function handleClick(e) {
    if (!isSelecting) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    if (target.classList.contains('etw-tooltip') || target.classList.contains('etw-instructions') ||
        target.closest('.etw-tooltip') || target.closest('.etw-instructions')) return;
    selectElement(target);
  }

  function handleKeyDown(e) {
    if (!isSelecting) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      stopSelection();
      showToast('Selection cancelled', 'error');
    }
    if (e.key === 'ArrowUp' && hoveredElement && hoveredElement.parentElement) {
      e.preventDefault();
      hoveredElement.classList.remove('etw-highlight');
      hoveredElement = hoveredElement.parentElement;
      hoveredElement.classList.add('etw-highlight');
      updateTooltipContent(hoveredElement);
    }
    if (e.key === 'ArrowDown' && hoveredElement && hoveredElement.firstElementChild) {
      e.preventDefault();
      hoveredElement.classList.remove('etw-highlight');
      hoveredElement = hoveredElement.firstElementChild;
      hoveredElement.classList.add('etw-highlight');
      updateTooltipContent(hoveredElement);
    }
  }

  function selectElement(element) {
    if (selectedElement) selectedElement.classList.remove('etw-selected');
    selectedElement = element;
    selectedElement.classList.remove('etw-highlight');
    selectedElement.classList.add('etw-selected');
    stopSelection();
    try {
      chrome.runtime.sendMessage({
        action: 'elementSelected',
        data: getElementSummary(selectedElement)
      });
      showToast('Element selected! Open extension to copy.', 'success');
    } catch (error) {
      console.error('Error processing element:', error);
      showToast('Error processing element', 'error');
    }
  }

  // ── Summary helpers ───────────────────────────────────────────────────────

  function getElementSummary(element) {
    const classes = Array.from(element.classList).filter(c => !c.startsWith('etw-'));
    return {
      tag: element.tagName.toLowerCase(),
      classes: classes,
      id: element.id || null,
      childCount: element.querySelectorAll('*').length,
      styleCount: countStyles(element)
    };
  }

  function countStyles(element) {
    const styles = new Set();
    [element].concat(Array.from(element.querySelectorAll('*'))).forEach(function(el) {
      Array.from(el.classList).forEach(function(c) { if (!c.startsWith('etw-')) styles.add(c); });
    });
    return styles.size;
  }

  // ── Stylesheet-based CSS extraction ──────────────────────────────────────
  // Longhand properties that Webflow understands in styleLess.
  // Webflow's style engine only accepts longhand properties — shorthands like
  // "padding" or "background" in styleLess crash its parser.
  const RELEVANT_PROPS = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
    'float', 'clear', 'overflow', 'overflow-x', 'overflow-y',
    'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content',
    'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'order', 'gap',
    'grid-template-columns', 'grid-template-rows', 'grid-gap', 'grid-column', 'grid-row',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-right-radius', 'border-bottom-left-radius',
    'background-color', 'background-image', 'background-position',
    'background-size', 'background-repeat', 'background-attachment',
    'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
    'letter-spacing', 'text-align', 'text-decoration', 'text-transform',
    'color', 'white-space', 'word-break', 'word-spacing',
    'opacity', 'box-shadow', 'text-shadow', 'transform', 'filter',
    'cursor', 'visibility', 'object-fit', 'object-position'
  ];

  // Detached element used to expand CSS shorthands → longhands.
  // Applying a rule's cssText here and then reading individual longhands is
  // the only reliable way to get longhand values when the author wrote
  // shorthand (e.g. "padding: 40px" → padding-top/right/bottom/left).
  const _expandEl = document.createElement('div');

  // Walk all stylesheets and build className → [css-string] map.
  function buildClassStyleMap() {
    const map = new Map();
    for (let i = 0; i < document.styleSheets.length; i++) {
      try { walkRules(document.styleSheets[i].cssRules || [], map); }
      catch (e) { /* cross-origin — skip */ }
    }
    return map;
  }

  function walkRules(rules, map) {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (rule.type === 1 /* CSSStyleRule */ && rule.selectorText && rule.style) {
        const css = ruleToSafeCSS(rule.style);
        if (!css) continue;
        rule.selectorText.split(',').forEach(function(sel) {
          sel = sel.trim();
          if (sel.indexOf('::') !== -1) return; // skip pseudo-elements
          // Target = rightmost compound selector after combinators, with pseudo-classes stripped
          const base = sel.split(/[\s>+~]+/).pop().split(':')[0];
          const matches = base.match(/\.(-?[a-zA-Z_][\w-]*)/g);
          if (!matches) return;
          matches.forEach(function(cls) {
            const name = cls.slice(1);
            if (!map.has(name)) map.set(name, []);
            map.get(name).push(css);
          });
        });
      } else if (rule.cssRules) {
        try { walkRules(rule.cssRules, map); } catch (e) {}
      }
    }
  }

  // Convert a CSS rule to a safe, longhand-only string for Webflow's styleLess.
  // Strategy: apply the rule's cssText to a detached element's inline style —
  // the browser expands all shorthands automatically. Then read each longhand
  // from RELEVANT_PROPS. This guarantees only longhands reach Webflow.
  function ruleToSafeCSS(ruleStyle) {
    try {
      _expandEl.style.cssText = '';
      _expandEl.style.cssText = ruleStyle.cssText;
    } catch (e) { return ''; }

    const entries = [];
    for (let i = 0; i < RELEVANT_PROPS.length; i++) {
      const prop  = RELEVANT_PROPS[i];
      const value = _expandEl.style.getPropertyValue(prop);
      if (!value || !value.trim()) continue;
      if (value.indexOf('var(') !== -1) continue;   // unresolved CSS variable
      if (value.indexOf('base64') !== -1) continue;  // embedded image data
      entries.push(prop + ': ' + value.trim());
    }
    return entries.join('; ') + (entries.length > 0 ? ';' : '');
  }

  // Merge multiple CSS strings for the same class; last declaration wins per property.
  function mergeCSS(strings) {
    const propMap = new Map();
    strings.forEach(function(s) {
      s.split(';').forEach(function(decl) {
        decl = decl.trim();
        const colon = decl.indexOf(':');
        if (colon < 0) return;
        const prop = decl.slice(0, colon).trim();
        const val  = decl.slice(colon + 1).trim();
        if (prop && val) propMap.set(prop, val);
      });
    });
    const out = [];
    propMap.forEach(function(v, p) { out.push(p + ': ' + v); });
    return out.join('; ') + (out.length > 0 ? ';' : '');
  }

  // ── Webflow JSON generation ───────────────────────────────────────────────

  function generateWebflowJSON(element, options) {
    options = options || {};
    const nodes  = [];
    const styles = [];
    const styleMap = new Map(); // className → styleId

    // Build stylesheet map once if usePageStyles is on (default true)
    const classStyleMap = (options.usePageStyles !== false) ? buildClassStyleMap() : null;

    processElement(element, null, nodes, styles, styleMap, classStyleMap);

    return JSON.stringify({
      type: '@webflow/XscpData',
      payload: {
        nodes:  nodes,
        styles: styles,
        assets: [],
        ix1: [],
        ix2: { interactions: [], events: [], actionLists: [] }
      }
    });
  }

  // Process one element — children are pushed first, then the parent.
  // This is the order the original working version used; do not change it.
  function processElement(element, parentId, nodes, styles, styleMap, classStyleMap) {
    const nodeId   = generateId();
    const tag      = element.tagName.toLowerCase();
    const childIds = [];

    // Classes (excluding our own)
    const classes  = Array.from(element.classList).filter(c => !c.startsWith('etw-'));
    const classIds = [];

    classes.forEach(function(className) {
      if (!styleMap.has(className)) {
        const styleId = generateId();
        styleMap.set(className, styleId);

        let styleString;
        if (classStyleMap && classStyleMap.has(className)) {
          // Stylesheet path — uses authored CSS (preserves rem/%, handles shorthands)
          styleString = mergeCSS(classStyleMap.get(className));
        } else {
          // Computed-style fallback — strip etw- classes first so the highlight
          // colour doesn't bleed into the captured background-color value
          const etwClasses = Array.from(element.classList).filter(c => c.startsWith('etw-'));
          etwClasses.forEach(c => element.classList.remove(c));
          styleString = extractRelevantStyles(window.getComputedStyle(element));
          etwClasses.forEach(c => element.classList.add(c));
        }

        styles.push({
          _id: styleId,
          fake: false,
          type: 'class',
          name: className,
          namespace: '',
          comb: '',
          styleLess: styleString,
          variants: {},
          children: [],
          createdBy: null,
          selector: null
        });
      }
      classIds.push(styleMap.get(className));
    });

    // Children first (this order is what Webflow expects — do not change)
    Array.from(element.children).forEach(function(child) {
      childIds.push(processElement(child, nodeId, nodes, styles, styleMap, classStyleMap));
    });

    const nodeType = getWebflowNodeType(element);
    const nodeData = buildNodeData(element, tag);

    const node = {
      _id:      nodeId,
      type:     nodeType,
      tag:      tag,
      classes:  classIds,
      children: childIds,
      data:     nodeData
    };

    if (shouldIncludeText(element)) {
      const textContent = getDirectTextContent(element);
      if (textContent) node.v = textContent;
    }

    nodes.push(node);
    return nodeId;
  }

  // ── Node type mapping ─────────────────────────────────────────────────────

  function getWebflowNodeType(element) {
    const tag = element.tagName.toLowerCase();

    // Form-specific types are only valid inside a <form> in Webflow
    const formOnlyTags = { button: 1, input: 1, textarea: 1, select: 1, label: 1 };
    if (formOnlyTags[tag] && !element.closest('form')) return 'Block';

    const typeMap = {
      'img':        'Image',
      'a':          'Link',
      'form':       'FormWrapper',
      'input':      'FormTextInput',
      'textarea':   'FormTextarea',
      'select':     'FormSelect',
      'button':     'FormButton',
      'label':      'FormBlockLabel',
      'h1':         'Heading',
      'h2':         'Heading',
      'h3':         'Heading',
      'h4':         'Heading',
      'h5':         'Heading',
      'h6':         'Heading',
      'p':          'Paragraph',
      'ul':         'List',
      'ol':         'List',
      'li':         'ListItem'
    };

    return typeMap[tag] || 'Block';
  }

  // ── Node data ─────────────────────────────────────────────────────────────

  // Keep data structure identical to the original working version.
  function buildNodeData(element, tag) {
    const data = {
      tag:  tag,
      text: isTextElement(element)
    };

    if (tag === 'img') {
      data.attr = { src: element.src || '', alt: element.alt || '', loading: element.loading || 'lazy' };
    } else if (tag === 'a') {
      data.attr = { href: element.getAttribute('href') || '#' };
      if (element.target) data.attr.target = element.target;
    } else if (tag === 'input') {
      data.attr = { type: element.type || 'text', name: element.name || '', placeholder: element.placeholder || '' };
    }

    if (element.id) {
      data.attr = data.attr || {};
      data.attr.id = element.id;
    }

    const customAttrs = getCustomAttributes(element);
    if (customAttrs.length > 0) data.xattr = customAttrs;

    return data;
  }

  function isTextElement(element) {
    return ['p','h1','h2','h3','h4','h5','h6','span','a','li','label','blockquote']
      .indexOf(element.tagName.toLowerCase()) !== -1;
  }

  function shouldIncludeText(element) {
    return ['p','h1','h2','h3','h4','h5','h6','span','a','li','button','label']
      .indexOf(element.tagName.toLowerCase()) !== -1;
  }

  function getDirectTextContent(element) {
    let text = '';
    element.childNodes.forEach(function(node) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    });
    return text.trim();
  }

  function getCustomAttributes(element) {
    const attrs = [];
    Array.from(element.attributes).forEach(function(attr) {
      if (attr.name.startsWith('data-') && !attr.name.startsWith('data-etw-'))
        attrs.push({ name: attr.name, value: attr.value });
    });
    return attrs;
  }

  // ── Computed-style fallback ───────────────────────────────────────────────
  // Used when stylesheet extraction finds nothing for a class.

  function extractRelevantStyles(computedStyle) {
    const entries = [];
    RELEVANT_PROPS.forEach(function(prop) {
      const value = computedStyle.getPropertyValue(prop);
      if (!value || value === 'none' || value === 'auto' || value === 'normal' ||
          value === '0px' || value === 'rgba(0, 0, 0, 0)' || value === 'transparent') return;
      if (prop === 'display'     && value === 'block')   return;
      if (prop === 'position'    && value === 'static')  return;
      if (prop === 'visibility'  && value === 'visible') return;
      if (prop === 'opacity'     && value === '1')       return;
      if (prop === 'font-weight' && value === '400')     return;
      if (prop === 'font-style'  && value === 'normal')  return;
      entries.push(prop + ': ' + value);
    });

    return entries.join('; ') + (entries.length > 0 ? ';' : '');
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function generateId() {
    return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'.replace(/[x]/g, function() {
      return Math.floor(Math.random() * 16).toString(16);
    });
  }

  function copyToClipboard(jsonString) {
    if (navigator.clipboard && navigator.clipboard.write) {
      const blob = new Blob([jsonString], { type: 'application/json' });
      navigator.clipboard.write([new ClipboardItem({
        'application/json': blob,
        'text/plain': new Blob([jsonString], { type: 'text/plain' })
      })]).catch(function() { fallbackCopy(jsonString); });
    } else {
      fallbackCopy(jsonString);
    }
  }

  function fallbackCopy(jsonString) {
    function copyHandler(e) {
      e.preventDefault();
      e.clipboardData.setData('application/json', jsonString);
      e.clipboardData.setData('text/plain', jsonString);
      document.removeEventListener('copy', copyHandler, true);
    }
    document.addEventListener('copy', copyHandler, true);
    document.execCommand('copy');
  }

  // ── UI: instructions banner ───────────────────────────────────────────────

  function showInstructions() {
    if (instructions) return;
    instructions = document.createElement('div');
    instructions.className = 'etw-instructions';
    instructions.innerHTML = 'Click to select an element • <kbd>↑</kbd> Parent • <kbd>↓</kbd> Child • <kbd>Esc</kbd> Cancel';
    document.body.appendChild(instructions);
  }

  function hideInstructions() {
    if (instructions) { instructions.remove(); instructions = null; }
  }

  // ── UI: tooltip ───────────────────────────────────────────────────────────

  function showTooltip(element, x, y) {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'etw-tooltip';
      document.body.appendChild(tooltip);
    }
    updateTooltipContent(element);
    const offset = 15;
    let left = x + offset;
    let top  = y + offset;
    const rect = tooltip.getBoundingClientRect();
    if (left + rect.width  > window.innerWidth)  left = x - rect.width  - offset;
    if (top  + rect.height > window.innerHeight) top  = y - rect.height - offset;
    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
  }

  function updateTooltipContent(element) {
    if (!tooltip) return;
    const tag     = element.tagName.toLowerCase();
    const classes = Array.from(element.classList).filter(c => !c.startsWith('etw-'));
    const id      = element.id;
    let html = '<span class="etw-tooltip-tag">' + tag + '</span>';
    if (id) html += '<span class="etw-tooltip-id">#' + id + '</span>';
    if (classes.length > 0) {
      html += '<span class="etw-tooltip-class">.' + classes.slice(0, 3).join('.') + '</span>';
      if (classes.length > 3) html += '<span class="etw-tooltip-class">...+' + (classes.length - 3) + '</span>';
    }
    tooltip.innerHTML = html;
  }

  function hideTooltip() {
    if (tooltip) { tooltip.remove(); tooltip = null; }
  }

  // ── UI: toast ────────────────────────────────────────────────────────────

  function showToast(message, type) {
    const existing = document.querySelector('.etw-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'etw-toast' + (type ? ' ' + type : '');

    const icons = {
      success: '<svg class="etw-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
      error:   '<svg class="etw-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'
    };
    toast.innerHTML = (icons[type] || '<svg class="etw-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>') + '<span>' + message + '</span>';
    document.body.appendChild(toast);

    requestAnimationFrame(function() { toast.classList.add('show'); });
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { toast.remove(); }, 300);
    }, 4000);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  window.addEventListener('beforeunload', function() {
    if (selectedElement) selectedElement.classList.remove('etw-selected');
    stopSelection();
  });

})();
