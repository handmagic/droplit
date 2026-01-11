// ============================================
// DROPLIT PHOTO v2.0 - Header-based Design
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
  if (item && typeof updateHeaderCaption === 'function') {
    updateHeaderCaption(item);
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
  const btn = document.getElementById('imgMarkersBtn');
  const label = document.getElementById('imgMarkersLabel');
  
  if (!btn) return;
  
  if (item && item.markers && item.markers.length > 0) {
    // Show emoji markers
    const emojis = item.markers.map(m => MARKERS[m] || '').join('');
    if(label) label.textContent = emojis || 'Markers';
    btn.classList.add('has-markers');
  } else {
    if(label) label.textContent = 'Markers';
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
