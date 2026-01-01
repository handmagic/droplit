// ============================================
// DROPLIT MODALS - v0.9.59
// Modal dialogs and overlays
// ============================================

// Initialize modals container
function initModals() {
  const container = document.getElementById('modalsContainer');
  if (!container) return;
  
  // Insert all modal HTML
  container.innerHTML = getModalsHTML();
}

// Card modal - shows when clicking a drop
function showCardModal(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  
  currentOpenCardId = id;
  
  // Check if modal exists, create if not
  let modal = document.getElementById('cardModal');
  if (!modal) {
    const div = document.createElement('div');
    div.innerHTML = getCardModalHTML();
    document.body.appendChild(div.firstElementChild);
    modal = document.getElementById('cardModal');
  }
  
  // Populate content
  const titleEl = modal.querySelector('.modal-card-title');
  const textEl = modal.querySelector('.modal-card-text');
  const notesEl = modal.querySelector('.modal-card-notes');
  const catEl = modal.querySelector('.modal-card-cat');
  const timeEl = modal.querySelector('.modal-card-time');
  
  if (titleEl) titleEl.textContent = idea.category || 'inbox';
  if (textEl) textEl.textContent = idea.text || '';
  if (notesEl) notesEl.value = idea.notes || '';
  if (catEl) catEl.textContent = idea.category || 'inbox';
  if (timeEl) timeEl.textContent = (idea.date || '') + ' ' + (idea.time || '');
  
  // Show modal
  modal.classList.add('show');
}

function closeModal() {
  const modal = document.getElementById('cardModal');
  if (modal) modal.classList.remove('show');
  currentOpenCardId = null;
}

// Category change modal
function showCatModal() {
  const modal = document.getElementById('catModal');
  if (modal) modal.classList.add('show');
}

function closeCatModal() {
  const modal = document.getElementById('catModal');
  if (modal) modal.classList.remove('show');
}

// Delete confirmation
function confirmDelete() {
  if (!currentOpenCardId) return;
  deleteIdea(currentOpenCardId);
}

// Text input modal
function showTextInput() {
  const modal = document.getElementById('textInputModal');
  if (modal) {
    modal.classList.add('show');
    const input = modal.querySelector('textarea');
    if (input) {
      input.value = '';
      input.focus();
    }
  }
}

function closeTextInput() {
  const modal = document.getElementById('textInputModal');
  if (modal) modal.classList.remove('show');
}

function saveTextInput() {
  const modal = document.getElementById('textInputModal');
  const input = modal?.querySelector('textarea');
  if (input && input.value.trim()) {
    saveIdea(input.value.trim());
    closeTextInput();
  }
}

// Plus menu
function togglePlusMenu() {
  const menu = document.getElementById('plusMenu');
  if (menu) {
    menu.classList.toggle('show');
  } else {
    showTextInput();
  }
}

// Main menu
function toggleMainMenu() {
  const menu = document.getElementById('mainMenu');
  const btn = document.getElementById('menuToggleBtn');
  
  if (menu) {
    const isOpen = menu.classList.toggle('show');
    btn?.classList.toggle('active', isOpen);
  }
}

function closeMainMenu() {
  const menu = document.getElementById('mainMenu');
  const btn = document.getElementById('menuToggleBtn');
  if (menu) menu.classList.remove('show');
  if (btn) btn.classList.remove('active');
}

// About modal
function showAbout() {
  const modal = document.getElementById('aboutModal');
  if (modal) modal.classList.add('show');
}

function closeAbout() {
  const modal = document.getElementById('aboutModal');
  if (modal) modal.classList.remove('show');
}

// Settings modal
function showSettings() {
  closeMainMenu();
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.add('show');
}

function closeSettings() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.remove('show');
}

// Add category prompt
function addCatPrompt() {
  toast('Custom categories coming soon!', 'info');
}

// ============================================
// MODAL HTML TEMPLATES
// ============================================

