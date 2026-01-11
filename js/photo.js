// ============================================
// DROPLIT PHOTO v1.0
// Photo AI Tools (OCR, Describe) and Photo Markers
// ============================================

// ============================================
// PHOTO AI TOOLS
// ============================================

let photoAIResult = null;
let photoAIType = null;

function openPhotoAI() {
  document.getElementById('photoAIModal').classList.add('show');
}

function closePhotoAI() {
  document.getElementById('photoAIModal').classList.remove('show');
}

async function runPhotoAI(type) {
  closePhotoAI();
  photoAIType = type;
  
  if (type === 'ocr') {
    await ocrImageNew();
  } else if (type === 'describe') {
    await aiDescribeNew();
  }
}

async function ocrImageNew() {
  if (aiProcessing) {
    toast('AI is processing...', 'info');
    return;
  }
  
  const item = ideas.find(x => x.id === currentImageId);
  if (!item || !item.image) {
    toast('No image to process', 'error');
    return;
  }

  aiProcessing = true;
  showAILoading('ocr', false);

  try {
    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ocr', image: item.image }),
    });

    const data = await response.json();
    hideAILoading();

    if (data.success && data.result) {
      photoAIResult = data.result;
      showPhotoAIResult('Extracted Text', photoAIResult);
    } else {
      toast(data.error || 'OCR failed', 'error');
    }
  } catch (error) {
    console.error('OCR error:', error);
    hideAILoading();
    toast('Connection error', 'error');
  } finally {
    aiProcessing = false;
  }
}

async function aiDescribeNew() {
  if (aiProcessing) {
    toast('AI is processing...', 'info');
    return;
  }
  
  const item = ideas.find(x => x.id === currentImageId);
  if (!item || !item.image) {
    toast('No image to process', 'error');
    return;
  }

  aiProcessing = true;
  showAILoading('describe', false);

  try {
    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'describe', image: item.image }),
    });

    const data = await response.json();
    hideAILoading();

    if (data.success && data.result) {
      photoAIResult = data.result;
      showPhotoAIResult('Image Description', photoAIResult);
    } else {
      toast(data.error || 'Analysis failed', 'error');
    }
  } catch (error) {
    console.error('AI describe error:', error);
    hideAILoading();
    toast('Connection error', 'error');
  } finally {
    aiProcessing = false;
  }
}

function showPhotoAIResult(title, text) {
  document.getElementById('photoAIResultTitle').textContent = title;
  document.getElementById('photoAIResultText').textContent = text;
  document.getElementById('photoAIResult').classList.add('show');
}

function closePhotoAIResult() {
  document.getElementById('photoAIResult').classList.remove('show');
  photoAIResult = null;
  photoAIType = null;
}

function savePhotoAIToCaption() {
  if (!photoAIResult || !currentImageId) return;
  
  const item = ideas.find(x => x.id === currentImageId);
  if (item) {
    // Truncate to 200 chars for caption
    const MAX_CAPTION = 200;
    if (photoAIResult.length > MAX_CAPTION) {
      item.notes = photoAIResult.substring(0, MAX_CAPTION) + '...';
    } else {
      item.notes = photoAIResult;
    }
    save();
    updateImageViewerCaption();
    render();
    toast('Caption updated! ✓', 'success');
  }
  closePhotoAIResult();
}

function savePhotoAIToNewDrop() {
  if (!photoAIResult) return;
  
  const sourceItem = ideas.find(x => x.id === currentImageId);
  const category = detectCat(photoAIResult);
  
  const idea = {
    id: Date.now(),
    text: photoAIResult,
    category: category,
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString('ru-RU'),
    time: new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}),
    aiGenerated: true,
    sourceImageId: currentImageId
  };
  
  ideas.push(idea);
  save();
  render();
  counts();
  
  toast('New drop created!', 'success');
  closePhotoAIResult();
}

function copyPhotoAIResult() {
  if (!photoAIResult) return;
  
  navigator.clipboard.writeText(photoAIResult);
  toast('Copied!', 'success');
  closePhotoAIResult();
}

