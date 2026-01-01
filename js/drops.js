// ============================================
// DROPLIT DROPS - v0.9.59
// Drop CRUD operations
// ============================================

// Save drop to localStorage and sync
function save(idea) {
  localStorage.setItem('droplit_ideas', JSON.stringify(ideas));
  syncDropToServer(idea, 'create');
}

// Delete drop
function deleteIdea(id) {
  const index = ideas.findIndex(i => i.id === id);
  if (index === -1) return;
  
  ideas.splice(index, 1);
  localStorage.setItem('droplit_ideas', JSON.stringify(ideas));
  deleteDropFromServer(id);
  
  render();
  counts();
  closeModal();
  toast('Deleted', 'success');
}

// Create new drop from text
function saveIdea(text) {
  if (!text || !text.trim()) return;
  
  const now = new Date();
  const category = detectCat(text);
  
  const newIdea = {
    id: Date.now(),
    text: text.trim(),
    category: category,
    date: formatDate(now),
    time: formatTime(now),
    timestamp: now.toISOString(),
    markers: [],
    isMedia: false
  };
  
  ideas.unshift(newIdea);
  save(newIdea);
  
  playDropSound();
  render();
  counts();
  
  // Reset filters to show new drop
  resetToShowAll();
  
  toast('Drop saved!', 'success');
}

// Detect category from text
function detectCat(text) {
  const t = text.toLowerCase();
  
  if (t.includes('[task]') || t.includes('todo') || t.includes('need to') || t.includes('must ')) return 'tasks';
  if (t.includes('[idea]') || t.includes('what if') || t.includes('maybe ')) return 'ideas';
  if (t.includes('[bug]') || t.includes('broken') || t.includes('error') || t.includes('fix ')) return 'bugs';
  if (t.includes('[question]') || t.includes('how to') || t.includes('why ') || t.endsWith('?')) return 'questions';
  if (t.includes('[design]') || t.includes('ui ') || t.includes('ux ')) return 'design';
  if (t.includes('[handmagic]') || t.includes('handmagic')) return 'handmagic';
  
  return 'inbox';
}

// Update drop text
function updateDropText(id, newText) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  
  idea.text = newText;
  idea.updated_at = new Date().toISOString();
  
  save(idea);
  render();
}

// Update drop notes
function updateDropNotes(id, notes) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  
  idea.notes = notes;
  idea.updated_at = new Date().toISOString();
  
  save(idea);
}

// Change drop category
function changeCat(newCategory) {
  if (!currentOpenCardId) return;
  
  const idea = ideas.find(i => i.id === currentOpenCardId);
  if (!idea) return;
  
  idea.category = newCategory;
  idea.updated_at = new Date().toISOString();
  
  save(idea);
  render();
  counts();
  closeCatModal();
  toast('Moved to ' + newCategory, 'success');
}

// Toggle marker on drop
function toggleMarker(id, marker, e) {
  if (e) e.stopPropagation();
  
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  
  if (!idea.markers) idea.markers = [];
  
  const index = idea.markers.indexOf(marker);
  if (index === -1) {
    idea.markers.push(marker);
  } else {
    idea.markers.splice(index, 1);
  }
  
  idea.updated_at = new Date().toISOString();
  save(idea);
  render();
}

// Archive drop
async function archiveDrop(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  
  idea.is_archived = true;
  idea.archived_at = new Date().toISOString();
  
  if (idea.supabase_id && currentUser) {
    try {
      await supabaseClient.from('drops').update({ 
        is_archived: true, 
        archived_at: idea.archived_at 
      }).eq('id', idea.supabase_id);
    } catch (e) { console.error('Archive sync error:', e); }
  }
  
  localStorage.setItem('droplit_ideas', JSON.stringify(ideas));
  render();
  counts();
  toast('Moved to archive', 'success');
  closeModal();
}

// Restore drop from archive
async function restoreDrop(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  
  idea.is_archived = false;
  idea.archived_at = null;
  
  if (idea.supabase_id && currentUser) {
    try {
      await supabaseClient.from('drops').update({ 
        is_archived: false, 
        archived_at: null 
      }).eq('id', idea.supabase_id);
    } catch (e) { console.error('Restore sync error:', e); }
  }
  
  localStorage.setItem('droplit_ideas', JSON.stringify(ideas));
  render();
  counts();
  toast('Restored from archive', 'success');
  closeModal();
}

// Toggle archive view
function toggleArchiveView() {
  showArchived = !showArchived;
  const btn = document.getElementById('archiveToggle');
  
  if (showArchived) {
    btn.classList.add('active');
    btn.textContent = 'X';
    btn.title = 'Back to main';
    toast('Showing archived drops', 'info');
  } else {
    btn.classList.remove('active');
    btn.textContent = 'A';
    btn.title = 'Show archive';
  }
  render();
}

// Filter drops
function filtered() {
  let f = [...ideas].filter(x => x && x.date);
  
  // Filter by archive status
  f = f.filter(x => showArchived ? x.is_archived : !x.is_archived);
  
  // Search filter
  if (searchMode && searchQuery) {
    f = f.filter(x => {
      const text = (x.text || '').toLowerCase();
      const notes = (x.notes || '').toLowerCase();
      return text.includes(searchQuery) || notes.includes(searchQuery);
    });
    return f;
  }
  
  // Time filter
  if (curTime === 'today') f = f.filter(x => isToday(x.date));
  else if (curTime === '7days') f = f.filter(x => inDays(x.date, 7));
  
  // Category filter
  if (curCat !== 'all') f = f.filter(x => x.category === curCat);
  
  return f;
}

// Reset filters to show all
function resetToShowAll() {
  curTime = 'all';
  curCat = 'all';
  
  document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.cat').forEach(b => b.classList.remove('active'));
  
  const allBtn = document.querySelector('.time-btn[data-time="all"]');
  if (allBtn) allBtn.classList.add('active');
}

// Selection mode
function enterSelectMode(id) {
  selectMode = true;
  selectedIds.clear();
  selectedIds.add(id);
  
  document.body.classList.add('select-mode');
  updateSelectBar();
  render();
}

function cancelSelect() {
  selectMode = false;
  selectedIds.clear();
  document.body.classList.remove('select-mode');
  render();
}

function toggleSelect(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  updateSelectBar();
  render();
}

function updateSelectBar() {
  const countEl = document.getElementById('selectCount');
  if (countEl) {
    countEl.textContent = selectedIds.size + ' selected';
  }
}

function deleteSelected() {
  if (selectedIds.size === 0) return;
  
  selectedIds.forEach(id => {
    const index = ideas.findIndex(i => i.id === id);
    if (index !== -1) {
      ideas.splice(index, 1);
      deleteDropFromServer(id);
    }
  });
  
  localStorage.setItem('droplit_ideas', JSON.stringify(ideas));
  cancelSelect();
  render();
  counts();
  toast('Deleted ' + selectedIds.size + ' drops', 'success');
}

// Get merged text for selected drops
function getMergedText(simple = false) {
  const selected = [...selectedIds].map(id => ideas.find(i => i.id === id)).filter(Boolean);
  
  if (simple) {
    return selected.map(i => i.text).join('\n\n');
  }
  
  return selected.map(i => {
    let text = i.text;
    if (i.notes) text += '\n[Notes: ' + i.notes + ']';
    return text;
  }).join('\n\n---\n\n');
}

console.log('Drops module loaded');
