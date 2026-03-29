// Element to Webflow - Content Script
// Handles element selection, style extraction, and Webflow JSON generation

(function() {
  'use strict';

  // State
  let isSelecting = false;
  let selectedElement = null;
  let hoveredElement = null;
  let webflowData = null;

  // UI Elements
  let tooltip = null;
  let instructions = null;

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    switch (request.action) {
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
          // Use <main> if present, otherwise <body>
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
    return true; // Keep channel open for async response
  });

  // Start element selection mode
  function startSelection() {
    if (isSelecting) return;
    
    isSelecting = true;
    document.body.classList.add('etw-selecting');
    
    // Create instructions banner
    showInstructions();
    
    // Add event listeners
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
  }

  // Stop element selection mode
  function stopSelection() {
    isSelecting = false;
    document.body.classList.remove('etw-selecting');
    
    // Remove event listeners
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    
    // Clean up UI
    hideInstructions();
    hideTooltip();
    
    if (hoveredElement) {
      hoveredElement.classList.remove('etw-highlight');
      hoveredElement = null;
    }
  }

  // Mouse over handler
  function handleMouseOver(e) {
    if (!isSelecting) return;
    
    const target = e.target;
    
    // Ignore our own UI elements
    if (target.classList.contains('etw-tooltip') || 
        target.classList.contains('etw-instructions') ||
        target.closest('.etw-tooltip') ||
        target.closest('.etw-instructions')) {
      return;
    }
    
    // Remove highlight from previous element
    if (hoveredElement && hoveredElement !== target) {
      hoveredElement.classList.remove('etw-highlight');
    }
    
    // Highlight new element
    hoveredElement = target;
    hoveredElement.classList.add('etw-highlight');
    
    // Show tooltip
    showTooltip(target, e.clientX, e.clientY);
  }

  // Mouse out handler
  function handleMouseOut(e) {
    if (!isSelecting) return;
    
    const target = e.target;
    if (target === hoveredElement) {
      target.classList.remove('etw-highlight');
    }
  }

  // Click handler - select element
  function handleClick(e) {
    if (!isSelecting) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const target = e.target;
    
    // Ignore our own UI elements
    if (target.classList.contains('etw-tooltip') || 
        target.classList.contains('etw-instructions') ||
        target.closest('.etw-tooltip') ||
        target.closest('.etw-instructions')) {
      return;
    }
    
    // Select the element
    selectElement(target);
  }

  // Keyboard handler
  function handleKeyDown(e) {
    if (!isSelecting) return;
    
    // Escape to cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      stopSelection();
      showToast('Selection cancelled', 'error');
    }
    
    // Arrow up to select parent
    if (e.key === 'ArrowUp' && hoveredElement && hoveredElement.parentElement) {
      e.preventDefault();
      hoveredElement.classList.remove('etw-highlight');
      hoveredElement = hoveredElement.parentElement;
      hoveredElement.classList.add('etw-highlight');
      updateTooltipContent(hoveredElement);
    }
    
    // Arrow down to select first child
    if (e.key === 'ArrowDown' && hoveredElement && hoveredElement.firstElementChild) {
      e.preventDefault();
      hoveredElement.classList.remove('etw-highlight');
      hoveredElement = hoveredElement.firstElementChild;
      hoveredElement.classList.add('etw-highlight');
      updateTooltipContent(hoveredElement);
    }
  }

  // Select an element
  function selectElement(element) {
    // Remove previous selection
    if (selectedElement) {
      selectedElement.classList.remove('etw-selected');
    }
    
    // Set new selection
    selectedElement = element;
    selectedElement.classList.remove('etw-highlight');
    selectedElement.classList.add('etw-selected');
    
    // Stop selection mode
    stopSelection();
    
    // Generate Webflow data
    try {
      webflowData = generateWebflowJSON(selectedElement);
      
      // Notify popup
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

  // Get element summary for popup display
  function getElementSummary(element) {
    const classes = Array.from(element.classList).filter(function(c) {
      return !c.startsWith('etw-');
    });
    
    return {
      tag: element.tagName.toLowerCase(),
      classes: classes,
      id: element.id || null,
      childCount: countAllChildren(element),
      styleCount: countStyles(element)
    };
  }

  // Count all descendant elements
  function countAllChildren(element) {
    return element.querySelectorAll('*').length;
  }

  // Count unique styles
  function countStyles(element) {
    const styles = new Set();
    const elements = [element].concat(Array.from(element.querySelectorAll('*')));
    
    elements.forEach(function(el) {
      Array.from(el.classList).forEach(function(c) {
        if (!c.startsWith('etw-')) {
          styles.add(c);
        }
      });
    });
    
    return styles.size;
  }

  // ── Stylesheet-based style extraction ──────────────────────────────────────

  // Build a map of  className → [cssText, ...]  from all accessible stylesheets.
  // Called once per generateWebflowJSON run so we only walk the sheets once.
  function buildClassStyleMap() {
    var map = new Map();
    for (var si = 0; si < document.styleSheets.length; si++) {
      try {
        walkRules(document.styleSheets[si].cssRules || [], map);
      } catch (e) {
        // Cross-origin sheet — skip silently
      }
    }
    return map;
  }

  function walkRules(rules, map) {
    for (var ri = 0; ri < rules.length; ri++) {
      var rule = rules[ri];
      if (rule.type === 1 /* CSSStyleRule */ && rule.selectorText && rule.style.cssText) {
        var selectors = rule.selectorText.split(',');
        for (var si = 0; si < selectors.length; si++) {
          var sel = selectors[si].trim();
          // Skip pseudo-elements
          if (sel.indexOf('::') !== -1) continue;
          // Target = rightmost compound selector (after combinators)
          var lastPart = sel.split(/[\s>+~]+/).pop().trim();
          // Strip pseudo-classes (:hover etc.) from target
          var base = lastPart.split(':')[0];
          var classMatches = base.match(/\.(-?[a-zA-Z_][\w-]*)/g);
          if (!classMatches) continue;
          for (var ci = 0; ci < classMatches.length; ci++) {
            var className = classMatches[ci].slice(1);
            if (!map.has(className)) { map.set(className, []); }
            map.get(className).push(rule.style.cssText);
          }
        }
      } else if (rule.cssRules) {
        // @media, @supports, @layer — recurse
        try { walkRules(rule.cssRules, map); } catch (e) {}
      }
    }
  }

  // Return CSS text for a class from the stylesheet map,
  // falling back to filtered computed styles if not found.
  function getStylesForClass(className, element, classStyleMap) {
    if (classStyleMap && classStyleMap.has(className)) {
      // Deduplicate identical rule blocks then join
      var rules = classStyleMap.get(className);
      var seen = [];
      var unique = [];
      for (var i = 0; i < rules.length; i++) {
        if (seen.indexOf(rules[i]) === -1) { seen.push(rules[i]); unique.push(rules[i]); }
      }
      return unique.join(' ');
    }
    // Fallback: computed styles (strip etw- classes first so highlight doesn't bleed)
    var etwClasses = Array.from(element.classList).filter(function(c) { return c.startsWith('etw-'); });
    etwClasses.forEach(function(c) { element.classList.remove(c); });
    var styleString = extractRelevantStyles(window.getComputedStyle(element));
    etwClasses.forEach(function(c) { element.classList.add(c); });
    return styleString;
  }

  // ── Core JSON generation ─────────────────────────────────────────────────

  // Generate Webflow-compatible JSON
  function generateWebflowJSON(element, options) {
    options = options || {};
    var nodes = [];
    var styles = [];
    var styleMap = new Map(); // className -> styleId

    // Build the class→CSS map once (used when usePageStyles is true or by default)
    var classStyleMap = (options.usePageStyles !== false) ? buildClassStyleMap() : null;

    // Process element and all descendants
    processElement(element, null, nodes, styles, styleMap, classStyleMap);

    // Build the final JSON structure
    var webflowJSON = {
      type: '@webflow/XscpData',
      payload: {
        nodes: nodes,
        styles: styles,
        assets: [],
        ix1: [],
        ix2: { interactions: [], events: [], actionLists: [] }
      }
    };

    return JSON.stringify(webflowJSON);
  }

  // Process a single element
  function processElement(element, parentId, nodes, styles, styleMap, classStyleMap) {
    var nodeId = generateId();
    var tag = element.tagName.toLowerCase();
    var childIds = [];

    // Get classes (excluding our own)
    var classes = Array.from(element.classList).filter(function(c) {
      return !c.startsWith('etw-');
    });

    // Process classes and create styles
    var classIds = [];
    classes.forEach(function(className) {
      if (!styleMap.has(className)) {
        var styleId = generateId();
        styleMap.set(className, styleId);

        var styleString = getStylesForClass(className, element, classStyleMap);

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

    // Process child elements first to get their IDs
    Array.from(element.children).forEach(function(child) {
      var childId = processElement(child, nodeId, nodes, styles, styleMap, classStyleMap);
      childIds.push(childId);
    });

    // Determine node type and build data
    const nodeType = getWebflowNodeType(element);
    const nodeData = buildNodeData(element, tag, nodeType);

    // Build the node
    const node = {
      _id: nodeId,
      type: nodeType,
      tag: tag,
      classes: classIds,
      children: childIds,
      data: nodeData
    };

    // Handle text content for text nodes
    if (shouldIncludeText(element)) {
      const textContent = getDirectTextContent(element);
      if (textContent) {
        node.v = textContent;
      }
    }

    nodes.push(node);
    return nodeId;
  }

  // Get Webflow node type based on HTML element
  function getWebflowNodeType(element) {
    const tag = element.tagName.toLowerCase();
    
    const typeMap = {
      'img': 'Image',
      'video': 'Video',
      'a': 'Link',
      'form': 'FormWrapper',
      'input': 'FormTextInput',
      'textarea': 'FormTextarea',
      'select': 'FormSelect',
      'button': 'FormButton',
      'label': 'FormBlockLabel',
      'h1': 'Heading',
      'h2': 'Heading',
      'h3': 'Heading',
      'h4': 'Heading',
      'h5': 'Heading',
      'h6': 'Heading',
      'p': 'Paragraph',
      'blockquote': 'Blockquote',
      'ul': 'List',
      'ol': 'List',
      'li': 'ListItem',
      'nav': 'Block',
      'section': 'Block',
      'article': 'Block',
      'header': 'Block',
      'footer': 'Block',
      'main': 'Block',
      'aside': 'Block',
      'figure': 'Figure',
      'figcaption': 'Block',
      'span': 'Block',
      'div': 'Block',
      'iframe': 'HtmlEmbed'
    };

    return typeMap[tag] || 'Block';
  }

  // Build node data object
  function buildNodeData(element, tag, nodeType) {
    const data = {
      tag: tag,
      text: isTextElement(element)
    };

    // Handle specific element types
    if (tag === 'img') {
      data.attr = {
        src: element.src || '',
        alt: element.alt || '',
        loading: element.loading || 'lazy'
      };
    } else if (tag === 'a') {
      data.attr = {
        href: element.href || '#'
      };
      if (element.target) {
        data.attr.target = element.target;
      }
    } else if (tag === 'video') {
      data.attr = {
        src: element.src || ''
      };
      if (element.poster) {
        data.attr.poster = element.poster;
      }
      data.autoplay = element.autoplay || false;
      data.loop = element.loop || false;
      data.muted = element.muted || false;
    } else if (tag === 'input') {
      data.attr = {
        type: element.type || 'text',
        name: element.name || '',
        placeholder: element.placeholder || ''
      };
    } else if (tag === 'iframe') {
      data.embed = {
        type: 'custom',
        meta: {
          html: element.outerHTML
        }
      };
    }

    // Add ID if present
    if (element.id) {
      data.attr = data.attr || {};
      data.attr.id = element.id;
    }

    // Add custom attributes
    const customAttrs = getCustomAttributes(element);
    if (customAttrs.length > 0) {
      data.xattr = customAttrs;
    }

    return data;
  }

  // Check if element is primarily text
  function isTextElement(element) {
    const textTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'li', 'label', 'blockquote'];
    return textTags.indexOf(element.tagName.toLowerCase()) !== -1;
  }

  // Check if we should include text content
  function shouldIncludeText(element) {
    const tag = element.tagName.toLowerCase();
    return ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'li', 'button', 'label'].indexOf(tag) !== -1;
  }

  // Get direct text content (excluding child element text)
  function getDirectTextContent(element) {
    let text = '';
    element.childNodes.forEach(function(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    });
    return text.trim();
  }

  // Get custom data attributes
  function getCustomAttributes(element) {
    const attrs = [];
    Array.from(element.attributes).forEach(function(attr) {
      if (attr.name.startsWith('data-') && !attr.name.startsWith('data-etw-')) {
        attrs.push({
          name: attr.name,
          value: attr.value
        });
      }
    });
    return attrs;
  }

  // Extract relevant CSS styles from computed style
  function extractRelevantStyles(computedStyle) {
    const relevantProps = [
      // Layout
      'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
      'float', 'clear', 'overflow', 'overflow-x', 'overflow-y',
      
      // Flexbox
      'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content',
      'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'order', 'gap',
      
      // Grid
      'grid-template-columns', 'grid-template-rows', 'grid-gap', 'grid-column', 'grid-row',
      
      // Box Model
      'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
      'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      
      // Border
      'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
      'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
      'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
      'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
      
      // Background
      'background-color', 'background-image', 'background-position', 'background-size',
      'background-repeat', 'background-attachment',
      
      // Typography
      'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
      'letter-spacing', 'text-align', 'text-decoration', 'text-transform',
      'color', 'white-space', 'word-break', 'word-spacing',
      
      // Effects
      'opacity', 'box-shadow', 'text-shadow', 'transform', 'filter',
      
      // Misc
      'cursor', 'visibility', 'object-fit', 'object-position'
    ];

    const styleEntries = [];
    
    relevantProps.forEach(function(prop) {
      const value = computedStyle.getPropertyValue(prop);
      if (value && value !== 'none' && value !== 'auto' && value !== 'normal' && 
          value !== '0px' && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
        // Skip default values
        if (prop === 'display' && value === 'block') return;
        if (prop === 'position' && value === 'static') return;
        if (prop === 'visibility' && value === 'visible') return;
        if (prop === 'opacity' && value === '1') return;
        if (prop === 'font-weight' && value === '400') return;
        if (prop === 'font-style' && value === 'normal') return;
        
        styleEntries.push(prop + ': ' + value);
      }
    });

    return styleEntries.join('; ') + (styleEntries.length > 0 ? ';' : '');
  }

  // Generate unique ID (UUID-like)
  function generateId() {
    return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'.replace(/[x]/g, function() {
      return Math.floor(Math.random() * 16).toString(16);
    });
  }

  // Copy text to clipboard as application/json (required for Webflow)
  function copyToClipboard(jsonString) {
    // Method 1: Try using the newer Clipboard API with Blob
    if (navigator.clipboard && navigator.clipboard.write) {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const clipboardItem = new ClipboardItem({
        'application/json': blob,
        'text/plain': new Blob([jsonString], { type: 'text/plain' })
      });
      
      navigator.clipboard.write([clipboardItem]).catch(function(err) {
        console.log('Clipboard API failed, using fallback:', err);
        fallbackCopy(jsonString);
      });
    } else {
      // Method 2: Fallback using document.execCommand
      fallbackCopy(jsonString);
    }
  }

  // Fallback copy method using execCommand
  function fallbackCopy(jsonString) {
    // Create a custom copy event handler
    function copyHandler(e) {
      e.preventDefault();
      e.clipboardData.setData('application/json', jsonString);
      e.clipboardData.setData('text/plain', jsonString);
      document.removeEventListener('copy', copyHandler, true);
    }
    
    document.addEventListener('copy', copyHandler, true);
    document.execCommand('copy');
  }

  // Show instructions banner
  function showInstructions() {
    if (instructions) return;
    
    instructions = document.createElement('div');
    instructions.className = 'etw-instructions';
    instructions.innerHTML = 'Click to select an element • <kbd>↑</kbd> Parent • <kbd>↓</kbd> Child • <kbd>Esc</kbd> Cancel';
    document.body.appendChild(instructions);
  }

  // Hide instructions banner
  function hideInstructions() {
    if (instructions) {
      instructions.remove();
      instructions = null;
    }
  }

  // Show tooltip near cursor
  function showTooltip(element, x, y) {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'etw-tooltip';
      document.body.appendChild(tooltip);
    }
    
    updateTooltipContent(element);
    
    // Position tooltip
    const offset = 15;
    let left = x + offset;
    let top = y + offset;
    
    // Keep tooltip in viewport
    const rect = tooltip.getBoundingClientRect();
    if (left + rect.width > window.innerWidth) {
      left = x - rect.width - offset;
    }
    if (top + rect.height > window.innerHeight) {
      top = y - rect.height - offset;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  // Update tooltip content
  function updateTooltipContent(element) {
    if (!tooltip) return;
    
    const tag = element.tagName.toLowerCase();
    const classes = Array.from(element.classList).filter(function(c) {
      return !c.startsWith('etw-');
    });
    const id = element.id;
    
    let html = '<span class="etw-tooltip-tag">' + tag + '</span>';
    if (id) {
      html += '<span class="etw-tooltip-id">#' + id + '</span>';
    }
    if (classes.length > 0) {
      html += '<span class="etw-tooltip-class">.' + classes.slice(0, 3).join('.') + '</span>';
      if (classes.length > 3) {
        html += '<span class="etw-tooltip-class">...+' + (classes.length - 3) + '</span>';
      }
    }
    
    tooltip.innerHTML = html;
  }

  // Hide tooltip
  function hideTooltip() {
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
  }

  // Show toast notification
  function showToast(message, type) {
    // Remove existing toast
    const existing = document.querySelector('.etw-toast');
    if (existing) {
      existing.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'etw-toast';
    if (type) {
      toast.classList.add(type);
    }
    
    // Icon based on type
    let icon = '';
    if (type === 'success') {
      icon = '<svg class="etw-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
    } else if (type === 'error') {
      icon = '<svg class="etw-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    } else {
      icon = '<svg class="etw-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>';
    }
    
    toast.innerHTML = icon + '<span>' + message + '</span>';
    document.body.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(function() {
      toast.classList.add('show');
    });
    
    // Remove after delay
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() {
        toast.remove();
      }, 300);
    }, 4000);
  }

  // Clean up on page unload
  window.addEventListener('beforeunload', function() {
    if (selectedElement) {
      selectedElement.classList.remove('etw-selected');
    }
    stopSelection();
  });

})();