function updateImageViewerCaption() {
  const item = ideas.find(x => x.id === currentImageId);
  if (item) {
    const captionDisplay = document.getElementById('imageCaptionDisplay');
    if (captionDisplay) {
      captionDisplay.textContent = item.notes || '';
    }
  }
}

// ============================================
// PHOTO MARKERS
// ============================================

function openPhotoMarkers() {
  if (!currentImageId) return;
  
  const item = ideas.find(x => x.id === currentImageId);
  if (!item) return;
  
  // Build markers grid
  const grid = document.getElementById('photoMarkersGrid');
  grid.innerHTML = Object.keys(MARKERS).map(mk => {
    const isActive = item.markers && item.markers.includes(mk);
    return `<button class="photo-marker-btn${isActive ? ' active' : ''}" onclick="togglePhotoMarker('${mk}')">${MARKERS[mk]}</button>`;
  }).join('');
  
  document.getElementById('photoMarkersModal').classList.add('show');
}

function closePhotoMarkersModal() {
  document.getElementById('photoMarkersModal').classList.remove('show');
}

function togglePhotoMarker(marker) {
  if (!currentImageId) return;
  
  const item = ideas.find(x => x.id === currentImageId);
  if (!item) return;
  
  if (!item.markers) item.markers = [];
  
  const idx = item.markers.indexOf(marker);
  if (idx === -1) {
    item.markers.push(marker);
  } else {
    item.markers.splice(idx, 1);
  }
  
  save();
  render();
  updatePhotoMarkersButton();
  
  // Update button state in modal
  const btns = document.querySelectorAll('.photo-marker-btn');
  btns.forEach(btn => {
    const mk = Object.keys(MARKERS).find(k => MARKERS[k] === btn.textContent);
    if (mk) {
      btn.classList.toggle('active', item.markers.includes(mk));
    }
  });
}

function updatePhotoMarkersButton() {
  const item = ideas.find(x => x.id === currentImageId);
  const btn = document.getElementById('imageViewerMarkers');
  if (!btn) return;
  
  if (item && item.markers && item.markers.length > 0) {
    btn.innerHTML = item.markers.map(m => MARKERS[m] || '').join('');
    btn.classList.add('has-markers');
  } else {
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>';
    btn.classList.remove('has-markers');
  }
}


// ============================================
// EXPORTS
// ============================================
window.DropLitPhoto = {
  openPhotoAI,
  closePhotoAI,
  runPhotoAI,
  ocrImageNew,
  aiDescribeNew,
  showPhotoAIResult,
  closePhotoAIResult,
  savePhotoAIToCaption,
  savePhotoAIToNewDrop,
  copyPhotoAIResult,
  updateImageViewerCaption,
  openPhotoMarkers,
  closePhotoMarkersModal,
  togglePhotoMarker,
  updatePhotoMarkersButton
};

/* ============================================
   PHOTO VIEWER v2 - New Header & Tools
   ============================================ */

