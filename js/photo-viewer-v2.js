// Photo Viewer v2 - Isolated module
// Injects new UI elements automatically

(function() {
  'use strict';
  
  let pvMenuOpen = false;
  
  // Inject HTML elements when DOM ready
  function injectElements() {
    const imageViewer = document.getElementById('imageViewer');
    if (!imageViewer) {
      console.warn('Photo Viewer v2: imageViewer not found');
      return;
    }
    
    // Create new header
    const header = document.createElement('div');
    header.className = 'pv-header';
    header.onclick = function(e) { e.stopPropagation(); };
    header.innerHTML = `
      <button class="pv-header-btn menu" id="pvMenuBtn" onclick="togglePvMenu()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <span class="pv-counter" id="pvCounter">1 / 1</span>
      <div class="pv-header-center">
        <div class="pv-filename" id="pvFilename">Photo</div>
      </div>
      <div class="pv-header-right">
        <button class="pv-pill" onclick="openPvInfo()">Info</button>
        <button class="pv-header-btn" onclick="closeImageViewer()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    `;
    
    // Create tools menu
    const toolsMenu = document.createElement('div');
    toolsMenu.className = 'pv-tools-menu';
    toolsMenu.id = 'pvToolsMenu';
    toolsMenu.onclick = function(e) { e.stopPropagation(); };
    toolsMenu.innerHTML = `
      <div class="pv-tools-row">
        <button class="pv-btn" onclick="shareImage()">Share</button>
        <button class="pv-btn" onclick="saveImageToGallery()">Download</button>
        <button class="pv-btn" onclick="openPhotoMarkers()">Markers</button>
        <button class="pv-btn delete" onclick="deleteFromViewer()">Delete</button>
      </div>
      <div class="pv-tools-row">
        <button class="pv-btn ai" onclick="runPhotoAI('ocr')">OCR</button>
        <button class="pv-btn ai" onclick="runPhotoAI('describe')">Describe</button>
        <button class="pv-btn" onclick="openPvInfo()">Edit Caption</button>
      </div>
    `;
    
    // Insert at beginning of imageViewer
    imageViewer.insertBefore(toolsMenu, imageViewer.firstChild);
    imageViewer.insertBefore(header, imageViewer.firstChild);
    
    // Create info modal
    const infoModal = document.createElement('div');
    infoModal.className = 'pv-info-modal';
    infoModal.id = 'pvInfoModal';
    infoModal.onclick = function(e) { if(e.target === this) closePvInfo(); };
    infoModal.innerHTML = `
      <div class="pv-info-content">
        <div class="pv-info-header">
          <h3>Photo Info</h3>
          <button class="pv-info-close" onclick="closePvInfo()">✕</button>
        </div>
        <div class="pv-info-body">
          <div class="pv-info-section">
            <div class="pv-info-label">Filename</div>
            <div class="pv-info-value" id="pvInfoFilename">-</div>
          </div>
          <div class="pv-info-section">
            <div class="pv-info-label">Date & Time</div>
            <div class="pv-info-value" id="pvInfoDate">-</div>
          </div>
          <div class="pv-info-section">
            <div class="pv-info-label">Category</div>
            <div class="pv-info-value" id="pvInfoCategory">-</div>
          </div>
          <div class="pv-info-section">
            <div class="pv-info-label">Caption / Notes</div>
            <textarea class="pv-info-textarea" id="pvInfoCaption" placeholder="Add caption or notes..."></textarea>
          </div>
        </div>
        <div class="pv-info-actions">
          <button class="pv-info-btn cancel" onclick="closePvInfo()">Cancel</button>
          <button class="pv-info-btn save" onclick="savePvInfo()">Save</button>
        </div>
      </div>
    `;
    
    // Add modal after imageViewer
    imageViewer.parentNode.insertBefore(infoModal, imageViewer.nextSibling);
    
    console.log('Photo Viewer v2: Elements injected');
  }
  
  // Global functions
  window.togglePvMenu = function() {
    const menu = document.getElementById('pvToolsMenu');
    const btn = document.getElementById('pvMenuBtn');
    if (!menu || !btn) return;
    pvMenuOpen = !pvMenuOpen;
    menu.classList.toggle('show', pvMenuOpen);
    btn.classList.toggle('active', pvMenuOpen);
  };
  
  window.closePvMenu = function() {
    pvMenuOpen = false;
    const menu = document.getElementById('pvToolsMenu');
    const btn = document.getElementById('pvMenuBtn');
    if (menu) menu.classList.remove('show');
    if (btn) btn.classList.remove('active');
  };
  
  window.openPvInfo = function() {
    closePvMenu();
    if (typeof currentImageId === 'undefined' || typeof ideas === 'undefined') return;
    const item = ideas.find(function(x) { return x.id === currentImageId; });
    if (!item) return;
    
    const filenameEl = document.getElementById('pvFilename');
    document.getElementById('pvInfoFilename').textContent = filenameEl ? filenameEl.textContent : 'Photo';
    document.getElementById('pvInfoDate').textContent = (item.date || '') + (item.time ? ' • ' + item.time : '');
    document.getElementById('pvInfoCategory').textContent = item.category || 'photo';
    document.getElementById('pvInfoCaption').value = item.notes || item.text || '';
    
    document.getElementById('pvInfoModal').classList.add('show');
  };
  
  window.closePvInfo = function() {
    const modal = document.getElementById('pvInfoModal');
    if (modal) modal.classList.remove('show');
  };
  
  window.savePvInfo = function() {
    if (typeof currentImageId === 'undefined' || typeof ideas === 'undefined') return;
    const item = ideas.find(function(x) { return x.id === currentImageId; });
    if (!item) return;
    
    item.notes = document.getElementById('pvInfoCaption').value.trim();
    if (typeof save === 'function') save();
    if (typeof render === 'function') render();
    if (typeof toast === 'function') toast('Caption saved');
    closePvInfo();
  };
  
  window.updatePvHeader = function(item) {
    if (!item) return;
    
    // Update counter
    if (typeof currentMediaIndex !== 'undefined' && typeof allMediaIds !== 'undefined') {
      const counter = document.getElementById('pvCounter');
      if (counter) counter.textContent = (currentMediaIndex + 1) + ' / ' + allMediaIds.length;
    }
    
    // Update filename
    const filename = document.getElementById('pvFilename');
    if (filename) {
      if (item.timestamp) {
        const d = new Date(item.timestamp);
        filename.textContent = 'IMG_' + d.getFullYear() + 
          String(d.getMonth() + 1).padStart(2, '0') + 
          String(d.getDate()).padStart(2, '0') + '_' +
          String(d.getHours()).padStart(2, '0') + 
          String(d.getMinutes()).padStart(2, '0');
      } else {
        filename.textContent = item.date || 'Photo';
      }
    }
  };
  
  // Hook into existing functions
  function hookFunctions() {
    // Hook closeImageViewer
    if (typeof window.closeImageViewer === 'function') {
      const originalClose = window.closeImageViewer;
      window.closeImageViewer = function() {
        closePvMenu();
        originalClose.apply(this, arguments);
      };
    }
    
    // Hook viewImage
    if (typeof window.viewImage === 'function') {
      const originalView = window.viewImage;
      window.viewImage = function(id, e) {
        originalView.apply(this, arguments);
        // Update header after original function
        setTimeout(function() {
          if (typeof ideas !== 'undefined' && typeof currentImageId !== 'undefined') {
            const item = ideas.find(function(x) { return x.id === currentImageId; });
            updatePvHeader(item);
          }
        }, 50);
      };
    }
    
    // Hook navigateImage
    if (typeof window.navigateImage === 'function') {
      const originalNavigate = window.navigateImage;
      window.navigateImage = function(direction) {
        originalNavigate.apply(this, arguments);
        // Update header after navigation
        setTimeout(function() {
          if (typeof ideas !== 'undefined' && typeof currentImageId !== 'undefined') {
            const item = ideas.find(function(x) { return x.id === currentImageId; });
            updatePvHeader(item);
          }
        }, 150);
      };
    }
    
    console.log('Photo Viewer v2: Functions hooked');
  }
  
  // Initialize when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      injectElements();
      hookFunctions();
    });
  } else {
    // DOM already loaded, wait a bit for other scripts
    setTimeout(function() {
      injectElements();
      hookFunctions();
    }, 100);
  }
  
})();
