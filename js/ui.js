// ============================================
// DROPLIT UI - v0.9.59
// UI rendering and interactions
// ============================================

// Render drops list
function render() {
  const wrap = document.getElementById('ideasList');
  const empty = document.getElementById('emptyState');
  const list = filtered();
  
  if (!list.length) {
    wrap.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  
  empty.style.display = 'none';
  
  // Group by date
  const grp = {};
  for (const i of list) {
    if (!grp[i.date]) grp[i.date] = [];
    grp[i.date].push(i);
  }
  
  let dates = Object.keys(grp).sort((a, b) => sortAsc ? parseD(a) - parseD(b) : parseD(b) - parseD(a));
  
  let h = '';
  const td = new Date().toLocaleDateString('ru-RU');
  const yd = new Date(Date.now() - 864e5).toLocaleDateString('ru-RU');
  
  for (const d of dates) {
    let lbl = d;
    if (d === td) lbl = 'Today';
    else if (d === yd) lbl = 'Yesterday';
    
    h += '<div class="date-sep">' + lbl + '</div>';
    
    // Sort within day
    let dayIdeas = grp[d].slice().sort((a, b) => {
      const tsA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tsB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return sortAsc ? tsA - tsB : tsB - tsA;
    });
    
    for (const idea of dayIdeas) {
      h += renderCard(idea);
    }
  }
  
  wrap.innerHTML = h;
}

// Render single card
function renderCard(idea) {
  const isSelected = selectMode && selectedIds.has(idea.id);
  const catClass = 'cat-' + (idea.category || 'inbox');
  const archivedClass = idea.is_archived ? ' archived' : '';
  
  let markersHtml = '';
  if (idea.markers && idea.markers.length) {
    markersHtml = '<div class="card-markers">';
    idea.markers.forEach(m => {
      const marker = MARKERS[m];
      if (marker) {
        markersHtml += '<span class="card-marker" style="color:' + marker.color + '">' + marker.icon + '</span>';
      }
    });
    markersHtml += '</div>';
  }
  
  let mediaHtml = '';
  if (idea.image) {
    mediaHtml = '<div class="card-media"><img src="' + idea.image + '" alt=""></div>';
  }
  
  let notesHtml = '';
  if (idea.notes) {
    notesHtml = '<div class="card-notes">' + escapeHtml(truncate(idea.notes, 50)) + '</div>';
  }
  
  const text = escapeHtml(idea.text || '');
  
  return '<div class="card ' + catClass + archivedClass + (isSelected ? ' selected' : '') + '" data-id="' + idea.id + '" ' +
    'onclick="handleCardClick(' + idea.id + ', event)" ' +
    'ontouchstart="cardTouchStart(' + idea.id + ', event)" ' +
    'ontouchmove="cardTouchMove(event)" ' +
    'ontouchend="cardTouchEnd()">' +
    '<div class="card-header">' +
      '<span class="card-cat">' + (idea.category || 'inbox') + '</span>' +
      '<span class="card-time">' + (idea.time || '') + '</span>' +
    '</div>' +
    mediaHtml +
    '<div class="card-text">' + text + '</div>' +
    notesHtml +
    markersHtml +
  '</div>';
}

// Update counts
function counts() {
  const all = ideas.filter(x => !x.is_archived);
  const today = all.filter(x => isToday(x.date));
  const week = all.filter(x => inDays(x.date, 7));
  
  const setCnt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  
  setCnt('cntAll', all.length);
  setCnt('cntToday', today.length);
  setCnt('cnt7d', week.length);
  
  // Category counts
  const cats = ['tasks', 'ideas', 'handmagic', 'design', 'bugs', 'questions', 'inbox', 'audio', 'photo', 'sketch', 'scan'];
  cats.forEach(cat => {
    const count = all.filter(x => x.category === cat).length;
    setCnt('cnt' + cat.charAt(0).toUpperCase() + cat.slice(1), count);
  });
}

// Handle card click
function handleCardClick(id, e) {
  if (selectMode) {
    toggleSelect(id);
    return;
  }
  
  // Ignore clicks on buttons inside card
  if (e.target.closest('button')) return;
  
  showCardModal(id);
}

// Card touch handling for long press
function cardTouchStart(id, e) {
  touchStartTime = Date.now();
  touchMoved = false;
  
  longPressTimer = setTimeout(() => {
    if (!touchMoved) {
      enterSelectMode(id);
      if (navigator.vibrate) navigator.vibrate(50);
    }
  }, 500);
}

function cardTouchMove(e) {
  touchMoved = true;
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function cardTouchEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

// Toggle filters visibility
function toggleFilters() {
  document.body.classList.toggle('filters-visible');
  document.getElementById('logoBtn').classList.toggle('filters-open');
}

// Toggle sort order
function toggleSort() {
  sortAsc = !sortAsc;
  const btn = document.getElementById('sortBtn');
  if (btn) {
    btn.innerHTML = sortAsc ? 
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 15l-6-6-6 6"/></svg>' :
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>';
    btn.classList.toggle('desc', !sortAsc);
  }
  render();
}

// Time filter click handler
function initTimeFilter() {
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const time = btn.dataset.time;
      curTime = time;
      
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      render();
    });
  });
  
  // Set default active
  const allBtn = document.querySelector('.time-btn[data-time="all"]');
  if (allBtn) allBtn.classList.add('active');
}

// Category filter click handler
function initCatFilter() {
  document.querySelectorAll('.cat').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.category;
      
      if (curCat === cat) {
        curCat = 'all';
        btn.classList.remove('active');
      } else {
        curCat = cat;
        document.querySelectorAll('.cat').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
      
      render();
    });
  });
}

// Scroll position handling
function initScrollButtons() {
  ideasWrap = document.getElementById('ideasWrap');
  scrollTopBtn = document.getElementById('scrollTopBtn');
  scrollBottomBtn = document.getElementById('scrollBottomBtn');
  
  if (!ideasWrap) return;
  
  ideasWrap.addEventListener('scroll', () => {
    const scrollTop = ideasWrap.scrollTop;
    const scrollHeight = ideasWrap.scrollHeight;
    const clientHeight = ideasWrap.clientHeight;
    
    if (scrollTopBtn) {
      scrollTopBtn.classList.toggle('show', scrollTop > 200);
    }
    if (scrollBottomBtn) {
      scrollBottomBtn.classList.toggle('show', scrollHeight - scrollTop - clientHeight > 200);
    }
  });
}

// Search functionality
function startSearch() {
  searchMode = true;
  document.getElementById('searchIndicator').style.display = 'flex';
  // Show search input modal or inline
}

function clearSearch() {
  searchMode = false;
  searchQuery = '';
  document.getElementById('searchIndicator').style.display = 'none';
  render();
}

function performSearch(query) {
  searchQuery = query.toLowerCase();
  document.getElementById('searchQueryDisplay').textContent = query;
  render();
}

// Dark mode
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('droplit_darkmode', isDark);
}

// Font size
function setFontSize(size) {
  document.body.classList.remove('font-small', 'font-medium', 'font-large');
  document.body.classList.add('font-' + size);
  localStorage.setItem('droplit_fontsize', size);
  
  document.querySelectorAll('#fontSizeSelector .pill-m').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector('#fontSizeSelector .pill-m[data-size="' + size + '"]');
  if (activeBtn) activeBtn.classList.add('active');
}

function initFontSize() {
  const saved = localStorage.getItem('droplit_fontsize') || 'medium';
  setFontSize(saved);
}

console.log('UI module loaded');