function initPhotoViewerV2() {
  var imageViewer = document.getElementById('imageViewer');
  if (!imageViewer || document.getElementById('pvHeader')) return;
  
  // Create new header
  var header = document.createElement('div');
  header.className = 'pv-header';
  header.id = 'pvHeader';
  header.onclick = function(e) { e.stopPropagation(); };
  header.innerHTML = 
    '<button class="pv-header-btn menu" id="pvMenuBtn" onclick="togglePvMenu()">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>' +
    '</button>' +
    '<div class="pv-header-center">' +
      '<div class="pv-filename" id="pvFilename" onclick="openPvInfo()">' +
        '<svg class="pv-filename-lock" id="pvFilenameLock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
        '<span id="pvFilenameText">Photo</span>' +
      '</div>' +
    '</div>' +
    '<div class="pv-header-right">' +
      '<button class="pv-header-btn" onclick="closeImageViewer()">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
      '</button>' +
    '</div>';
  
  // Create counter (bottom center)
  var counter = document.createElement('div');
  counter.className = 'pv-counter';
  counter.id = 'pvCounter';
  counter.textContent = '1 / 1';
  counter.onclick = function(e) { e.stopPropagation(); };
  
  // Create tools menu
  var toolsMenu = document.createElement('div');
  toolsMenu.className = 'pv-tools-menu';
  toolsMenu.id = 'pvToolsMenu';
  toolsMenu.onclick = function(e) { e.stopPropagation(); };
  toolsMenu.innerHTML = 
    '<div class="pv-tools-row">' +
      '<button class="pv-btn" onclick="shareImage()">Share</button>' +
      '<button class="pv-btn" onclick="saveImageToGallery()">Download</button>' +
      '<button class="pv-btn" onclick="openPhotoMarkers()">Markers</button>' +
      '<button class="pv-btn delete" onclick="deleteFromViewer()">Delete</button>' +
    '</div>' +
    '<div class="pv-tools-row">' +
      '<button class="pv-btn ai" onclick="runPhotoAI(\'ocr\')">OCR</button>' +
      '<button class="pv-btn ai" onclick="runPhotoAI(\'describe\')">Describe</button>' +
      '<button class="pv-btn" onclick="openPvInfo()">Edit Caption</button>' +
    '</div>';
  
  // Create info modal
  var infoModal = document.createElement('div');
  infoModal.className = 'pv-info-modal';
  infoModal.id = 'pvInfoModal';
  infoModal.onclick = function() { closePvInfo(); };
  infoModal.innerHTML = 
    '<div class="pv-info-content" onclick="event.stopPropagation()">' +
      '<div class="pv-info-header">' +
        '<div class="pv-info-title">Photo Info</div>' +
        '<button class="pv-info-close" onclick="closePvInfo()">×</button>' +
      '</div>' +
      '<div class="pv-info-body">' +
        '<div class="pv-info-row">' +
          '<div class="pv-info-label">Filename</div>' +
          '<div class="pv-info-value" id="pvInfoFilename">—</div>' +
        '</div>' +
        '<div class="pv-info-row">' +
          '<div class="pv-info-label">Date & Time</div>' +
          '<div class="pv-info-value" id="pvInfoDate">—</div>' +
        '</div>' +
        '<div class="pv-info-row">' +
          '<div class="pv-info-label">Category</div>' +
          '<div class="pv-info-value" id="pvInfoCategory">—</div>' +
        '</div>' +
        '<div class="pv-info-row">' +
          '<div class="pv-info-label">Caption</div>' +
          '<textarea class="pv-info-textarea" id="pvInfoCaption" placeholder="Add a caption..."></textarea>' +
        '</div>' +
      '</div>' +
      '<div class="pv-info-actions">' +
        '<button class="pill-m sec" onclick="closePvInfo()">Cancel</button>' +
        '<button class="pill-m pri" onclick="savePvInfo()">Save</button>' +
      '</div>' +
    '</div>';
  
  // Insert elements
  imageViewer.insertBefore(toolsMenu, imageViewer.firstChild);
  imageViewer.insertBefore(header, imageViewer.firstChild);
  imageViewer.appendChild(counter);
  document.body.appendChild(infoModal);
}

function togglePvMenu() {
  var menu = document.getElementById('pvToolsMenu');
  var btn = document.getElementById('pvMenuBtn');
  if (menu) {
    menu.classList.toggle('show');
    if (btn) btn.classList.toggle('active', menu.classList.contains('show'));
  }
}

function closePvMenu() {
  var menu = document.getElementById('pvToolsMenu');
  var btn = document.getElementById('pvMenuBtn');
  if (menu) menu.classList.remove('show');
  if (btn) btn.classList.remove('active');
}

function openPvInfo() {
  closePvMenu();
  if (typeof currentImageId === 'undefined' || typeof ideas === 'undefined') return;
  var item = ideas.find(function(x) { return x.id === currentImageId; });
  if (!item) return;
  
  var filenameEl = document.getElementById('pvFilenameText');
  document.getElementById('pvInfoFilename').textContent = filenameEl ? filenameEl.textContent : 'Photo';
  document.getElementById('pvInfoDate').textContent = (item.date || '') + (item.time ? ' • ' + item.time : '');
  document.getElementById('pvInfoCategory').textContent = item.category || 'photo';
  document.getElementById('pvInfoCaption').value = item.notes || item.text || '';
  
  document.getElementById('pvInfoModal').classList.add('show');
}

