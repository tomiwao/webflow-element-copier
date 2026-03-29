// Popup script - communicates with content script
(function() {
  'use strict';

  let selectedElementData = null;

  const selectBtn = document.getElementById('selectBtn');
  const copyBtn = document.getElementById('copyBtn');
  const copyPageBtn = document.getElementById('copyPageBtn');
  const usePageStylesToggle = document.getElementById('usePageStyles');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const selectedInfo = document.getElementById('selectedInfo');
  const elementPreview = document.getElementById('elementPreview');
  const childCount = document.getElementById('childCount');
  const styleCount = document.getElementById('styleCount');
  const toast = document.getElementById('toast');

  // Initialize
  checkCurrentState();

  // Select element button
  selectBtn.addEventListener('click', async function() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id) {
      showToast('Cannot access this page', true);
      return;
    }

    // Check if we can inject into this page
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      showToast('Cannot select on browser pages', true);
      return;
    }

    try {
      // Send message to content script to start selection
      await chrome.tabs.sendMessage(tab.id, { action: 'startSelection' });
      
      setStatus('selecting', 'Selecting...');
      selectBtn.textContent = 'Click an element on the page';
      selectBtn.disabled = true;
      
      // Close popup so user can select
      window.close();
    } catch (error) {
      console.error('Error starting selection:', error);
      showToast('Refresh page and try again', true);
    }
  });

  // Copy button
  copyBtn.addEventListener('click', async function() {
    if (!selectedElementData) {
      showToast('Select an element first', true);
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Request the Webflow JSON from content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'copyToWebflow',
        usePageStyles: usePageStylesToggle.checked
      });

      if (response && response.success) {
        copyBtn.classList.remove('btn-secondary');
        copyBtn.classList.add('btn-success');
        copyBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          Copied! Paste in Webflow
        `;
        showToast('Copied! Open Webflow and Ctrl+V / Cmd+V');
        
        setTimeout(function() {
          copyBtn.classList.remove('btn-success');
          copyBtn.classList.add('btn-secondary');
          copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            Copy for Webflow
          `;
        }, 3000);
      } else {
        showToast(response?.error || 'Copy failed', true);
      }
    } catch (error) {
      console.error('Copy error:', error);
      showToast('Copy failed - try again', true);
    }
  });

  // Check if there's already a selected element
  async function checkCurrentState() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id || tab.url.startsWith('chrome://')) {
        setStatus('inactive', 'Not available');
        selectBtn.disabled = true;
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getState' });
      
      if (response && response.hasSelection) {
        selectedElementData = response.data;
        updateSelectedInfo(response.data);
        setStatus('active', 'Element selected');
        copyBtn.disabled = false;
      } else {
        setStatus('ready', 'Ready');
      }
    } catch (error) {
      // Content script not loaded
      setStatus('ready', 'Ready');
    }
  }

  function setStatus(state, text) {
    statusText.textContent = text;
    statusDot.className = 'status-dot';
    
    if (state === 'selecting') {
      statusDot.classList.add('selecting');
    } else if (state === 'active') {
      statusDot.classList.add('active');
    }
  }

  function updateSelectedInfo(data) {
    if (!data) return;
    
    selectedInfo.classList.add('visible');
    
    let preview = '<span class="tag">&lt;' + data.tag + '</span>';
    if (data.classes && data.classes.length > 0) {
      preview += ' <span class="class">.' + data.classes.slice(0, 2).join('.') + '</span>';
      if (data.classes.length > 2) {
        preview += '<span class="class">...' + (data.classes.length - 2) + ' more</span>';
      }
    }
    preview += '<span class="tag">&gt;</span>';
    
    elementPreview.innerHTML = preview;
    childCount.textContent = data.childCount || 0;
    styleCount.textContent = data.styleCount || 0;
  }

  function showToast(message, isError) {
    toast.textContent = message;
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.classList.add('show');
    
    setTimeout(function() {
      toast.classList.remove('show');
    }, 3000);
  }

  // Copy full page button
  copyPageBtn.addEventListener('click', async function() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.id || tab.url.startsWith('chrome://')) {
        showToast('Cannot access this page', true);
        return;
      }

      copyPageBtn.disabled = true;
      copyPageBtn.textContent = 'Copying...';

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'copyFullPage',
        usePageStyles: usePageStylesToggle.checked
      });

      if (response && response.success) {
        copyPageBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          Copied! Paste in Webflow
        `;
        showToast('Full page copied! Open Webflow and Ctrl+V / Cmd+V');
        setTimeout(function() {
          copyPageBtn.disabled = false;
          copyPageBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 9h18M9 21V9"/>
            </svg>
            Copy Full Page
          `;
        }, 3000);
      } else {
        copyPageBtn.disabled = false;
        copyPageBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          Copy Full Page
        `;
        showToast(response?.error || 'Copy failed', true);
      }
    } catch (error) {
      console.error('Full page copy error:', error);
      copyPageBtn.disabled = false;
      showToast('Copy failed - refresh page and try again', true);
    }
  });

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'elementSelected') {
      selectedElementData = request.data;
      updateSelectedInfo(request.data);
      setStatus('active', 'Element selected');
      copyBtn.disabled = false;
    }
  });
})();