function getCardModalHTML() {
  return '<div class="overlay" id="cardModal" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal type-b">' +
      '<div class="modal-header">' +
        '<span class="modal-card-cat">inbox</span>' +
        '<span class="modal-card-time"></span>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="modal-card-text"></div>' +
        '<textarea class="modal-card-notes" placeholder="Add notes..." onchange="updateDropNotes(currentOpenCardId, this.value)"></textarea>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="modal-btn" onclick="showCatModal()">Move</button>' +
        '<button class="modal-btn" onclick="speakDrop(currentOpenCardId)">Speak</button>' +
        '<button class="modal-btn danger" onclick="confirmDelete()">Delete</button>' +
        '<button class="modal-btn pri" onclick="closeModal()">Done</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function getModalsHTML() {
  return '' +
    // Text input modal
    '<div class="text-input-modal" id="textInputModal">' +
      '<div class="text-input-content">' +
        '<textarea placeholder="Type your idea..." maxlength="5000"></textarea>' +
        '<div class="text-input-actions">' +
          '<button class="pill-m sec" onclick="closeTextInput()">Cancel</button>' +
          '<button class="pill-m pri" onclick="saveTextInput()">Save</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    
    // Category modal
    '<div class="overlay" id="catModal" onclick="if(event.target===this)closeCatModal()">' +
      '<div class="modal type-b">' +
        '<div class="modal-header"><h3>Move to Category</h3></div>' +
        '<div class="modal-body">' +
          '<div class="cat-grid">' +
            '<button class="cat-opt" onclick="changeCat(\'tasks\')">Tasks</button>' +
            '<button class="cat-opt" onclick="changeCat(\'ideas\')">Ideas</button>' +
            '<button class="cat-opt" onclick="changeCat(\'handmagic\')">Handmagic</button>' +
            '<button class="cat-opt" onclick="changeCat(\'design\')">Design</button>' +
            '<button class="cat-opt" onclick="changeCat(\'bugs\')">Bugs</button>' +
            '<button class="cat-opt" onclick="changeCat(\'questions\')">Questions</button>' +
            '<button class="cat-opt" onclick="changeCat(\'inbox\')">Inbox</button>' +
          '</div>' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button class="modal-btn sec" onclick="closeCatModal()">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    
    // About modal
    '<div class="overlay" id="aboutModal" onclick="if(event.target===this)closeAbout()">' +
      '<div class="modal">' +
        '<div class="about-brand">' +
          '<div class="about-logo"><svg viewBox="0 0 24 24" fill="white"><path d="M12 2C12 2 5 10.5 5 15C5 18.866 8.134 22 12 22C15.866 22 19 18.866 19 15C19 10.5 12 2 12 2Z"/></svg></div>' +
          '<div class="about-name">DropLit</div>' +
          '<div class="about-ver">v0.9.59 by Syntrise</div>' +
        '</div>' +
        '<div class="modal-text" style="text-align:center">Voice-first idea capture with AI assistant.</div>' +
        '<div class="modal-actions"><button class="modal-btn pri" onclick="closeAbout()">Got it</button></div>' +
      '</div>' +
    '</div>' +
    
    // Settings modal  
    '<div class="overlay" id="settingsModal" onclick="if(event.target===this)closeSettings()">' +
      '<div class="modal type-b">' +
        '<div class="modal-header"><h3>Settings</h3></div>' +
        '<div class="modal-body">' +
          '<div class="settings-section">' +
            '<label>Font Size</label>' +
            '<div id="fontSizeSelector" class="pill-row">' +
              '<button class="pill-m" data-size="small" onclick="setFontSize(\'small\')">S</button>' +
              '<button class="pill-m" data-size="medium" onclick="setFontSize(\'medium\')">M</button>' +
              '<button class="pill-m" data-size="large" onclick="setFontSize(\'large\')">L</button>' +
            '</div>' +
          '</div>' +
          '<div class="settings-section">' +
            '<label>Last Sync</label>' +
            '<span id="lastSyncInfo">-</span>' +
          '</div>' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button class="modal-btn sec" onclick="manualSync()">Sync Now</button>' +
          '<button class="modal-btn pri" onclick="closeSettings()">Done</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    
    // Main menu
    '<div class="main-menu" id="mainMenu">' +
      '<div class="menu-items">' +
        '<button class="menu-item" onclick="showSettings()">Settings</button>' +
        '<button class="menu-item" onclick="showAbout()">About</button>' +
        '<button class="menu-item" onclick="toggleDarkMode()">Dark Mode</button>' +
      '</div>' +
    '</div>' +
    
    // ASK AI Panel
    '<div class="ask-ai-panel" id="askAIPanel">' +
      '<div class="ask-ai-header">' +
        '<button class="ask-ai-close" onclick="closeAskAI()"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
        '<div class="ask-ai-title">ASKI</div>' +
        '<div class="ask-ai-controls">' +
          '<button class="ask-ai-control-btn" id="autoSpeakBtn" onclick="toggleAutoSpeak()" title="Auto-speak">S</button>' +
          '<button class="ask-ai-control-btn" id="autoDropIndicator" onclick="toggleAutoDrop()" title="Auto-drop">D</button>' +
        '</div>' +
      '</div>' +
      '<div class="ask-ai-messages" id="askAIMessages"></div>' +
      '<div class="ask-ai-input-wrap">' +
        '<textarea class="ask-ai-input" id="askAIInput" placeholder="Ask anything..." maxlength="2000" rows="2" oninput="updateAskAICharCount(); autoResizeTextarea(this);" onkeypress="if(event.key===\'Enter\' && !event.shiftKey && this.value.trim()) { event.preventDefault(); sendAskAIMessage(); }"></textarea>' +
        '<button class="ask-ai-btn ask-ai-btn-send" onclick="sendAskAIMessage()"><svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg></button>' +
      '</div>' +
      '<div class="ask-ai-char-count" id="askAICharCount">0 / 2000</div>' +
    '</div>';
}

console.log('Modals module loaded');