function closePvInfo() {
  var modal = document.getElementById('pvInfoModal');
  if (modal) modal.classList.remove('show');
}

function savePvInfo() {
  if (typeof currentImageId === 'undefined' || typeof ideas === 'undefined') return;
  var idx = ideas.findIndex(function(x) { return x.id === currentImageId; });
  if (idx === -1) return;
  
  var caption = document.getElementById('pvInfoCaption').value.trim();
  ideas[idx].notes = caption;
  ideas[idx].text = caption;
  
  if (typeof save === 'function') save();
  if (typeof render === 'function') render();
  
  closePvInfo();
  if (typeof toast === 'function') toast('Caption saved');
}

function updatePvHeader(item) {
  if (!item) return;
  
  // Update counter
  if (typeof currentMediaIndex !== 'undefined' && typeof allMediaIds !== 'undefined') {
    var counter = document.getElementById('pvCounter');
    if (counter) counter.textContent = (currentMediaIndex + 1) + ' / ' + allMediaIds.length;
  }
  
  // Update filename
  var filenameText = document.getElementById('pvFilenameText');
  if (filenameText) {
    if (item.timestamp) {
      var d = new Date(item.timestamp);
      filenameText.textContent = 'IMG_' + d.getFullYear() + 
        String(d.getMonth() + 1).padStart(2, '0') + 
        String(d.getDate()).padStart(2, '0') + '_' +
        String(d.getHours()).padStart(2, '0') + 
        String(d.getMinutes()).padStart(2, '0');
    } else {
      filenameText.textContent = item.date || 'Photo';
    }
  }
  
  // Update lock icon
  var lockIcon = document.getElementById('pvFilenameLock');
  if (lockIcon) {
    var isEncrypted = item.encrypted || item.content_encrypted;
    lockIcon.style.display = isEncrypted ? 'block' : 'none';
  }
}

// Initialize on load and hook into existing functions
window.addEventListener('load', function() {
  initPhotoViewerV2();
  
  var lastImageId = null;
  
  // Hook viewImage
  if (typeof window.viewImage === 'function') {
    var originalViewImage = window.viewImage;
    window.viewImage = function(id, e) {
      originalViewImage.apply(this, arguments);
      setTimeout(function() {
        closePvMenu();
        if (typeof ideas !== 'undefined') {
          var item = ideas.find(function(x) { return x.id === id; });
          if (item) updatePvHeader(item);
        }
      }, 200);
    };
  }
  
  // Hook navigateImage
  if (typeof window.navigateImage === 'function') {
    var originalNavigateImage = window.navigateImage;
    window.navigateImage = function(dir) {
      originalNavigateImage.apply(this, arguments);
      setTimeout(function() {
        closePvMenu();
        if (typeof currentImageId !== 'undefined' && typeof ideas !== 'undefined') {
          var item = ideas.find(function(x) { return x.id === currentImageId; });
          if (item) updatePvHeader(item);
        }
      }, 200);
    };
  }
  
  // Hook closeImageViewer
  if (typeof window.closeImageViewer === 'function') {
    var originalCloseImageViewer = window.closeImageViewer;
    window.closeImageViewer = function() {
      closePvMenu();
      closePvInfo();
      originalCloseImageViewer.apply(this, arguments);
    };
  }
  
  // Fallback polling for swipe navigation
  setInterval(function() {
    if (typeof currentImageId !== 'undefined' && currentImageId !== lastImageId) {
      lastImageId = currentImageId;
      if (typeof ideas !== 'undefined') {
        var item = ideas.find(function(x) { return x.id === currentImageId; });
        if (item) updatePvHeader(item);
      }
    }
  }, 100);
});
