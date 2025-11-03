// State Management
let state = {
  boards: [],
  currentBoardId: null,
  dashboardConfig: {
    widgets: [
      { id: 'stats-cards', name: 'Statistics Cards', visible: true, order: 1, description: 'Total and per-column counts' },
      { id: 'column-chart', name: 'Projects by Column Chart', visible: true, order: 2, description: 'Bar chart distribution' },
      { id: 'engagement', name: 'Engagement Metrics', visible: true, order: 3, description: 'Links, comments, activities' },
      { id: 'recent-activity', name: 'Recent Activity Feed', visible: true, order: 4, description: 'Last 10 activities' },
      { id: 'top-projects', name: 'Most Active Projects', visible: true, order: 5, description: 'Top 5 by activity' },
      { id: 'completion-rate', name: 'Completion Rate', visible: true, order: 6, description: 'Progress bar' }
    ],
    filters: {
      dateRange: 'all',
      column: 'all',
      status: 'all',
      customDateFrom: null,
      customDateTo: null
    },
    customMetrics: [],
    settings: {
      autoRefresh: false,
      theme: 'default'
    }
  }
};

// View Management
let currentView = 'board'; // 'board', 'list', or 'dashboard'
let listSortColumn = 'projectId';
let listSortDirection = 'asc';

// Drill-down state
let drillDownFilter = null;

// Early visibility check (before DOMContentLoaded)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', earlyVisibilityCheck);
} else {
  earlyVisibilityCheck();
}

function earlyVisibilityCheck() {
  console.log('\n=== Early Visibility Check ===');
  console.log('Location:', window.location.href);
  console.log('Document ready state:', document.readyState);
  
  // Check buttons
  const checkButton = (id) => {
    const btn = document.getElementById(id);
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const computed = window.getComputedStyle(btn);
      console.log(`${id}:`, {
        exists: true,
        display: computed.display,
        visibility: computed.visibility,
        opacity: computed.opacity,
        dimensions: `${rect.width}x${rect.height}`,
        position: `top:${rect.top}, left:${rect.left}`
      });
    } else {
      console.error(`${id}: NOT FOUND`);
    }
  };
  
  checkButton('export-json-btn');
  checkButton('import-json-btn');
  checkButton('export-sheets-btn');
  
  // Check navbar-actions container
  const navbarActions = document.querySelector('.navbar-actions');
  if (navbarActions) {
    const computed = window.getComputedStyle(navbarActions);
    console.log('navbar-actions container:', {
      display: computed.display,
      visibility: computed.visibility,
      children: navbarActions.children.length
    });
  } else {
    console.error('navbar-actions container: NOT FOUND');
  }
  
  console.log('=== End Early Check ===\n');
}

// Storage Configuration
const STORAGE_KEY = 'kanbanBoardData_v1';
let storageAvailable = false;
let storageAPI = null;

// Check storage availability
function checkStorageAvailability() {
  try {
    // Check if storage exists and is accessible
    if (typeof window !== 'undefined' && window['local' + 'Storage']) {
      const testKey = '__storage_test__';
      const storage = window['local' + 'Storage'];
      storage.setItem(testKey, 'test');
      storage.removeItem(testKey);
      storageAPI = storage;
      return true;
    }
    return false;
  } catch (e) {
    console.warn('Storage not available:', e.message);
    return false;
  }
}

// Load data from storage
function loadData() {
  try {
    if (!storageAvailable || !storageAPI) {
      console.log('Storage not available, starting fresh');
      return false;
    }
    
    const savedData = storageAPI.getItem(STORAGE_KEY);
    
    if (savedData && savedData !== 'undefined' && savedData !== 'null') {
      const parsed = JSON.parse(savedData);
      
      // Validate data structure
      if (parsed && parsed.boards && Array.isArray(parsed.boards)) {
        state.boards = parsed.boards;
        state.currentBoardId = parsed.currentBoardId || null;
        
        // Load dashboard config if exists
        if (parsed.dashboardConfig) {
          state.dashboardConfig = { ...state.dashboardConfig, ...parsed.dashboardConfig };
        }
        
        console.log('✅ Data loaded successfully:', state.boards.length, 'boards');
        showToast(`Loaded ${state.boards.length} board(s) from storage`);
        updateStorageStatus('Loaded', true);
        return true;
      }
    }
    
    console.log('No saved data found');
    return false;
    
  } catch (error) {
    console.error('Error loading data:', error);
    showToast('⚠️ Error loading saved data. Starting fresh.');
    return false;
  }
}

// Save data to storage
function saveData() {
  try {
    if (!storageAvailable || !storageAPI) {
      // Silent fail - storage not available
      return false;
    }
    
    const dataToSave = {
      boards: state.boards,
      currentBoardId: state.currentBoardId,
      dashboardConfig: state.dashboardConfig,
      lastSaved: Date.now(),
      version: '1.0'
    };
    
    const jsonString = JSON.stringify(dataToSave);
    storageAPI.setItem(STORAGE_KEY, jsonString);
    
    console.log('💾 Data saved successfully');
    updateStorageStatus('Saved', true);
    return true;
    
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.error('Storage quota exceeded');
      showToast('⚠️ Storage full! Export backup immediately.');
      updateStorageStatus('Storage full', false);
    } else {
      console.error('Error saving data:', error);
      showToast('⚠️ Could not save. Export backup recommended.');
      updateStorageStatus('Save failed', false);
    }
    return false;
  }
}

// Current editing context
let currentContext = {
  boardId: null,
  columnId: null,
  projectId: null,
  linkId: null,
  commentId: null
};

// Drag and drop state
let dragState = {
  type: null, // 'column' or 'project'
  sourceId: null,
  sourceColumnId: null,
  sourceIndex: null
};

// Widget Builder State
let widgetBuilderState = {
  currentStep: 1,
  selectedType: null,
  dataSource: 'built-in',
  selectedMetric: null,
  widgetConfig: {
    name: '',
    icon: '🎯',
    color: '#6366f1',
    size: 'medium',
    drilldown: true
  }
};

// Custom widgets storage
if (!state.customWidgets) {
  state.customWidgets = [];
}

// Utility Functions
function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Refresh dashboard if currently viewing it
function refreshDashboardIfActive() {
  if (currentView === 'dashboard') {
    renderDashboard();
  }
}

function formatTimestamp(date) {
  const d = new Date(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  
  return `${month} ${day}, ${year} at ${hours}:${minutes} ${ampm}`;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

function updateStorageStatus(message, isSuccess = true) {
  const statusElement = document.getElementById('storage-status');
  const actionElement = document.getElementById('last-action');
  
  if (statusElement && message) {
    statusElement.textContent = message;
    statusElement.style.color = isSuccess ? 'var(--color-primary)' : 'var(--color-error)';
  }
  
  if (actionElement) {
    const now = new Date();
    actionElement.textContent = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setTimeout(() => {
      actionElement.textContent = '';
    }, 3000);
  }
}

// Backup Reminder System
function checkBackupReminder() {
  if (!storageAvailable || !storageAPI) return;
  
  try {
    const lastBackup = storageAPI.getItem('lastBackupTime');
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    
    if (state.boards.length === 0) return;
    
    if (!lastBackup || (now - parseInt(lastBackup)) > oneWeek) {
      setTimeout(() => {
        const reminder = document.getElementById('backupReminder');
        if (reminder) {
          reminder.classList.remove('hidden');
        }
      }, 5000);
    }
  } catch (e) {
    console.warn('Could not check backup reminder:', e);
  }
}

function dismissBackupReminder() {
  const reminder = document.getElementById('backupReminder');
  if (reminder) {
    reminder.classList.add('hidden');
  }
  if (storageAvailable && storageAPI) {
    try {
      storageAPI.setItem('lastBackupTime', Date.now().toString());
    } catch (e) {
      console.warn('Could not save backup time:', e);
    }
  }
}

// Debug Info Panel (Ctrl+Shift+D)
function showDebugInfo() {
  let storageSize = 0;
  let lastBackupTime = 'N/A';
  
  if (storageAvailable && storageAPI) {
    try {
      const data = storageAPI.getItem(STORAGE_KEY) || '';
      storageSize = new Blob([data]).size;
      lastBackupTime = storageAPI.getItem('lastBackupTime') || 'N/A';
    } catch (e) {
      console.warn('Could not read storage info:', e);
    }
  }
  
  const info = {
    storageAvailable: storageAvailable,
    boardsCount: state.boards.length,
    currentBoardId: state.currentBoardId,
    storageUsed: `${(storageSize / 1024).toFixed(2)} KB`,
    lastBackup: lastBackupTime,
    totalProjects: state.boards.reduce((sum, b) => 
      sum + b.columns.reduce((s, c) => s + c.projects.length, 0), 0)
  };
  
  console.log('🔍 Debug Info:', info);
  alert(`Kanban Board Debug Info\n\n${JSON.stringify(info, null, 2)}`);
}

// JSON Export Functionality
function exportToJSON() {
  try {
    if (state.boards.length === 0) {
      showToast('No data to export');
      return;
    }
    
    const projectCount = state.boards.reduce((sum, b) => 
      sum + b.columns.reduce((s, c) => s + c.projects.length, 0), 0);
    
    const dataToExport = {
      boards: state.boards,
      currentBoardId: state.currentBoardId,
      exportedAt: Date.now(),
      exportedAtFormatted: formatTimestamp(Date.now()),
      version: '1.0',
      boardCount: state.boards.length,
      projectCount: projectCount
    };
    
    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().split('T')[0];
    a.download = `kanban-backup-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Update last backup time
    if (storageAvailable && storageAPI) {
      try {
        storageAPI.setItem('lastBackupTime', Date.now().toString());
      } catch (e) {
        console.warn('Could not save backup time:', e);
      }
    }
    
    showToast(`✅ Backup downloaded: ${dataToExport.boardCount} boards, ${dataToExport.projectCount} projects`);
    updateStorageStatus('Exported', true);
    console.log('Export successful:', dataToExport.boardCount, 'boards,', dataToExport.projectCount, 'projects');
  } catch (error) {
    console.error('Error exporting data:', error);
    showToast('Error exporting data');
  }
}

// JSON Import Functionality
function importFromJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        
        // Validate data structure
        if (!importedData.boards || !Array.isArray(importedData.boards)) {
          showToast('❌ Invalid backup file format');
          return;
        }
        
        const boardCount = importedData.boards.length;
        const projectCount = importedData.projectCount || importedData.boards.reduce((sum, b) => 
          sum + b.columns.reduce((s, c) => s + c.projects.length, 0), 0);
        
        // Confirm before overwriting
        if (state.boards.length > 0) {
          if (!confirm(`Import ${boardCount} boards with ${projectCount} projects?\n\nThis will replace all current data.`)) {
            return;
          }
        }
        
        state.boards = importedData.boards;
        state.currentBoardId = importedData.currentBoardId;
        
        // Save to localStorage
        saveData();
        
        // Render UI
        if (state.boards.length > 0) {
          const board = state.boards.find(b => b.id === state.currentBoardId) || state.boards[0];
          state.currentBoardId = board.id;
          renderBoard();
          updateBoardSelector();
        } else {
          renderBoard();
          updateBoardSelector();
        }
        
        showToast(`✅ Imported ${boardCount} boards with ${projectCount} projects!`);
        updateStorageStatus('Imported', true);
        console.log('Import successful');
      } catch (error) {
        console.error('Error importing data:', error);
        showToast('❌ Error importing data. Invalid file format.');
      }
    };
    
    reader.readAsText(file);
  };
  
  input.click();
}

// Google Sheets Export Functionality
function exportToGoogleSheets() {
  try {
    if (state.boards.length === 0) {
      showToast('No data to export');
      return;
    }
    
    // Prepare CSV data for Google Sheets
    let csvContent = '';
    
    // Add header
    csvContent += 'Board Name,Column Name,Project ID,Project Name,Description,Links,Comments,Created Date\n';
    
    // Loop through all boards
    state.boards.forEach(board => {
      board.columns.forEach(column => {
        column.projects.forEach(project => {
          const links = project.links ? project.links.map(l => `${l.title}: ${l.url}`).join(' | ') : '';
          const comments = project.comments ? project.comments.map(c => c.text).join(' | ') : '';
          
          // Escape CSV values
          const escape = (str) => {
            if (!str) return '';
            str = String(str).replace(/"/g, '""');
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
              return `"${str}"`;
            }
            return str;
          };
          
          const createdActivity = project.activityLog ? project.activityLog.find(a => a.action === 'created') : null;
          const createdDate = createdActivity ? formatTimestamp(createdActivity.timestamp) : 'Unknown';
          
          csvContent += [
            escape(board.name),
            escape(column.title),
            escape(project.projectId),
            escape(project.projectName),
            escape(project.description),
            escape(links),
            escape(comments),
            escape(createdDate)
          ].join(',') + '\n';
        });
      });
    });
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `kanban-export-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('CSV exported! Upload to Google Sheets');
    updateStorageStatus('Exported', true);
    
    // Show instructions
    setTimeout(() => {
      alert('CSV file downloaded!\n\nTo import to Google Sheets:\n1. Go to sheets.google.com\n2. Create a new sheet\n3. File → Import → Upload\n4. Select the downloaded CSV file\n5. Click "Import data"');
    }, 500);
    
  } catch (error) {
    console.error('Error exporting to sheets:', error);
    showToast('Error exporting data');
  }
}

// Activity Log Helper
function logActivity(boardId, columnId, projectId, action, description, oldValue = null, newValue = null) {
  const board = state.boards.find(b => b.id === boardId);
  if (!board) return;
  
  const column = board.columns.find(c => c.id === columnId);
  if (!column) return;
  
  const project = column.projects.find(p => p.id === projectId);
  if (!project) return;
  
  if (!project.activityLog) {
    project.activityLog = [];
  }
  
  const activity = {
    id: generateId('activity'),
    action: action,
    description: description,
    timestamp: Date.now(),
    oldValue: oldValue,
    newValue: newValue
  };
  
  // Add to beginning (newest first)
  project.activityLog.unshift(activity);
  
  // No limit - show all activities
}

function truncateText(text, maxLength = 50) {
  if (!text) return '';
  const strText = String(text);
  if (strText.length <= maxLength) return strText;
  return strText.substring(0, maxLength - 3) + '...';
}

function getActivityIcon(action) {
  const icons = {
    'created': '✨',
    'name_changed': '✏️',
    'id_changed': '✏️',
    'description_updated': '✏️',
    'moved': '➡️',
    'link_added': '🔗',
    'link_updated': '🔗',
    'link_title_updated': '🔗',
    'link_url_updated': '🔗',
    'link_deleted': '🗑️',
    'comment_added': '💬',
    'comment_updated': '💬',
    'comment_deleted': '🗑️'
  };
  return icons[action] || '📝';
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

function openModal(modalId) {
  document.getElementById(modalId).classList.remove('hidden');
}

// Board Management
// Clear All Data Functionality
function clearAllData() {
  if (state.boards.length === 0) {
    showToast('No data to clear');
    return;
  }
  
  if (confirm('⚠️ This will DELETE ALL data permanently. Are you sure?\n\nMake sure you have exported a backup first!')) {
    if (confirm('Really delete everything? This cannot be undone!')) {
      state.boards = [];
      state.currentBoardId = null;
      saveData();
      updateBoardSelector();
      renderBoard();
      showToast('All data cleared');
      updateStorageStatus('Saved', true);
    }
  }
}

function createBoard(name, projectIdPrefix, description) {
  const board = {
    id: generateId('board'),
    name: name,
    projectIdPrefix: projectIdPrefix.toUpperCase(),
    description: description,
    columns: [
      {
        id: generateId('col'),
        title: 'To Do',
        order: 0,
        projects: []
      },
      {
        id: generateId('col'),
        title: 'In Progress',
        order: 1,
        projects: []
      },
      {
        id: generateId('col'),
        title: 'Done',
        order: 2,
        projects: []
      }
    ]
  };
  
  state.boards.push(board);
  state.currentBoardId = board.id;
  saveData();
  updateBoardSelector();
  renderBoard();
  showToast('Board created successfully');
  updateStorageStatus('Saved', true);
  return board;
}

function updateBoard(boardId, updates) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    Object.assign(board, updates);
    saveData();
    if (boardId === state.currentBoardId) {
      renderBoard();
    }
    updateBoardSelector();
    updateStorageStatus('Saved', true);
  }
}

function deleteBoard(boardId) {
  const index = state.boards.findIndex(b => b.id === boardId);
  if (index !== -1) {
    const boardName = state.boards[index].name;
    state.boards.splice(index, 1);
    if (state.currentBoardId === boardId) {
      state.currentBoardId = state.boards.length > 0 ? state.boards[0].id : null;
    }
    saveData();
    updateBoardSelector();
    renderBoard();
    showToast('Board deleted');
    updateStorageStatus('Saved', true);
  }
}

function getCurrentBoard() {
  return state.boards.find(b => b.id === state.currentBoardId);
}

// Column Management
function createColumn(boardId, title) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    const column = {
      id: generateId('col'),
      title: title,
      order: board.columns.length,
      projects: []
    };
    board.columns.push(column);
    saveData();
    renderBoard();
    refreshDashboardIfActive();
    showToast('Column added');
    updateStorageStatus('Saved', true);
    return column;
  }
}

function updateColumn(boardId, columnId, updates) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    const column = board.columns.find(c => c.id === columnId);
    if (column) {
      Object.assign(column, updates);
      saveData();
      renderBoard();
      refreshDashboardIfActive();
    }
  }
}

function deleteColumn(boardId, columnId) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    const columnIndex = board.columns.findIndex(c => c.id === columnId);
    if (columnIndex !== -1) {
      const columnTitle = board.columns[columnIndex].title;
      board.columns.splice(columnIndex, 1);
      // Update order
      board.columns.forEach((col, idx) => col.order = idx);
      saveData();
      renderBoard();
      refreshDashboardIfActive();
      showToast('Column deleted');
      updateStorageStatus('Saved', true);
    }
  }
}

function reorderColumns(boardId, fromIndex, toIndex) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    const [removed] = board.columns.splice(fromIndex, 1);
    board.columns.splice(toIndex, 0, removed);
    board.columns.forEach((col, idx) => col.order = idx);
    saveData();
    renderBoard();
    refreshDashboardIfActive();
  }
}

// Project Management
function getNextProjectNumber(boardId) {
  const board = state.boards.find(b => b.id === boardId);
  if (!board) return 1;
  
  let maxNumber = 0;
  board.columns.forEach(column => {
    column.projects.forEach(project => {
      const match = project.projectId.match(/-?(\d+)$/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNumber) maxNumber = num;
      }
    });
  });
  
  return maxNumber + 1;
}

function createProject(boardId, columnId) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    const column = board.columns.find(c => c.id === columnId);
    if (column) {
      const projectNumber = getNextProjectNumber(boardId);
      const project = {
        id: generateId('proj'),
        projectId: `${board.projectIdPrefix}-${String(projectNumber).padStart(3, '0')}`,
        projectName: 'New Project',
        description: '',
        links: [],
        comments: [],
        activityLog: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      column.projects.push(project);
      // Log project creation with column name
      logActivity(boardId, columnId, project.id, 'created', `Project created in '${column.title}'`);
      saveData();
      renderBoard();
      refreshDashboardIfActive();
      updateStorageStatus('Saved', true);
      // Open project modal for editing
      openProjectModal(boardId, columnId, project.id);
      return project;
    }
  }
}

function updateProject(boardId, columnId, projectId, updates) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    const column = board.columns.find(c => c.id === columnId);
    if (column) {
      const project = column.projects.find(p => p.id === projectId);
      if (project) {
        // Track changes and log activities with old/new values
        if (updates.projectName && updates.projectName !== project.projectName) {
          const oldName = project.projectName;
          const newName = updates.projectName;
          logActivity(boardId, columnId, projectId, 'name_changed', 
            'Project name changed',
            oldName, newName);
        }
        if (updates.projectId && updates.projectId !== project.projectId) {
          const oldId = project.projectId;
          const newId = updates.projectId;
          logActivity(boardId, columnId, projectId, 'id_changed', 
            'Project ID changed',
            oldId, newId);
        }
        if (updates.description !== undefined && updates.description !== project.description) {
          const oldDesc = project.description;
          const newDesc = updates.description;
          logActivity(boardId, columnId, projectId, 'description_updated', 
            'Description updated',
            oldDesc, newDesc);
        }
        
        Object.assign(project, updates);
        saveData();
        renderBoard();
        refreshDashboardIfActive();
        updateStorageStatus('Saved', true);
      }
    }
  }
}

function deleteProject(boardId, columnId, projectId) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    const column = board.columns.find(c => c.id === columnId);
    if (column) {
      const projectIndex = column.projects.findIndex(p => p.id === projectId);
      if (projectIndex !== -1) {
        const projectName = column.projects[projectIndex].projectName;
        column.projects.splice(projectIndex, 1);
        saveData();
        renderBoard();
        refreshDashboardIfActive();
        showToast('Project deleted');
        updateStorageStatus('Saved', true);
      }
    }
  }
}

function moveProject(boardId, fromColumnId, toColumnId, projectId, toIndex) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    const fromColumn = board.columns.find(c => c.id === fromColumnId);
    const toColumn = board.columns.find(c => c.id === toColumnId);
    
    if (fromColumn && toColumn && fromColumnId !== toColumnId) {
      const projectIndex = fromColumn.projects.findIndex(p => p.id === projectId);
      if (projectIndex !== -1) {
        const [project] = fromColumn.projects.splice(projectIndex, 1);
        toColumn.projects.splice(toIndex, 0, project);
        
        // Log the move with column names
        logActivity(boardId, toColumnId, projectId, 'moved', 
          `Moved from '${fromColumn.title}' to '${toColumn.title}'`);
        
        saveData();
        renderBoard();
        refreshDashboardIfActive();
      }
    } else if (fromColumn && toColumn && fromColumnId === toColumnId) {
      // Just reordering within same column
      const projectIndex = fromColumn.projects.findIndex(p => p.id === projectId);
      if (projectIndex !== -1) {
        const [project] = fromColumn.projects.splice(projectIndex, 1);
        toColumn.projects.splice(toIndex, 0, project);
        saveData();
        renderBoard();
        refreshDashboardIfActive();
      }
    }
  }
}

// Link Management
function addLink(boardId, columnId, projectId, url, title) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    const column = board.columns.find(c => c.id === columnId);
    if (column) {
      const project = column.projects.find(p => p.id === projectId);
      if (project) {
        const link = {
          id: generateId('link'),
          url: url,
          title: title,
          timestamp: new Date()
        };
        project.links.push(link);
        
        // Log link addition with full details
        logActivity(boardId, columnId, projectId, 'link_added', '🔗 Link added', null, {title: title, url: url});
        
        saveData();
        renderProjectModal();
        refreshDashboardIfActive();
        showToast('Link added');
        updateStorageStatus('Saved', true);
        return link;
      }
    }
  }
}

function updateLink(boardId, columnId, projectId, linkId, url, title) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    const column = board.columns.find(c => c.id === columnId);
    if (column) {
      const project = column.projects.find(p => p.id === projectId);
      if (project) {
        const link = project.links.find(l => l.id === linkId);
        if (link) {
          const oldTitle = link.title;
          const oldUrl = link.url;
          const newTitle = title;
          const newUrl = url;
          
          link.url = url;
          link.title = title;
          link.timestamp = new Date();
          
          const titleChanged = oldTitle !== newTitle;
          const urlChanged = oldUrl !== newUrl;
          
          // Log link update with proper categorization
          if (titleChanged && urlChanged) {
            logActivity(boardId, columnId, projectId, 'link_updated', 
              '✏️ Link updated',
              {title: oldTitle, url: oldUrl}, {title: newTitle, url: newUrl});
          } else if (titleChanged) {
            logActivity(boardId, columnId, projectId, 'link_title_updated', 
              '✏️ Link title updated',
              {oldTitle: oldTitle, url: url}, {newTitle: newTitle, url: url});
          } else if (urlChanged) {
            logActivity(boardId, columnId, projectId, 'link_url_updated', 
              '✏️ Link URL updated',
              {title: title, oldUrl: oldUrl}, {title: title, newUrl: newUrl});
          }
          
          saveData();
          renderProjectModal();
          refreshDashboardIfActive();
          showToast('Link updated');
          updateStorageStatus('Saved', true);
        }
      }
    }
  }
}

function deleteLink(boardId, columnId, projectId, linkId) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    const column = board.columns.find(c => c.id === columnId);
    if (column) {
      const project = column.projects.find(p => p.id === projectId);
      if (project) {
        const linkIndex = project.links.findIndex(l => l.id === linkId);
        if (linkIndex !== -1) {
          const link = project.links[linkIndex];
          const linkTitle = link.title;
          const linkUrl = link.url;
          
          // Log link deletion with full details before removing
          logActivity(boardId, columnId, projectId, 'link_deleted', '🗑️ Link deleted', {title: linkTitle, url: linkUrl}, null);
          
          project.links.splice(linkIndex, 1);
          saveData();
          renderProjectModal();
          refreshDashboardIfActive();
          showToast('Link deleted');
          updateStorageStatus('Saved', true);
        }
      }
    }
  }
}

// Comment Management
function addComment(boardId, columnId, projectId, text) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    const column = board.columns.find(c => c.id === columnId);
    if (column) {
      const project = column.projects.find(p => p.id === projectId);
      if (project) {
        const comment = {
          id: generateId('comment'),
          text: text,
          timestamp: new Date()
        };
        project.comments.push(comment);
        
        // Log comment addition with content
        logActivity(boardId, columnId, projectId, 'comment_added', '💬 Comment added', null, text);
        
        saveData();
        renderProjectModal();
        refreshDashboardIfActive();
        showToast('Comment added');
        updateStorageStatus('Saved', true);
        return comment;
      }
    }
  }
}

function updateComment(boardId, columnId, projectId, commentId, text) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    const column = board.columns.find(c => c.id === columnId);
    if (column) {
      const project = column.projects.find(p => p.id === projectId);
      if (project) {
        const comment = project.comments.find(c => c.id === commentId);
        if (comment) {
          const oldText = comment.text;
          const newText = text;
          
          comment.text = text;
          comment.timestamp = new Date();
          
          // Log comment update with old and new values
          logActivity(boardId, columnId, projectId, 'comment_updated', 
            '✏️ Comment edited',
            oldText, newText);
          
          saveData();
          renderProjectModal();
          refreshDashboardIfActive();
          showToast('Comment updated');
          updateStorageStatus('Saved', true);
        }
      }
    }
  }
}

function deleteComment(boardId, columnId, projectId, commentId) {
  const board = state.boards.find(b => b.id === boardId);
  if (board) {
    const column = board.columns.find(c => c.id === columnId);
    if (column) {
      const project = column.projects.find(p => p.id === projectId);
      if (project) {
        const commentIndex = project.comments.findIndex(c => c.id === commentId);
        if (commentIndex !== -1) {
          const comment = project.comments[commentIndex];
          const commentText = comment.text;
          
          // Log comment deletion with content before removing
          logActivity(boardId, columnId, projectId, 'comment_deleted', '🗑️ Comment deleted', commentText, null);
          
          project.comments.splice(commentIndex, 1);
          saveData();
          renderProjectModal();
          refreshDashboardIfActive();
          showToast('Comment deleted');
          updateStorageStatus('Saved', true);
        }
      }
    }
  }
}

// Search Functionality
function searchProjects(query) {
  const board = getCurrentBoard();
  if (!board) return;

  const lowerQuery = query.toLowerCase();
  const columns = document.querySelectorAll('.column');

  columns.forEach((columnEl, colIndex) => {
    const column = board.columns[colIndex];
    const projectCards = columnEl.querySelectorAll('.project-card');

    projectCards.forEach((card, projIndex) => {
      const project = column.projects[projIndex];
      const matches = 
        project.projectId.toLowerCase().includes(lowerQuery) ||
        project.projectName.toLowerCase().includes(lowerQuery) ||
        project.description.toLowerCase().includes(lowerQuery);

      card.style.display = matches || query === '' ? 'block' : 'none';
    });
  });
}

// Render Functions
function updateBoardSelector() {
  const selector = document.getElementById('boardSelector');
  selector.innerHTML = '<option value="">Select Board</option>';
  
  state.boards.forEach(board => {
    const option = document.createElement('option');
    option.value = board.id;
    option.textContent = board.name;
    option.selected = board.id === state.currentBoardId;
    selector.appendChild(option);
  });
  
  updateBoardHint();
}

function renderBoard() {
  const board = getCurrentBoard();
  const emptyState = document.getElementById('emptyState');
  const boardContainer = document.getElementById('boardContainer');
  const listContainer = document.getElementById('listViewContainer');
  const boardTitle = document.getElementById('boardTitle');

  // Safety checks
  if (!emptyState || !boardContainer || !listContainer || !boardTitle) {
    console.error('renderBoard: Required DOM elements not found');
    return;
  }

  if (!board) {
    emptyState.classList.remove('hidden');
    boardContainer.classList.add('hidden');
    listContainer.style.display = 'none';
    boardTitle.textContent = 'Kanban Board';
    console.log('No board selected - showing empty state');
    return;
  }

  emptyState.classList.add('hidden');
  
  // Show appropriate view
  if (currentView === 'board') {
    boardContainer.classList.remove('hidden');
    listContainer.style.display = 'none';
  } else if (currentView === 'list') {
    boardContainer.classList.add('hidden');
    listContainer.style.display = 'block';
    renderListView();
  } else if (currentView === 'dashboard') {
    boardContainer.classList.add('hidden');
    listContainer.style.display = 'none';
    // Dashboard will be shown by toggleView
  }
  
  boardTitle.textContent = board.name;

  document.getElementById('currentBoardName').textContent = board.name;
  document.getElementById('currentBoardDesc').textContent = board.description || 'No description';

  const columnsContainer = document.getElementById('columnsContainer');
  if (!columnsContainer) {
    console.error('renderBoard: columnsContainer not found');
    return;
  }
  columnsContainer.innerHTML = '';

  // Check if board has columns
  if (!board.columns || board.columns.length === 0) {
    columnsContainer.innerHTML = `
      <div class="empty-state">
        <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
        <h3>No columns yet</h3>
        <p>Add your first column to get started</p>
        <button onclick="document.getElementById('addColumnBtn').click()" class="btn btn--primary">
          + Add Column
        </button>
      </div>
    `;
    console.log('Board has no columns - showing empty state');
    return;
  }

  board.columns.forEach((column, columnIndex) => {
    const columnEl = document.createElement('div');
    columnEl.className = 'column';
    columnEl.draggable = true;
    columnEl.dataset.columnId = column.id;
    columnEl.dataset.columnIndex = columnIndex;

    columnEl.innerHTML = `
      <div class="column-header">
        <div class="column-title-container">
          <span class="column-title" contenteditable="false" data-column-id="${column.id}">${column.title}</span>
          <span class="column-count">${column.projects.length}</span>
        </div>
        <div class="column-actions">
          <button class="btn-icon" onclick="confirmDeleteColumn('${column.id}')" title="Delete Column">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="column-body" data-column-id="${column.id}"></div>
      <div class="column-footer">
        <button class="btn btn--secondary btn--sm" onclick="createProject('${state.currentBoardId}', '${column.id}')" style="width: 100%;">+ Add Project</button>
      </div>
    `;

    const columnBody = columnEl.querySelector('.column-body');

    column.projects.forEach(project => {
      const projectCard = document.createElement('div');
      projectCard.className = 'project-card';
      projectCard.draggable = true;
      projectCard.dataset.projectId = project.id;
      projectCard.dataset.columnId = column.id;

      projectCard.innerHTML = `
        <div class="project-card-id">${project.projectId}</div>
        <div class="project-card-name">${project.projectName}</div>
        ${project.description ? `<div class="project-card-desc">${project.description}</div>` : ''}
        <div class="project-card-meta">
          ${project.links.length > 0 ? `<span>🔗 ${project.links.length}</span>` : ''}
          ${project.comments.length > 0 ? `<span>💬 ${project.comments.length}</span>` : ''}
        </div>
      `;

      projectCard.addEventListener('click', () => {
        openProjectModal(state.currentBoardId, column.id, project.id);
      });

      // Project drag events
      projectCard.addEventListener('dragstart', handleProjectDragStart);
      projectCard.addEventListener('dragend', handleProjectDragEnd);

      columnBody.appendChild(projectCard);
    });

    // Column body drop events
    columnBody.addEventListener('dragover', handleColumnDragOver);
    columnBody.addEventListener('drop', handleColumnDrop);
    columnBody.addEventListener('dragleave', handleColumnDragLeave);

    // Column drag events
    columnEl.addEventListener('dragstart', handleColumnDragStart);
    columnEl.addEventListener('dragend', handleColumnDragEnd);
    columnEl.addEventListener('dragover', handleColumnReorder);
    columnEl.addEventListener('drop', handleColumnReorderDrop);

    columnsContainer.appendChild(columnEl);
  });

  console.log(`Rendered board: ${board.name} with ${board.columns.length} columns`);

  // Add click handlers for column titles
  document.querySelectorAll('.column-title').forEach(titleEl => {
    titleEl.addEventListener('click', function() {
      this.contentEditable = 'true';
      this.classList.add('editing');
      this.focus();
      document.execCommand('selectAll', false, null);
    });

    titleEl.addEventListener('blur', function() {
      this.contentEditable = 'false';
      this.classList.remove('editing');
      const columnId = this.dataset.columnId;
      const newTitle = this.textContent.trim();
      if (newTitle) {
        updateColumn(state.currentBoardId, columnId, { title: newTitle });
      }
    });

    titleEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.blur();
      }
    });
  });
}

function openProjectModal(boardId, columnId, projectId) {
  const board = state.boards.find(b => b.id === boardId);
  if (!board) return;
  
  const column = board.columns.find(c => c.id === columnId);
  if (!column) return;
  
  const project = column.projects.find(p => p.id === projectId);
  if (!project) return;

  currentContext = { boardId, columnId, projectId };

  document.getElementById('modalProjectId').value = project.projectId;
  document.getElementById('modalProjectName').value = project.projectName;
  document.getElementById('modalProjectDesc').value = project.description;

  // Populate column selector
  const columnSelect = document.getElementById('modalProjectColumn');
  columnSelect.innerHTML = board.columns.map(col => 
    `<option value="${col.id}" ${col.id === columnId ? 'selected' : ''}>${escapeHtml(col.title)}</option>`
  ).join('');

  renderProjectModal();
  openModal('projectModal');
}

function closeProjectModal() {
  // Save changes before closing
  const projectId = document.getElementById('modalProjectId').value.trim().toUpperCase();
  const projectName = document.getElementById('modalProjectName').value.trim();
  const description = document.getElementById('modalProjectDesc').value.trim();
  const newColumnId = document.getElementById('modalProjectColumn').value;

  if (currentContext.projectId && projectName) {
    // Check if column changed
    if (newColumnId !== currentContext.columnId) {
      // Move project to new column
      const board = state.boards.find(b => b.id === currentContext.boardId);
      if (board) {
        const oldColumn = board.columns.find(c => c.id === currentContext.columnId);
        const newColumn = board.columns.find(c => c.id === newColumnId);
        
        if (oldColumn && newColumn) {
          // First update the project details
          updateProject(currentContext.boardId, currentContext.columnId, currentContext.projectId, {
            projectId,
            projectName,
            description
          });
          
          // Then move to new column
          moveProject(currentContext.boardId, currentContext.columnId, newColumnId, currentContext.projectId, newColumn.projects.length);
          
          // Log the column change with old/new values
          logActivity(currentContext.boardId, newColumnId, currentContext.projectId, 'moved', 
            `Column changed from '${oldColumn.title}' to '${newColumn.title}'`,
            oldColumn.title, newColumn.title);
          
          showToast(`Project moved to ${newColumn.title}`);
        }
      }
    } else {
      // Just update project details, no column change
      updateProject(currentContext.boardId, currentContext.columnId, currentContext.projectId, {
        projectId,
        projectName,
        description
      });
    }
  }

  closeModal('projectModal');
  currentContext = { boardId: null, columnId: null, projectId: null };
}

function renderProjectModal() {
  const { boardId, columnId, projectId } = currentContext;
  if (!projectId) return;

  const board = state.boards.find(b => b.id === boardId);
  if (!board) return;
  
  const column = board.columns.find(c => c.id === columnId);
  if (!column) return;
  
  const project = column.projects.find(p => p.id === projectId);
  if (!project) return;

  // Render links
  const linksContainer = document.getElementById('linksContainer');
  if (project.links.length === 0) {
    linksContainer.innerHTML = '<p class="empty-message">No links added yet</p>';
  } else {
    linksContainer.innerHTML = project.links.map(link => `
      <div class="link-item">
        <div class="link-content">
          <div class="link-title">${link.title}</div>
          <a href="${link.url}" class="link-url" target="_blank">${link.url}</a>
          <div class="link-timestamp">Added on ${formatTimestamp(new Date(link.timestamp))}</div>
        </div>
        <div class="link-actions">
          <button class="btn-icon" onclick="editLink('${link.id}')" title="Edit Link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-icon" onclick="confirmDeleteLink('${link.id}')" title="Delete Link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  // Render comments
  const commentsContainer = document.getElementById('commentsContainer');
  if (project.comments.length === 0) {
    commentsContainer.innerHTML = '<p class="empty-message">No comments yet</p>';
  } else {
    commentsContainer.innerHTML = project.comments.map(comment => `
      <div class="comment-item" data-comment-id="${comment.id}">
        <div class="comment-header">
          <div class="comment-timestamp">${formatTimestamp(new Date(comment.timestamp))}</div>
          <div class="comment-actions">
            <button class="btn-icon" onclick="editComment('${comment.id}')" title="Edit Comment">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-icon" onclick="confirmDeleteComment('${comment.id}')" title="Delete Comment">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
          <div class="comment-edit-actions">
            <button class="btn btn--sm btn--primary" onclick="saveCommentEdit('${comment.id}')">Save</button>
            <button class="btn btn--sm btn--secondary" onclick="cancelCommentEdit('${comment.id}')">Cancel</button>
          </div>
        </div>
        <div class="comment-text">${comment.text}</div>
        <textarea class="comment-edit-input form-control" rows="3">${comment.text}</textarea>
      </div>
    `).join('');
  }

  // Render activity log
  const activityLog = project.activityLog || [];
  const activityCount = document.getElementById('activityCount');
  const activityLogContainer = document.getElementById('activityLogContainer');
  
  console.log('Rendering activity log:', activityLog.length, 'activities');
  
  if (!activityLogContainer) {
    console.error('❌ Activity log container not found!');
    return;
  }
  
  activityCount.textContent = activityLog.length;
  
  if (activityLog.length === 0) {
    activityLogContainer.innerHTML = '<p class="empty-message">No activities yet</p>';
  } else {
    activityLogContainer.innerHTML = activityLog.map(activity => {
      let changeHtml = '';
      
      // Handle different activity types with proper formatting
      if (activity.action === 'comment_added') {
        const content = truncateText(activity.newValue, 100);
        changeHtml = `<div class="activity-change">Content: "${content}"</div>`;
      }
      else if (activity.action === 'comment_updated') {
        const oldContent = truncateText(activity.oldValue, 100);
        const newContent = truncateText(activity.newValue, 100);
        changeHtml = `
          <div class="activity-change">From: "${oldContent}"</div>
          <div class="activity-change">To: "${newContent}"</div>
        `;
      }
      else if (activity.action === 'comment_deleted') {
        const content = truncateText(activity.oldValue, 100);
        changeHtml = `<div class="activity-change">Content: "${content}"</div>`;
      }
      else if (activity.action === 'link_added') {
        changeHtml = `
          <div class="activity-change">Title: "${activity.newValue.title}"</div>
          <div class="activity-change">URL: ${activity.newValue.url}</div>
        `;
      }
      else if (activity.action === 'link_updated') {
        changeHtml = `
          <div class="activity-change">Title changed:</div>
          <div class="activity-change-indent">From: "${activity.oldValue.title}"</div>
          <div class="activity-change-indent">To: "${activity.newValue.title}"</div>
          <div class="activity-change">URL changed:</div>
          <div class="activity-change-indent">From: ${activity.oldValue.url}</div>
          <div class="activity-change-indent">To: ${activity.newValue.url}</div>
        `;
      }
      else if (activity.action === 'link_title_updated') {
        changeHtml = `
          <div class="activity-change">From: "${activity.oldValue.oldTitle}"</div>
          <div class="activity-change">To: "${activity.newValue.newTitle}"</div>
          <div class="activity-change">URL: ${activity.oldValue.url}</div>
        `;
      }
      else if (activity.action === 'link_url_updated') {
        changeHtml = `
          <div class="activity-change">Title: "${activity.oldValue.title}"</div>
          <div class="activity-change">From: ${activity.oldValue.oldUrl}</div>
          <div class="activity-change">To: ${activity.newValue.newUrl}</div>
        `;
      }
      else if (activity.action === 'link_deleted') {
        changeHtml = `
          <div class="activity-change">Title: "${activity.oldValue.title}"</div>
          <div class="activity-change">URL: ${activity.oldValue.url}</div>
        `;
      }
      else if (activity.oldValue !== null && activity.newValue !== null) {
        // Handle other activities with old/new values (project fields)
        const displayOldValue = truncateText(activity.oldValue, 100);
        const displayNewValue = truncateText(activity.newValue, 100);
        changeHtml = `
          <div class="activity-change">From: ${displayOldValue}</div>
          <div class="activity-change">To: ${displayNewValue}</div>
        `;
      }
      
      return `
        <div class="activity-item">
          <div class="activity-content">
            <div class="activity-description">${activity.description}</div>
            ${changeHtml}
            <div class="activity-timestamp">${formatTimestamp(new Date(activity.timestamp))}</div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// Drag and Drop Handlers
function handleProjectDragStart(e) {
  dragState.type = 'project';
  dragState.sourceId = e.currentTarget.dataset.projectId;
  dragState.sourceColumnId = e.currentTarget.dataset.columnId;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleProjectDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.column-body').forEach(col => col.classList.remove('drag-over'));
  dragState = { type: null, sourceId: null, sourceColumnId: null, sourceIndex: null };
}

function handleColumnDragOver(e) {
  if (dragState.type !== 'project') return;
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function handleColumnDragLeave(e) {
  if (e.currentTarget.contains(e.relatedTarget)) return;
  e.currentTarget.classList.remove('drag-over');
}

function handleColumnDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  
  if (dragState.type !== 'project') return;

  const targetColumnId = e.currentTarget.dataset.columnId;
  const board = getCurrentBoard();
  const targetColumn = board.columns.find(c => c.id === targetColumnId);
  
  moveProject(
    state.currentBoardId,
    dragState.sourceColumnId,
    targetColumnId,
    dragState.sourceId,
    targetColumn.projects.length
  );
}

function handleColumnDragStart(e) {
  // Only drag column if not dragging project
  if (e.target.classList.contains('project-card')) {
    e.stopPropagation();
    return;
  }
  
  dragState.type = 'column';
  dragState.sourceId = e.currentTarget.dataset.columnId;
  dragState.sourceIndex = parseInt(e.currentTarget.dataset.columnIndex);
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleColumnDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  dragState = { type: null, sourceId: null, sourceColumnId: null, sourceIndex: null };
}

function handleColumnReorder(e) {
  if (dragState.type !== 'column') return;
  e.preventDefault();
}

function handleColumnReorderDrop(e) {
  if (dragState.type !== 'column') return;
  e.preventDefault();
  e.stopPropagation();

  const targetIndex = parseInt(e.currentTarget.dataset.columnIndex);
  
  if (dragState.sourceIndex !== targetIndex) {
    reorderColumns(state.currentBoardId, dragState.sourceIndex, targetIndex);
  }
}

// Confirmation Dialogs
function showConfirmDialog(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  
  const confirmBtn = document.getElementById('confirmAction');
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  
  newConfirmBtn.addEventListener('click', () => {
    onConfirm();
    closeModal('confirmModal');
  });
  
  openModal('confirmModal');
}

function confirmDeleteColumn(columnId) {
  const board = getCurrentBoard();
  const column = board.columns.find(c => c.id === columnId);
  
  if (column.projects.length > 0) {
    showConfirmDialog(
      'Delete Column',
      `This column contains ${column.projects.length} project(s). Are you sure you want to delete it?`,
      () => deleteColumn(state.currentBoardId, columnId)
    );
  } else {
    deleteColumn(state.currentBoardId, columnId);
  }
}

function confirmDeleteLink(linkId) {
  showConfirmDialog(
    'Delete Link',
    'Are you sure you want to delete this link?',
    () => deleteLink(currentContext.boardId, currentContext.columnId, currentContext.projectId, linkId)
  );
}

function confirmDeleteComment(commentId) {
  showConfirmDialog(
    'Delete Comment',
    'Are you sure you want to delete this comment?',
    () => deleteComment(currentContext.boardId, currentContext.columnId, currentContext.projectId, commentId)
  );
}

function editLink(linkId) {
  const { boardId, columnId, projectId } = currentContext;
  const board = state.boards.find(b => b.id === boardId);
  const column = board.columns.find(c => c.id === columnId);
  const project = column.projects.find(p => p.id === projectId);
  const link = project.links.find(l => l.id === linkId);

  if (link) {
    document.getElementById('linkTitle').value = link.title;
    document.getElementById('linkUrl').value = link.url;
    document.getElementById('linkModalTitle').textContent = 'Edit Link';
    currentContext.linkId = linkId;
    openModal('addLinkModal');
  }
}

function editComment(commentId) {
  const commentItem = document.querySelector(`[data-comment-id="${commentId}"]`);
  if (commentItem) {
    commentItem.classList.add('editing');
  }
}

function saveCommentEdit(commentId) {
  const commentItem = document.querySelector(`[data-comment-id="${commentId}"]`);
  const textarea = commentItem.querySelector('.comment-edit-input');
  const newText = textarea.value.trim();
  
  if (newText) {
    updateComment(currentContext.boardId, currentContext.columnId, currentContext.projectId, commentId, newText);
  }
}

function cancelCommentEdit(commentId) {
  const commentItem = document.querySelector(`[data-comment-id="${commentId}"]`);
  if (commentItem) {
    commentItem.classList.remove('editing');
    // Reset textarea to original value
    const { boardId, columnId, projectId } = currentContext;
    const board = state.boards.find(b => b.id === boardId);
    const column = board.columns.find(c => c.id === columnId);
    const project = column.projects.find(p => p.id === projectId);
    const comment = project.comments.find(c => c.id === commentId);
    if (comment) {
      commentItem.querySelector('.comment-edit-input').value = comment.text;
    }
  }
}

// Activity Log Toggle
function toggleActivityLog() {
  const container = document.getElementById('activityLogContainer');
  const header = document.querySelector('.section-header--collapsible');
  
  container.classList.toggle('collapsed');
  header.classList.toggle('collapsed');
}

// List View Functions
function toggleView(view) {
  if (!['board', 'list', 'dashboard'].includes(view)) {
    console.error('Invalid view:', view);
    return;
  }
  
  currentView = view;
  
  const boardView = document.getElementById('boardContainer');
  const listView = document.getElementById('listViewContainer');
  const dashboardView = document.getElementById('dashboard-view-container');
  const boardBtn = document.getElementById('board-view-btn');
  const listBtn = document.getElementById('list-view-btn');
  const dashBtn = document.getElementById('dashboard-view-btn');
  
  // Safety checks
  if (!boardView || !listView || !dashboardView) {
    console.error('View containers not found');
    return;
  }
  
  // Hide all views
  boardView.style.display = 'none';
  listView.style.display = 'none';
  dashboardView.style.display = 'none';
  
  // Remove active from all buttons
  if (boardBtn) boardBtn.classList.remove('active');
  if (listBtn) listBtn.classList.remove('active');
  if (dashBtn) dashBtn.classList.remove('active');
  
  // Get current board
  const board = state.boards.find(b => b.id === state.currentBoardId);
  
  // Show selected view
  if (view === 'board') {
    boardView.style.display = 'block';
    if (boardBtn) boardBtn.classList.add('active');
    if (board) {
      renderBoard();
    } else {
      const emptyState = document.getElementById('emptyState');
      if (emptyState) emptyState.classList.remove('hidden');
      boardView.classList.add('hidden');
    }
  } else if (view === 'list') {
    listView.style.display = 'block';
    if (listBtn) listBtn.classList.add('active');
    if (board) {
      renderListView();
    }
  } else if (view === 'dashboard') {
    dashboardView.style.display = 'block';
    if (dashBtn) dashBtn.classList.add('active');
    if (board) {
      renderDashboard();
    }
  }
  
  console.log(`Switched to ${view} view`);
}

function renderListView() {
  const board = state.boards.find(b => b.id === state.currentBoardId);
  if (!board) return;
  
  // Get all projects from all columns
  const projects = [];
  board.columns.forEach(column => {
    column.projects.forEach(project => {
      projects.push({
        ...project,
        columnId: column.id,
        columnTitle: column.title
      });
    });
  });
  
  // Apply sorting
  projects.sort((a, b) => {
    let aVal = a[listSortColumn] || '';
    let bVal = b[listSortColumn] || '';
    
    if (listSortColumn === 'column') {
      aVal = a.columnTitle;
      bVal = b.columnTitle;
    }
    
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }
    
    if (listSortDirection === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });
  
  // Render table rows
  const tbody = document.getElementById('projects-table-body');
  tbody.innerHTML = projects.map(project => {
    const updatedAt = project.updatedAt || project.createdAt || Date.now();
    return `
      <tr onclick="openProjectFromList('${board.id}', '${project.columnId}', '${project.id}')">
        <td class="project-id-cell">${escapeHtml(project.projectId)}</td>
        <td class="project-name-cell" title="${escapeHtml(project.projectName)}">${escapeHtml(project.projectName)}</td>
        <td><span class="column-badge">${escapeHtml(project.columnTitle)}</span></td>
        <td class="description-cell" title="${escapeHtml(project.description || '')}">${escapeHtml(project.description || '-')}</td>
        <td><span class="count-badge">${project.links ? project.links.length : 0}</span></td>
        <td><span class="count-badge">${project.comments ? project.comments.length : 0}</span></td>
        <td>${formatTimestamp(updatedAt)}</td>
        <td class="list-actions">
          <button class="action-btn" onclick="event.stopPropagation(); editProjectFromList('${board.id}', '${project.columnId}', '${project.id}')" title="Edit">✏️</button>
          <button class="action-btn" onclick="event.stopPropagation(); deleteProjectFromList('${board.id}', '${project.columnId}', '${project.id}')" title="Delete">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
  
  // Update footer count
  document.getElementById('list-total-count').textContent = `Total: ${projects.length} projects`;
  
  // Update filter dropdown
  const filterSelect = document.getElementById('list-filter');
  filterSelect.innerHTML = '<option value="all">All Columns</option>' +
    board.columns.map(col => `<option value="${col.id}">${escapeHtml(col.title)}</option>`).join('');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Dashboard Customization Functions
function openDashboardCustomization() {
  // Populate widgets list
  renderWidgetsList();
  
  // Populate filters
  const board = state.boards.find(b => b.id === state.currentBoardId);
  if (board) {
    const columnFilter = document.getElementById('filter-column');
    columnFilter.innerHTML = '<option value="all">All Columns</option>' +
      board.columns.map(col => `<option value="${col.id}">${escapeHtml(col.title)}</option>`).join('');
    columnFilter.value = state.dashboardConfig.filters.column;
  }
  
  // Set filter values
  document.getElementById('filter-date-range').value = state.dashboardConfig.filters.dateRange;
  document.getElementById('filter-status').value = state.dashboardConfig.filters.status;
  
  // Set custom date range values if they exist
  if (state.dashboardConfig.filters.customDateFrom) {
    document.getElementById('custom-date-from').value = state.dashboardConfig.filters.customDateFrom;
  }
  if (state.dashboardConfig.filters.customDateTo) {
    document.getElementById('custom-date-to').value = state.dashboardConfig.filters.customDateTo;
  }
  
  // Show/hide custom date inputs based on selection
  toggleCustomDateInputs();
  
  // Populate custom metrics
  renderCustomMetricsList();
  
  // Set settings
  document.getElementById('auto-refresh').checked = state.dashboardConfig.settings.autoRefresh;
  document.getElementById('dashboard-theme').value = state.dashboardConfig.settings.theme;
  
  openModal('customizeDashboardModal');
}

function renderWidgetsList() {
  const container = document.getElementById('widgets-list');
  container.innerHTML = state.dashboardConfig.widgets.map(widget => `
    <div class="widget-item" data-widget-id="${widget.id}">
      <span class="widget-drag-handle" title="Drag to reorder">☰</span>
      <div class="widget-info">
        <div class="widget-name">${widget.name}</div>
        <div class="widget-description">${widget.description}</div>
      </div>
      <div class="widget-actions">
        <div class="widget-toggle ${widget.visible ? 'active' : ''}" 
             onclick="toggleWidgetVisibility('${widget.id}')"
             title="${widget.visible ? 'Hide' : 'Show'} widget">
        </div>
      </div>
    </div>
  `).join('');
}

function toggleWidgetVisibility(widgetId) {
  const widget = state.dashboardConfig.widgets.find(w => w.id === widgetId);
  if (widget) {
    widget.visible = !widget.visible;
    renderWidgetsList();
  }
}

function applyDashboardFilters() {
  state.dashboardConfig.filters.dateRange = document.getElementById('filter-date-range').value;
  state.dashboardConfig.filters.column = document.getElementById('filter-column').value;
  state.dashboardConfig.filters.status = document.getElementById('filter-status').value;
  
  // Clear custom date range if not selected
  if (state.dashboardConfig.filters.dateRange !== 'custom') {
    state.dashboardConfig.filters.customDateFrom = null;
    state.dashboardConfig.filters.customDateTo = null;
  }
  
  saveData();
  renderDashboard();
  showToast('Filters applied');
}

function applyCustomDateRange() {
  const fromDate = document.getElementById('custom-date-from').value;
  const toDate = document.getElementById('custom-date-to').value;
  
  if (!fromDate || !toDate) {
    showToast('Please select both From and To dates');
    return;
  }
  
  if (new Date(fromDate) > new Date(toDate)) {
    showToast('From date must be before To date');
    return;
  }
  
  state.dashboardConfig.filters.dateRange = 'custom';
  state.dashboardConfig.filters.customDateFrom = fromDate;
  state.dashboardConfig.filters.customDateTo = toDate;
  
  saveData();
  renderDashboard();
  showToast(`Custom range applied: ${fromDate} to ${toDate}`);
}

function toggleCustomDateInputs() {
  const dateRange = document.getElementById('filter-date-range').value;
  const customInputs = document.getElementById('custom-date-range-inputs');
  
  if (customInputs) {
    customInputs.style.display = dateRange === 'custom' ? 'block' : 'none';
  }
}

function clearDashboardFilters() {
  state.dashboardConfig.filters = {
    dateRange: 'all',
    column: 'all',
    status: 'all',
    customDateFrom: null,
    customDateTo: null
  };
  
  document.getElementById('filter-date-range').value = 'all';
  document.getElementById('filter-column').value = 'all';
  document.getElementById('filter-status').value = 'all';
  document.getElementById('custom-date-from').value = '';
  document.getElementById('custom-date-to').value = '';
  
  toggleCustomDateInputs();
  saveData();
  renderDashboard();
  showToast('Filters cleared');
}

function renderCustomMetricsList() {
  const container = document.getElementById('custom-metrics-list');
  
  if (state.dashboardConfig.customMetrics.length === 0) {
    container.innerHTML = '<p class="empty-message">No custom metrics created yet</p>';
    return;
  }
  
  container.innerHTML = state.dashboardConfig.customMetrics.map(metric => {
    const value = calculateCustomMetric(metric);
    return `
      <div class="metric-item">
        <div class="metric-icon-display" style="background: ${metric.color}15; color: ${metric.color};">
          ${metric.icon}
        </div>
        <div class="metric-info">
          <div class="metric-name-display">${escapeHtml(metric.name)}</div>
          <div class="metric-type-display">${metric.type}</div>
        </div>
        <div class="metric-value-display">${value}</div>
        <div class="widget-actions">
          <button class="btn-icon" onclick="deleteCustomMetric('${metric.id}')" title="Delete Metric">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function showMetricBuilder() {
  document.getElementById('metric-builder').classList.remove('hidden');
  document.getElementById('metric-name').value = '';
  document.getElementById('metric-type').value = 'count';
  document.getElementById('metric-icon').value = '📊';
  document.getElementById('metric-color').value = '#6366f1';
  document.getElementById('metric-conditions').innerHTML = '';
  addMetricCondition();
}

function hideMetricBuilder() {
  document.getElementById('metric-builder').classList.add('hidden');
}

function addMetricCondition() {
  const container = document.getElementById('metric-conditions');
  const conditionId = 'cond-' + Date.now();
  
  const conditionHtml = `
    <div class="metric-condition" id="${conditionId}">
      <select class="form-control">
        <option value="column">Column</option>
        <option value="hasLinks">Has Links</option>
        <option value="hasComments">Has Comments</option>
        <option value="nameContains">Name Contains</option>
      </select>
      <select class="form-control">
        <option value="equals">Equals</option>
        <option value="contains">Contains</option>
        <option value="greaterThan">Greater Than</option>
      </select>
      <input type="text" class="form-control" placeholder="Value">
      <button class="btn-icon" onclick="removeMetricCondition('${conditionId}')" title="Remove">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `;
  
  container.insertAdjacentHTML('beforeend', conditionHtml);
}

function removeMetricCondition(conditionId) {
  document.getElementById(conditionId)?.remove();
}

function saveCustomMetric() {
  const name = document.getElementById('metric-name').value.trim();
  const type = document.getElementById('metric-type').value;
  const icon = document.getElementById('metric-icon').value.trim();
  const color = document.getElementById('metric-color').value;
  
  if (!name) {
    showToast('Please enter a metric name');
    return;
  }
  
  const metric = {
    id: generateId('metric'),
    name,
    type,
    icon: icon || '📊',
    color,
    conditions: []
  };
  
  state.dashboardConfig.customMetrics.push(metric);
  renderCustomMetricsList();
  hideMetricBuilder();
  showToast('Custom metric created');
}

function deleteCustomMetric(metricId) {
  const index = state.dashboardConfig.customMetrics.findIndex(m => m.id === metricId);
  if (index !== -1) {
    state.dashboardConfig.customMetrics.splice(index, 1);
    renderCustomMetricsList();
    showToast('Metric deleted');
  }
}

function calculateCustomMetric(metric) {
  const board = state.boards.find(b => b.id === state.currentBoardId);
  if (!board) return 0;
  
  let count = 0;
  board.columns.forEach(column => {
    count += column.projects.length;
  });
  
  if (metric.type === 'percentage') {
    return count > 0 ? '100%' : '0%';
  }
  
  return count;
}

function resetDashboardConfig() {
  if (!confirm('Reset dashboard to default configuration?')) return;
  
  state.dashboardConfig = {
    widgets: [
      { id: 'stats-cards', name: 'Statistics Cards', visible: true, order: 1, description: 'Total and per-column counts' },
      { id: 'column-chart', name: 'Projects by Column Chart', visible: true, order: 2, description: 'Bar chart distribution' },
      { id: 'engagement', name: 'Engagement Metrics', visible: true, order: 3, description: 'Links, comments, activities' },
      { id: 'recent-activity', name: 'Recent Activity Feed', visible: true, order: 4, description: 'Last 10 activities' },
      { id: 'top-projects', name: 'Most Active Projects', visible: true, order: 5, description: 'Top 5 by activity' },
      { id: 'completion-rate', name: 'Completion Rate', visible: true, order: 6, description: 'Progress bar' }
    ],
    filters: {
      dateRange: 'all',
      column: 'all',
      status: 'all'
    },
    customMetrics: [],
    settings: {
      autoRefresh: false,
      theme: 'default'
    }
  };
  
  saveData();
  openDashboardCustomization();
  showToast('Dashboard reset to default');
}

function exportDashboardConfig() {
  const config = JSON.stringify(state.dashboardConfig, null, 2);
  const blob = new Blob([config], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dashboard-config-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Dashboard config exported');
}

function importDashboardConfig() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const config = JSON.parse(event.target.result);
        state.dashboardConfig = config;
        saveData();
        openDashboardCustomization();
        showToast('Dashboard config imported');
      } catch (error) {
        showToast('Error importing config');
      }
    };
    reader.readAsText(file);
  };
  
  input.click();
}

function saveDashboardConfig() {
  // Apply settings
  state.dashboardConfig.settings.autoRefresh = document.getElementById('auto-refresh').checked;
  state.dashboardConfig.settings.theme = document.getElementById('dashboard-theme').value;
  
  saveData();
  renderDashboard();
  closeModal('customizeDashboardModal');
  showToast('✅ Dashboard configuration saved!');
}

function applyDashboardFiltersToData(projects) {
  const filters = state.dashboardConfig.filters;
  let filtered = [...projects];
  
  // Date range filter
  if (filters.dateRange !== 'all') {
    const now = Date.now();
    
    // Handle custom date range
    if (filters.dateRange === 'custom' && filters.customDateFrom && filters.customDateTo) {
      const fromDate = new Date(filters.customDateFrom).setHours(0, 0, 0, 0);
      const toDate = new Date(filters.customDateTo).setHours(23, 59, 59, 999);
      
      filtered = filtered.filter(p => {
        const updated = p.updatedAt || p.createdAt || 0;
        return updated >= fromDate && updated <= toDate;
      });
    } else {
      // Handle predefined ranges
      const ranges = {
        'today': 24 * 60 * 60 * 1000,
        '7days': 7 * 24 * 60 * 60 * 1000,
        '30days': 30 * 24 * 60 * 60 * 1000,
        'thismonth': 30 * 24 * 60 * 60 * 1000,
        'lastmonth': 60 * 24 * 60 * 60 * 1000
      };
      
      const range = ranges[filters.dateRange];
      if (range) {
        filtered = filtered.filter(p => {
          const updated = p.updatedAt || p.createdAt || 0;
          return (now - updated) <= range;
        });
      }
    }
  }
  
  // Column filter
  if (filters.column !== 'all') {
    filtered = filtered.filter(p => p.columnId === filters.column);
  }
  
  // Status filter
  if (filters.status !== 'all') {
    switch (filters.status) {
      case 'has-links':
        filtered = filtered.filter(p => p.links && p.links.length > 0);
        break;
      case 'has-comments':
        filtered = filtered.filter(p => p.comments && p.comments.length > 0);
        break;
      case 'active-7days':
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(p => {
          const updated = p.updatedAt || p.createdAt || 0;
          return updated >= sevenDaysAgo;
        });
        break;
      case 'inactive-30days':
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(p => {
          const updated = p.updatedAt || p.createdAt || 0;
          return updated < thirtyDaysAgo;
        });
        break;
    }
  }
  
  return filtered;
}

// Dashboard Functions
function renderDashboard() {
  const board = state.boards.find(b => b.id === state.currentBoardId);
  if (!board) {
    const container = document.getElementById('dashboard-view-container');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No board selected</h3>
          <p>Select a board to view dashboard</p>
        </div>
      `;
    }
    return;
  }
  
  // Calculate statistics with filters applied
  const stats = calculateBoardStats(board, true);
  
  // Check widget visibility
  const widgetVisible = (widgetId) => {
    const widget = state.dashboardConfig.widgets.find(w => w.id === widgetId);
    return widget ? widget.visible : true;
  };
  
  // Update total
  const totalElement = document.getElementById('stat-total');
  if (totalElement) {
    totalElement.textContent = stats.total;
  }
  
  // Show/hide stats cards based on widget visibility
  const statsGrid = document.querySelector('.stats-grid');
  if (!statsGrid) {
    console.error('stats-grid not found');
    return;
  }
  
  statsGrid.style.display = widgetVisible('stats-cards') ? 'grid' : 'none';
  
  // Keep first card (total), regenerate others
  const totalCard = statsGrid.children[0];
  statsGrid.innerHTML = '';
  if (totalCard) {
    statsGrid.appendChild(totalCard);
  }
  
  // Add stat cards for each column (up to 3)
  const colors = ['stat-todo', 'stat-progress', 'stat-done'];
  const icons = ['📝', '🚀', '✅'];
  
  board.columns.slice(0, 3).forEach((column, index) => {
    const count = stats.byColumn[column.title] || 0;
    const statCard = document.createElement('div');
    statCard.className = `stat-card ${colors[index]} clickable`;
    statCard.onclick = () => drillDown('column', index);
    statCard.innerHTML = `
      <div class="stat-icon">${icons[index]}</div>
      <div class="stat-value">${count}</div>
      <div class="stat-label">${escapeHtml(column.title)}</div>
      <div class="stat-hint">Click to view</div>
    `;
    statsGrid.appendChild(statCard);
  });
  
  // If less than 3 columns, add empty placeholders
  for (let i = board.columns.length; i < 3; i++) {
    const statCard = document.createElement('div');
    statCard.className = `stat-card ${colors[i]}`;
    statCard.innerHTML = `
      <div class="stat-icon">${icons[i]}</div>
      <div class="stat-value">0</div>
      <div class="stat-label">No Column</div>
    `;
    statsGrid.appendChild(statCard);
  }
  
  // Show/hide engagement widget
  const engagementCard = document.querySelector('.chart-card:has(#total-links)');
  if (engagementCard) {
    engagementCard.style.display = widgetVisible('engagement') ? 'block' : 'none';
  }
  
  // Update engagement stats
  document.getElementById('total-links').textContent = stats.totalLinks;
  document.getElementById('total-comments').textContent = stats.totalComments;
  document.getElementById('total-activities').textContent = stats.totalActivities;
  
  // Show/hide completion rate widget
  const completionSection = document.querySelector('.completion-section');
  if (completionSection) {
    completionSection.style.display = widgetVisible('completion-rate') ? 'block' : 'none';
  }
  
  // Update completion rate
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  document.getElementById('completion-percentage').textContent = `${completionRate}%`;
  document.getElementById('completion-bar').style.width = `${completionRate}%`;
  
  // Show/hide chart widget
  const chartCard = document.querySelector('.chart-card:has(#projects-chart)');
  if (chartCard) {
    chartCard.style.display = widgetVisible('column-chart') ? 'block' : 'none';
  }
  
  // Render chart
  if (widgetVisible('column-chart')) {
    renderProjectsChart(stats.byColumn);
  }
  
  // Show/hide recent activity widget
  const activityCard = document.querySelector('.insight-card:has(#recent-activity-list)');
  if (activityCard) {
    activityCard.style.display = widgetVisible('recent-activity') ? 'block' : 'none';
  }
  
  // Render recent activity
  if (widgetVisible('recent-activity')) {
    renderRecentActivity(stats.recentActivities);
  }
  
  // Show/hide top projects widget
  const topProjectsCard = document.querySelector('.insight-card:has(#top-projects-list)');
  if (topProjectsCard) {
    topProjectsCard.style.display = widgetVisible('top-projects') ? 'block' : 'none';
  }
  
  // Render top projects
  if (widgetVisible('top-projects')) {
    renderTopProjects(stats.topProjects);
  }
  
  // Render custom widgets
  renderCustomWidgets(stats);
}

function renderCustomWidgets(stats) {
  // Find or create custom widgets container
  let container = document.getElementById('custom-widgets-container');
  
  if (!container) {
    // Create container after stats grid
    const statsGrid = document.querySelector('.stats-grid');
    if (statsGrid) {
      container = document.createElement('div');
      container.id = 'custom-widgets-container';
      container.className = 'custom-widgets-grid';
      statsGrid.insertAdjacentElement('afterend', container);
    } else {
      return;
    }
  }
  
  // Clear existing widgets
  container.innerHTML = '';
  
  // Render each custom widget
  if (state.customWidgets && state.customWidgets.length > 0) {
    container.style.display = 'grid';
    
    state.customWidgets.forEach(widget => {
      const widgetEl = document.createElement('div');
      widgetEl.className = `custom-widget-card widget-size-${widget.size}`;
      widgetEl.style.borderLeft = `4px solid ${widget.color}`;
      widgetEl.style.background = `${widget.color}15`;
      
      // Calculate widget value based on data source
      let value = '0';
      if (widget.dataSource === 'built-in') {
        const metric = document.getElementById('built-in-metric')?.value || 'total';
        switch(metric) {
          case 'total':
            value = stats.total;
            break;
          case 'links':
            value = stats.totalLinks;
            break;
          case 'comments':
            value = stats.totalComments;
            break;
          case 'activities':
            value = stats.totalActivities;
            break;
          case 'completion':
            value = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) + '%' : '0%';
            break;
        }
      } else if (widget.dataSource === 'custom' && widget.metricId) {
        const metric = state.dashboardConfig.customMetrics.find(m => m.id === widget.metricId);
        if (metric) {
          value = calculateCustomMetric(metric);
        }
      }
      
      widgetEl.innerHTML = `
        <div class="custom-widget-header">
          <div class="custom-widget-actions">
            <button class="btn-icon" onclick="deleteCustomWidget('${widget.id}')" title="Delete Widget">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="stat-icon">${widget.icon}</div>
        <div class="stat-value">${value}</div>
        <div class="stat-label">${widget.name}</div>
        ${widget.drilldown ? '<div class="stat-hint">Click to drill-down</div>' : ''}
      `;
      
      // Add click handler if drilldown enabled
      if (widget.drilldown) {
        widgetEl.style.cursor = 'pointer';
        widgetEl.onclick = () => {
          // Drill down based on widget type
          drillDown('total');
        };
      }
      
      container.appendChild(widgetEl);
    });
  } else {
    container.style.display = 'none';
  }
}

function deleteCustomWidget(widgetId) {
  showConfirmDialog(
    'Delete Custom Widget',
    'Are you sure you want to delete this custom widget?',
    () => {
      const index = state.customWidgets.findIndex(w => w.id === widgetId);
      if (index !== -1) {
        const widgetName = state.customWidgets[index].name;
        state.customWidgets.splice(index, 1);
        saveData();
        renderDashboard();
        showToast(`Widget "${widgetName}" deleted`);
      }
    }
  );
}

function calculateBoardStats(board, applyFilters = false) {
  const stats = {
    total: 0,
    byColumn: {},
    completed: 0,
    totalLinks: 0,
    totalComments: 0,
    totalActivities: 0,
    recentActivities: [],
    topProjects: []
  };
  
  let allProjects = [];
  let doneColumnId = null;
  
  // Find "Done" or "Completed" column (case-insensitive)
  board.columns.forEach(column => {
    const titleLower = column.title.toLowerCase();
    if (titleLower.includes('done') || titleLower.includes('completed') || titleLower.includes('finish')) {
      doneColumnId = column.id;
    }
  });
  
  board.columns.forEach(column => {
    column.projects.forEach(project => {
      allProjects.push({
        ...project,
        columnTitle: column.title,
        columnId: column.id,
        activityCount: project.activityLog ? project.activityLog.length : 0
      });
    });
  });
  
  // Apply filters if requested
  if (applyFilters) {
    allProjects = applyDashboardFiltersToData(allProjects);
  }
  
  // Recalculate stats based on filtered projects
  board.columns.forEach(column => {
    const columnProjects = allProjects.filter(p => p.columnId === column.id);
    const projectCount = columnProjects.length;
    stats.byColumn[column.title] = projectCount;
    stats.total += projectCount;
    
    // Count completed projects
    if (column.id === doneColumnId) {
      stats.completed += projectCount;
    }
    
    columnProjects.forEach(project => {
      stats.totalLinks += project.links ? project.links.length : 0;
      stats.totalComments += project.comments ? project.comments.length : 0;
      stats.totalActivities += project.activityLog ? project.activityLog.length : 0;
      
      // Collect recent activities
      if (project.activityLog) {
        project.activityLog.forEach(activity => {
          stats.recentActivities.push({
            ...activity,
            projectName: project.projectName,
            projectId: project.projectId
          });
        });
      }
    });
  });
  
  // Sort and limit recent activities
  stats.recentActivities.sort((a, b) => b.timestamp - a.timestamp);
  stats.recentActivities = stats.recentActivities.slice(0, 10);
  
  // Get top projects by activity
  stats.topProjects = allProjects
    .sort((a, b) => b.activityCount - a.activityCount)
    .slice(0, 5);
  
  return stats;
}

function renderProjectsChart(byColumn) {
  const canvas = document.getElementById('projects-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // Simple bar chart representation
  const colors = ['#ef4444', '#f59e0b', '#10b981', '#6366f1', '#8b5cf6'];
  const labels = Object.keys(byColumn);
  const values = Object.values(byColumn);
  const maxValue = Math.max(...values, 1);
  
  // Set canvas size
  canvas.width = canvas.offsetWidth || 400;
  canvas.height = 300;
  
  const barWidth = Math.floor((canvas.width - 40) / labels.length) - 20;
  const barSpacing = 10;
  const chartHeight = 200;
  const chartBottom = canvas.height - 60;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  labels.forEach((label, i) => {
    const value = values[i];
    const barHeight = (value / maxValue) * chartHeight;
    const x = i * (barWidth + barSpacing) + barSpacing + 20;
    const y = chartBottom - barHeight;
    
    // Draw bar
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, y, barWidth, barHeight);
    
    // Draw value on top
    ctx.fillStyle = '#333';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(value, x + barWidth / 2, y - 10);
    
    // Draw label
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.save();
    ctx.translate(x + barWidth / 2, chartBottom + 15);
    const maxLabelWidth = barWidth + 20;
    let displayLabel = label;
    if (ctx.measureText(label).width > maxLabelWidth) {
      // Truncate label if too long
      while (ctx.measureText(displayLabel + '...').width > maxLabelWidth && displayLabel.length > 0) {
        displayLabel = displayLabel.slice(0, -1);
      }
      displayLabel += '...';
    }
    ctx.fillText(displayLabel, 0, 0);
    ctx.restore();
  });
}

function renderRecentActivity(activities) {
  const container = document.getElementById('recent-activity-list');
  if (!container) return;
  
  if (activities.length === 0) {
    container.innerHTML = '<div class="empty-state-dash">No recent activity</div>';
    return;
  }
  
  container.innerHTML = activities.map(activity => `
    <div class="activity-item-dash">
      <div class="activity-description-dash">${escapeHtml(activity.description)}</div>
      <div class="activity-meta-dash">
        <span>${escapeHtml(activity.projectId)}</span>
        <span>•</span>
        <span>${formatTimestamp(activity.timestamp)}</span>
      </div>
    </div>
  `).join('');
}

// Drill-down functionality
function drillDown(type, index = null) {
  const board = state.boards.find(b => b.id === state.currentBoardId);
  if (!board) return;
  
  let projects = [];
  let title = 'Projects';
  
  // Collect all projects with their column info
  board.columns.forEach(column => {
    column.projects.forEach(project => {
      projects.push({
        ...project,
        columnId: column.id,
        columnTitle: column.title
      });
    });
  });
  
  // Filter based on drill-down type
  if (type === 'total') {
    title = 'All Projects';
    // Show all projects
  } else if (type === 'column') {
    const column = board.columns[index];
    if (column) {
      title = `${column.title} Projects`;
      projects = projects.filter(p => p.columnId === column.id);
    }
  } else if (type === 'links') {
    title = 'Projects with Links';
    projects = projects.filter(p => p.links && p.links.length > 0);
  } else if (type === 'comments') {
    title = 'Projects with Comments';
    projects = projects.filter(p => p.comments && p.comments.length > 0);
  } else if (type === 'activities') {
    title = 'Projects with Activities';
    projects = projects.filter(p => p.activityLog && p.activityLog.length > 0);
    // Sort by activity count
    projects.sort((a, b) => {
      const aCount = a.activityLog ? a.activityLog.length : 0;
      const bCount = b.activityLog ? b.activityLog.length : 0;
      return bCount - aCount;
    });
  }
  
  drillDownFilter = { type, index, projects };
  
  // Update modal
  document.getElementById('drilldown-title').textContent = title;
  document.getElementById('drilldown-count').textContent = `${projects.length} projects`;
  
  // Render project list
  renderDrillDownProjects(projects);
  
  // Show modal
  document.getElementById('drilldown-modal').style.display = 'flex';
  
  // Clear search
  document.getElementById('drilldown-search').value = '';
}

// Render drill-down projects
function renderDrillDownProjects(projects) {
  const container = document.getElementById('drilldown-list');
  
  if (projects.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="text-align: center; padding: 40px; color: #999;">
        <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
        <div style="font-size: 18px;">No projects found</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = projects.map(project => `
    <div class="drilldown-project-item" onclick="openProjectFromDrillDown('${project.columnId}', '${project.id}')">
      <div class="drilldown-project-header">
        <span class="drilldown-project-id">${escapeHtml(project.projectId)}</span>
        <span class="drilldown-project-column">${escapeHtml(project.columnTitle)}</span>
      </div>
      <div class="drilldown-project-name">${escapeHtml(project.projectName)}</div>
      ${project.description ? `
        <div class="drilldown-project-description">${escapeHtml(project.description)}</div>
      ` : ''}
      <div class="drilldown-project-meta">
        <span>🔗 ${project.links ? project.links.length : 0} links</span>
        <span>💬 ${project.comments ? project.comments.length : 0} comments</span>
        <span>📋 ${project.activityLog ? project.activityLog.length : 0} activities</span>
      </div>
    </div>
  `).join('');
}

// Open project from drill-down
function openProjectFromDrillDown(columnId, projectId) {
  const board = state.boards.find(b => b.id === state.currentBoardId);
  if (!board) return;
  
  closeDrillDown();
  openProjectModal(state.currentBoardId, columnId, projectId);
}

// Close drill-down modal
function closeDrillDown() {
  document.getElementById('drilldown-modal').style.display = 'none';
  drillDownFilter = null;
}

function renderTopProjects(projects) {
  const container = document.getElementById('top-projects-list');
  if (!container) return;
  
  if (projects.length === 0) {
    container.innerHTML = '<div class="empty-state-dash">No projects yet</div>';
    return;
  }
  
  container.innerHTML = projects.map(project => `
    <div class="top-project-item">
      <div class="top-project-info">
        <div class="top-project-name">${escapeHtml(project.projectName)}</div>
        <div class="top-project-stats">
          ${project.activityCount} activities • ${escapeHtml(project.columnTitle)}
        </div>
      </div>
      <div class="top-project-badge">${project.activityCount}</div>
    </div>
  `).join('');
}

function sortListView(column) {
  if (listSortColumn === column) {
    listSortDirection = listSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    listSortColumn = column;
    listSortDirection = 'asc';
  }
  
  // Update sort icons
  document.querySelectorAll('.sort-icon').forEach(icon => {
    icon.textContent = '⬍';
  });
  
  const th = document.querySelector(`th[data-sort="${column}"]`);
  if (th) {
    const icon = th.querySelector('.sort-icon');
    icon.textContent = listSortDirection === 'asc' ? '▲' : '▼';
  }
  
  renderListView();
}

function openProjectFromList(boardId, columnId, projectId) {
  openProjectModal(boardId, columnId, projectId);
}

function editProjectFromList(boardId, columnId, projectId) {
  openProjectModal(boardId, columnId, projectId);
}

function deleteProjectFromList(boardId, columnId, projectId) {
  showConfirmDialog(
    'Delete Project',
    'Are you sure you want to delete this project?',
    () => {
      deleteProject(boardId, columnId, projectId);
      renderListView();
    }
  );
}

function exportListToCSV() {
  const board = state.boards.find(b => b.id === state.currentBoardId);
  if (!board) return;
  
  let csv = 'Project ID,Project Name,Column,Description,Links,Comments,Last Updated\n';
  
  board.columns.forEach(column => {
    column.projects.forEach(project => {
      const updatedAt = project.updatedAt || project.createdAt || Date.now();
      csv += [
        project.projectId,
        `"${project.projectName.replace(/"/g, '""')}"`,
        `"${column.title.replace(/"/g, '""')}"`,
        `"${(project.description || '').replace(/"/g, '""')}"`,
        project.links ? project.links.length : 0,
        project.comments ? project.comments.length : 0,
        formatTimestamp(updatedAt)
      ].join(',') + '\n';
    });
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `projects-list-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('List exported to CSV');
}

// Widget Builder Functions
function openWidgetBuilder() {
  // Reset widget builder state
  widgetBuilderState = {
    currentStep: 1,
    selectedType: null,
    dataSource: 'built-in',
    selectedMetric: null,
    widgetConfig: {
      name: '',
      icon: '🎯',
      color: '#6366f1',
      size: 'medium',
      drilldown: true
    }
  };
  
  // Populate custom metrics dropdown
  populateCustomMetricsDropdown();
  
  // Reset UI
  document.querySelectorAll('.widget-type-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  // Show step 1
  showWidgetStep(1);
  
  // Open modal
  openModal('widgetBuilderModal');
}

function showWidgetStep(step) {
  widgetBuilderState.currentStep = step;
  
  // Update step indicators
  document.querySelectorAll('.step-item').forEach((item, index) => {
    if (index + 1 <= step) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // Hide all steps
  document.querySelectorAll('.widget-builder-step').forEach(stepEl => {
    stepEl.classList.add('hidden');
  });
  
  // Show current step
  document.getElementById(`widget-step-${step}`).classList.remove('hidden');
  
  // Update buttons
  const prevBtn = document.getElementById('widget-prev-btn');
  const nextBtn = document.getElementById('widget-next-btn');
  const createBtn = document.getElementById('widget-create-btn');
  
  prevBtn.style.display = step > 1 ? 'inline-flex' : 'none';
  nextBtn.style.display = step < 3 ? 'inline-flex' : 'none';
  createBtn.style.display = step === 3 ? 'inline-flex' : 'none';
}

function selectWidgetType(type) {
  widgetBuilderState.selectedType = type;
  
  // Update UI
  document.querySelectorAll('.widget-type-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  const selectedCard = document.querySelector(`[data-type="${type}"]`);
  if (selectedCard) {
    selectedCard.classList.add('selected');
  }
  
  // Set default name based on type
  const typeNames = {
    'stat_card': 'Stat Card',
    'list': 'List Widget',
    'chart': 'Chart Widget',
    'table': 'Table Widget',
    'progress': 'Progress Bar',
    'custom_metric': 'Custom Metric Widget'
  };
  
  widgetBuilderState.widgetConfig.name = typeNames[type] || 'Custom Widget';
}

function nextWidgetStep() {
  const currentStep = widgetBuilderState.currentStep;
  
  // Validation
  if (currentStep === 1 && !widgetBuilderState.selectedType) {
    showToast('Please select a widget type');
    return;
  }
  
  if (currentStep === 2) {
    const dataType = document.querySelector('input[name="dataType"]:checked').value;
    if (dataType === 'custom') {
      const selectedMetric = document.getElementById('custom-metric-select').value;
      if (!selectedMetric) {
        showToast('Please select a custom metric');
        return;
      }
      widgetBuilderState.selectedMetric = selectedMetric;
    }
  }
  
  if (currentStep < 3) {
    showWidgetStep(currentStep + 1);
    
    // If moving to step 3, populate form with current values
    if (currentStep + 1 === 3) {
      document.getElementById('widget-name').value = widgetBuilderState.widgetConfig.name;
      document.getElementById('widget-icon').value = widgetBuilderState.widgetConfig.icon;
      document.getElementById('widget-color').value = widgetBuilderState.widgetConfig.color;
      document.getElementById('widget-size').value = widgetBuilderState.widgetConfig.size;
      document.getElementById('widget-drilldown').checked = widgetBuilderState.widgetConfig.drilldown;
      updateWidgetPreview();
    }
  }
}

function previousWidgetStep() {
  const currentStep = widgetBuilderState.currentStep;
  if (currentStep > 1) {
    showWidgetStep(currentStep - 1);
  }
}

function toggleDataSourceOptions() {
  const dataType = document.querySelector('input[name="dataType"]:checked').value;
  widgetBuilderState.dataSource = dataType;
  
  const builtInSection = document.getElementById('built-in-metrics-section');
  const customSection = document.getElementById('custom-metrics-section');
  const manualSection = document.getElementById('manual-config-section');
  
  builtInSection.classList.add('hidden');
  customSection.classList.add('hidden');
  manualSection.classList.add('hidden');
  
  if (dataType === 'built-in') {
    builtInSection.classList.remove('hidden');
  } else if (dataType === 'custom') {
    customSection.classList.remove('hidden');
  } else if (dataType === 'manual') {
    manualSection.classList.remove('hidden');
  }
}

function populateCustomMetricsDropdown() {
  const select = document.getElementById('custom-metric-select');
  select.innerHTML = '<option value="">-- Choose a custom metric --</option>';
  
  if (state.dashboardConfig.customMetrics && state.dashboardConfig.customMetrics.length > 0) {
    state.dashboardConfig.customMetrics.forEach(metric => {
      const option = document.createElement('option');
      option.value = metric.id;
      option.textContent = `${metric.icon} ${metric.name} (${metric.type})`;
      select.appendChild(option);
    });
  } else {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No custom metrics created yet';
    option.disabled = true;
    select.appendChild(option);
  }
  
  // Add change listener to show metric info
  select.onchange = () => {
    const metricId = select.value;
    const infoDiv = document.getElementById('custom-metric-info');
    
    if (metricId) {
      const metric = state.dashboardConfig.customMetrics.find(m => m.id === metricId);
      if (metric) {
        const value = calculateCustomMetric(metric);
        infoDiv.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 32px;">${metric.icon}</div>
            <div>
              <div style="font-weight: 600; color: var(--color-text);">${metric.name}</div>
              <div style="font-size: 12px; color: var(--color-text-secondary);">Type: ${metric.type} • Current Value: ${value}</div>
            </div>
          </div>
        `;
        infoDiv.style.display = 'block';
      }
    } else {
      infoDiv.style.display = 'none';
    }
  };
}

function updateWidgetPreview() {
  const name = document.getElementById('widget-name').value || 'Custom Widget';
  const icon = document.getElementById('widget-icon').value || '🎯';
  const color = document.getElementById('widget-color').value || '#6366f1';
  
  const preview = document.getElementById('widget-preview');
  preview.innerHTML = `
    <div class="stat-card" style="background: ${color}15; border-left: 4px solid ${color};">
      <div class="stat-icon">${icon}</div>
      <div class="stat-value">42</div>
      <div class="stat-label">${name}</div>
    </div>
  `;
}

function createCustomWidget() {
  // Get final values
  const name = document.getElementById('widget-name').value.trim();
  const icon = document.getElementById('widget-icon').value.trim();
  const color = document.getElementById('widget-color').value;
  const size = document.getElementById('widget-size').value;
  const drilldown = document.getElementById('widget-drilldown').checked;
  
  if (!name) {
    showToast('Please enter a widget name');
    return;
  }
  
  // Create widget object
  const widget = {
    id: generateId('custom-widget'),
    type: widgetBuilderState.selectedType,
    name: name,
    icon: icon || '🎯',
    color: color,
    size: size,
    drilldown: drilldown,
    dataSource: widgetBuilderState.dataSource,
    metricId: widgetBuilderState.selectedMetric,
    createdAt: Date.now()
  };
  
  // Add to custom widgets
  if (!state.customWidgets) {
    state.customWidgets = [];
  }
  state.customWidgets.push(widget);
  
  // Save
  saveData();
  
  // Close modal
  closeModal('widgetBuilderModal');
  
  // Refresh dashboard
  renderDashboard();
  
  showToast(`✨ Custom widget "${name}" created successfully!`);
}

// Sample Data Loader
function loadSampleData() {
  const sampleBoard = {
    id: 'board-1',
    name: 'My Projects Board',
    projectIdPrefix: 'PROJ',
    description: 'Sample board with projects',
    columns: [
      {
        id: 'col-1',
        title: 'To Do',
        order: 0,
        projects: [
          {
            id: 'proj-001',
            projectId: 'PROJ-001',
            projectName: 'Design Homepage',
            description: 'Create wireframes and mockups for new homepage',
            links: [
              { id: 'link-1', url: 'https://figma.com/design', title: 'Figma Design', timestamp: new Date('2025-10-27T10:30:00').getTime() }
            ],
            comments: [
              { id: 'comment-1', text: 'Need to review with team', timestamp: new Date('2025-10-27T11:00:00').getTime() }
            ],
            activityLog: [
              { id: 'act-1', action: 'created', description: 'Project created', timestamp: new Date('2025-10-27T10:00:00').getTime(), oldValue: null, newValue: null }
            ],
            createdAt: new Date('2025-10-27T10:00:00').getTime(),
            updatedAt: new Date('2025-10-27T11:00:00').getTime()
          },
          {
            id: 'proj-002',
            projectId: 'PROJ-002',
            projectName: 'Update Documentation',
            description: 'Add API documentation for new endpoints',
            links: [],
            comments: [],
            activityLog: [
              { id: 'act-2', action: 'created', description: 'Project created', timestamp: new Date('2025-10-26T09:00:00').getTime(), oldValue: null, newValue: null }
            ],
            createdAt: new Date('2025-10-26T09:00:00').getTime(),
            updatedAt: new Date('2025-10-26T09:00:00').getTime()
          }
        ]
      },
      {
        id: 'col-2',
        title: 'In Progress',
        order: 1,
        projects: [
          {
            id: 'proj-003',
            projectId: 'PROJ-003',
            projectName: 'Build API',
            description: 'Develop REST API for user management',
            links: [
              { id: 'link-2', url: 'https://github.com/api', title: 'GitHub Repository', timestamp: new Date('2025-10-25T14:00:00').getTime() }
            ],
            comments: [
              { id: 'comment-2', text: '70% complete', timestamp: new Date('2025-10-28T09:00:00').getTime() }
            ],
            activityLog: [
              { id: 'act-3', action: 'created', description: 'Project created', timestamp: new Date('2025-10-25T14:00:00').getTime(), oldValue: null, newValue: null },
              { id: 'act-4', action: 'moved', description: "Column changed from 'To Do' to 'In Progress'", timestamp: new Date('2025-10-26T10:00:00').getTime(), oldValue: 'To Do', newValue: 'In Progress' }
            ],
            createdAt: new Date('2025-10-25T14:00:00').getTime(),
            updatedAt: new Date('2025-10-28T09:00:00').getTime()
          },
          {
            id: 'proj-004',
            projectId: 'PROJ-004',
            projectName: 'Fix Login Bug',
            description: 'Users cannot login with special characters',
            links: [],
            comments: [
              { id: 'comment-3', text: 'Found the issue, testing fix', timestamp: new Date('2025-10-28T10:00:00').getTime() }
            ],
            activityLog: [
              { id: 'act-5', action: 'created', description: 'Project created', timestamp: new Date('2025-10-28T08:00:00').getTime(), oldValue: null, newValue: null }
            ],
            createdAt: new Date('2025-10-28T08:00:00').getTime(),
            updatedAt: new Date('2025-10-28T10:00:00').getTime()
          }
        ]
      },
      {
        id: 'col-3',
        title: 'Done',
        order: 2,
        projects: [
          {
            id: 'proj-005',
            projectId: 'PROJ-005',
            projectName: 'Setup CI/CD',
            description: 'Configure GitHub Actions for deployment',
            links: [
              { id: 'link-3', url: 'https://github.com/actions', title: 'GitHub Actions', timestamp: new Date('2025-10-24T11:00:00').getTime() }
            ],
            comments: [
              { id: 'comment-4', text: 'Deployed successfully', timestamp: new Date('2025-10-24T16:00:00').getTime() }
            ],
            activityLog: [
              { id: 'act-6', action: 'created', description: 'Project created', timestamp: new Date('2025-10-24T11:00:00').getTime(), oldValue: null, newValue: null },
              { id: 'act-7', action: 'moved', description: "Column changed from 'In Progress' to 'Done'", timestamp: new Date('2025-10-24T16:00:00').getTime(), oldValue: 'In Progress', newValue: 'Done' }
            ],
            createdAt: new Date('2025-10-24T11:00:00').getTime(),
            updatedAt: new Date('2025-10-24T16:00:00').getTime()
          },
          {
            id: 'proj-006',
            projectId: 'PROJ-006',
            projectName: 'Database Migration',
            description: 'Migrate from MySQL to PostgreSQL',
            links: [],
            comments: [
              { id: 'comment-5', text: 'Migration completed with no issues', timestamp: new Date('2025-10-23T18:00:00').getTime() }
            ],
            activityLog: [
              { id: 'act-8', action: 'created', description: 'Project created', timestamp: new Date('2025-10-23T10:00:00').getTime(), oldValue: null, newValue: null },
              { id: 'act-9', action: 'moved', description: "Column changed from 'To Do' to 'In Progress'", timestamp: new Date('2025-10-23T12:00:00').getTime(), oldValue: 'To Do', newValue: 'In Progress' },
              { id: 'act-10', action: 'moved', description: "Column changed from 'In Progress' to 'Done'", timestamp: new Date('2025-10-23T18:00:00').getTime(), oldValue: 'In Progress', newValue: 'Done' }
            ],
            createdAt: new Date('2025-10-23T10:00:00').getTime(),
            updatedAt: new Date('2025-10-23T18:00:00').getTime()
          }
        ]
      }
    ]
  };
  
  state.boards = [sampleBoard];
  state.currentBoardId = sampleBoard.id;
  saveData();
  showToast('Sample board loaded with 6 projects!');
  console.log('✅ Sample data loaded successfully');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Initializing Kanban Board...');
  
  // Debug: Check if buttons exist in DOM
  console.log('=== Button Visibility Check ===');
  const exportBtn = document.getElementById('export-json-btn');
  const importBtn = document.getElementById('import-json-btn');
  const sheetsBtn = document.getElementById('export-sheets-btn');
  
  console.log('Export button:', exportBtn ? '✅ Found' : '❌ Not found');
  console.log('Import button:', importBtn ? '✅ Found' : '❌ Not found');
  console.log('Sheets button:', sheetsBtn ? '✅ Found' : '❌ Not found');
  
  if (exportBtn) {
    const styles = window.getComputedStyle(exportBtn);
    console.log('Export button display:', styles.display);
    console.log('Export button visibility:', styles.visibility);
    console.log('Export button opacity:', styles.opacity);
  }
  
  // Check localStorage availability
  storageAvailable = checkStorageAvailability();
  
  if (storageAvailable) {
    console.log('✅ localStorage is available');
    showToast('Storage available - data will auto-save');
  } else {
    console.warn('⚠️ localStorage not available');
    showToast('⚠️ Storage unavailable. Use Export/Import for backups.');
    updateStorageStatus('No storage', false);
  }
  
  // Load data from localStorage
  const dataLoaded = loadData();
  
  // Load sample data if no data exists
  if (!dataLoaded || state.boards.length === 0) {
    console.log('No data found, loading sample board...');
    loadSampleData();
  }
  
  if (state.boards.length > 0) {
    // Show first board or last used board
    if (state.currentBoardId) {
      const board = state.boards.find(b => b.id === state.currentBoardId);
      if (board) {
        renderBoard();
      } else {
        state.currentBoardId = state.boards[0].id;
        renderBoard();
      }
    } else {
      state.currentBoardId = state.boards[0].id;
      renderBoard();
    }
    updateBoardSelector();
  }
  
  // Set up auto-save (every 30 seconds)
  if (storageAvailable) {
    setInterval(() => {
      if (state.boards.length > 0) {
        saveData();
      }
    }, 30000);
    console.log('⏰ Auto-save enabled (every 30 seconds)');
  }
  
  // Check backup reminder after 5 seconds
  checkBackupReminder();
  
  // Debug keyboard shortcut (Ctrl+Shift+D)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      showDebugInfo();
    }
  });

  // Create Board
  document.getElementById('createBoardBtn').addEventListener('click', () => {
    document.getElementById('newBoardName').value = '';
    document.getElementById('newBoardPrefix').value = '';
    document.getElementById('newBoardDesc').value = '';
    openModal('createBoardModal');
  });

  document.getElementById('confirmCreateBoard').addEventListener('click', () => {
    const name = document.getElementById('newBoardName').value.trim();
    const prefix = document.getElementById('newBoardPrefix').value.trim();
    const description = document.getElementById('newBoardDesc').value.trim();

    if (!name || !prefix) {
      showToast('Please enter board name and prefix');
      return;
    }

    createBoard(name, prefix, description);
    closeModal('createBoardModal');
  });

  // Board Selector
  document.getElementById('boardSelector').addEventListener('change', (e) => {
    const boardId = e.target.value;
    if (!boardId || boardId === state.currentBoardId) {
      return;
    }
    
    const board = state.boards.find(b => b.id === boardId);
    if (!board) {
      console.error(`Board not found: ${boardId}`);
      return;
    }
    
    state.currentBoardId = boardId;
    saveData();
    
    // Ensure we're in board view
    if (currentView !== 'board') {
      toggleView('board');
    } else {
      renderBoard();
    }
    
    showToast(`Switched to board: ${board.name}`);
  });

  // Board Settings
  document.getElementById('boardSettingsBtn').addEventListener('click', () => {
    const board = getCurrentBoard();
    if (!board) {
      showToast('Please select or create a board first');
      return;
    }

    document.getElementById('editBoardName').value = board.name;
    document.getElementById('editBoardPrefix').value = board.projectIdPrefix;
    document.getElementById('editBoardDesc').value = board.description;
    openModal('boardSettingsModal');
  });

  document.getElementById('saveBoardSettings').addEventListener('click', () => {
    const name = document.getElementById('editBoardName').value.trim();
    const prefix = document.getElementById('editBoardPrefix').value.trim();
    const description = document.getElementById('editBoardDesc').value.trim();

    if (!name || !prefix) {
      showToast('Please enter board name and prefix');
      return;
    }

    updateBoard(state.currentBoardId, {
      name,
      projectIdPrefix: prefix.toUpperCase(),
      description
    });
    closeModal('boardSettingsModal');
    showToast('Board settings updated');
  });

  document.getElementById('deleteBoardBtn').addEventListener('click', () => {
    showConfirmDialog(
      'Delete Board',
      'Are you sure you want to delete this board? All projects will be lost.',
      () => {
        deleteBoard(state.currentBoardId);
        closeModal('boardSettingsModal');
      }
    );
  });
  
  // Clear All Data
  document.getElementById('clearAllDataBtn').addEventListener('click', () => {
    clearAllData();
    closeModal('boardSettingsModal');
  });

  // Add Column
  document.getElementById('addColumnBtn').addEventListener('click', () => {
    document.getElementById('newColumnTitle').value = '';
    openModal('addColumnModal');
  });

  document.getElementById('confirmAddColumn').addEventListener('click', () => {
    const title = document.getElementById('newColumnTitle').value.trim();
    if (!title) {
      showToast('Please enter column title');
      return;
    }

    createColumn(state.currentBoardId, title);
    closeModal('addColumnModal');
  });

  // Project Modal - Delete Project
  document.getElementById('deleteProjectBtn').addEventListener('click', () => {
    showConfirmDialog(
      'Delete Project',
      'Are you sure you want to delete this project?',
      () => {
        deleteProject(currentContext.boardId, currentContext.columnId, currentContext.projectId);
        closeModal('projectModal');
      }
    );
  });

  // Add Link
  document.getElementById('addLinkBtn').addEventListener('click', () => {
    document.getElementById('linkTitle').value = '';
    document.getElementById('linkUrl').value = '';
    document.getElementById('linkModalTitle').textContent = 'Add Link';
    currentContext.linkId = null;
    openModal('addLinkModal');
  });

  document.getElementById('confirmAddLink').addEventListener('click', () => {
    const title = document.getElementById('linkTitle').value.trim();
    const url = document.getElementById('linkUrl').value.trim();

    if (!title || !url) {
      showToast('Please enter both title and URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      showToast('Please enter a valid URL');
      return;
    }

    if (currentContext.linkId) {
      updateLink(currentContext.boardId, currentContext.columnId, currentContext.projectId, currentContext.linkId, url, title);
    } else {
      addLink(currentContext.boardId, currentContext.columnId, currentContext.projectId, url, title);
    }
    
    closeModal('addLinkModal');
  });

  // Add Comment
  document.getElementById('addCommentBtn').addEventListener('click', () => {
    const text = document.getElementById('newCommentText').value.trim();
    
    if (!text) {
      showToast('Please enter comment text');
      return;
    }

    // No character limit - unlimited comment length

    addComment(currentContext.boardId, currentContext.columnId, currentContext.projectId, text);
    document.getElementById('newCommentText').value = '';
  });

  // Search with clear button
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');

  searchInput.addEventListener('input', (e) => {
    searchProjects(e.target.value);
    
    // Show/hide clear button
    if (e.target.value.length > 0) {
      searchClear.classList.add('active');
    } else {
      searchClear.classList.remove('active');
    }
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.remove('active');
    searchProjects('');
    searchInput.focus();
  });

  // Keyboard support - Escape to clear search
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchInput.value) {
      e.preventDefault();
      searchInput.value = '';
      searchClear.classList.remove('active');
      searchProjects('');
      searchInput.blur();
    }
  });

  // Board title click to edit
  document.getElementById('boardTitle').addEventListener('click', () => {
    const board = getCurrentBoard();
    if (!board) return;
    document.getElementById('boardSettingsBtn').click();
  });
  
  // View toggle event listeners
  document.getElementById('board-view-btn').addEventListener('click', () => toggleView('board'));
  document.getElementById('list-view-btn').addEventListener('click', () => toggleView('list'));
  document.getElementById('dashboard-view-btn').addEventListener('click', () => toggleView('dashboard'));
  document.getElementById('export-list-btn').addEventListener('click', exportListToCSV);
  
  // Add sort listeners to table headers
  document.querySelectorAll('.projects-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const column = th.getAttribute('data-sort');
      sortListView(column);
    });
  });
  
  // List search
  document.getElementById('list-search').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('.projects-table tbody tr');
    
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
    
    // Update count
    const visibleRows = Array.from(rows).filter(row => row.style.display !== 'none').length;
    document.getElementById('list-total-count').textContent = `Showing: ${visibleRows} projects`;
  });
  
  // Drill-down search
  const drilldownSearch = document.getElementById('drilldown-search');
  if (drilldownSearch) {
    drilldownSearch.addEventListener('input', (e) => {
      if (!drillDownFilter) return;
      
      const searchTerm = e.target.value.toLowerCase();
      const filtered = drillDownFilter.projects.filter(project => {
        const searchable = [
          project.projectId,
          project.projectName,
          project.description,
          project.columnTitle
        ].join(' ').toLowerCase();
        
        return searchable.includes(searchTerm);
      });
      
      document.getElementById('drilldown-count').textContent = `${filtered.length} projects`;
      renderDrillDownProjects(filtered);
    });
  }
  
  // Close drill-down on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('drilldown-modal').style.display === 'flex') {
      closeDrillDown();
    }
  });
  
  // Close drill-down on background click
  const drilldownModal = document.getElementById('drilldown-modal');
  if (drilldownModal) {
    drilldownModal.addEventListener('click', (e) => {
      if (e.target.id === 'drilldown-modal') {
        closeDrillDown();
      }
    });
  }
  
  // Add Project button in List View
  document.getElementById('add-project-list-btn')?.addEventListener('click', () => {
    const board = state.boards.find(b => b.id === state.currentBoardId);
    if (!board || board.columns.length === 0) {
      showToast('Please add columns to the board first');
      return;
    }
    
    // Create project in first column by default
    const firstColumn = board.columns[0];
    createProject(state.currentBoardId, firstColumn.id);
  });
  
  // List filter
  document.getElementById('list-filter').addEventListener('change', (e) => {
    const columnId = e.target.value;
    const board = state.boards.find(b => b.id === state.currentBoardId);
    if (!board) return;
    
    const rows = document.querySelectorAll('.projects-table tbody tr');
    
    if (columnId === 'all') {
      rows.forEach(row => row.style.display = '');
    } else {
      const allProjects = [];
      board.columns.forEach(col => {
        col.projects.forEach(proj => {
          allProjects.push({ ...proj, columnId: col.id });
        });
      });
      
      rows.forEach((row, index) => {
        const project = allProjects[index];
        row.style.display = project && project.columnId === columnId ? '' : 'none';
      });
    }
    
    // Update count
    const visibleRows = Array.from(rows).filter(row => row.style.display !== 'none').length;
    document.getElementById('list-total-count').textContent = `Showing: ${visibleRows} projects`;
  });
  
  // Export/Import event listeners
  console.log('Setting up Export/Import button listeners...');
  
  const exportJsonBtn = document.getElementById('export-json-btn');
  const importJsonBtn = document.getElementById('import-json-btn');
  const exportSheetsBtn = document.getElementById('export-sheets-btn');
  
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', exportToJSON);
    console.log('✅ Export JSON button listener attached');
  } else {
    console.error('❌ Export JSON button not found!');
  }
  
  if (importJsonBtn) {
    importJsonBtn.addEventListener('click', importFromJSON);
    console.log('✅ Import JSON button listener attached');
  } else {
    console.error('❌ Import JSON button not found!');
  }
  
  if (exportSheetsBtn) {
    exportSheetsBtn.addEventListener('click', exportToGoogleSheets);
    console.log('✅ Export Sheets button listener attached');
  } else {
    console.error('❌ Export Sheets button not found!');
  }
  
  // Dashboard Customization event listeners
  const customizeDashboardBtn = document.getElementById('customizeDashboardBtn');
  if (customizeDashboardBtn) {
    customizeDashboardBtn.addEventListener('click', openDashboardCustomization);
    console.log('✅ Customize Dashboard button listener attached');
  }
  
  // Add Custom Widget button listener
  const addWidgetBtn = document.getElementById('addCustomWidgetBtn');
  if (addWidgetBtn) {
    addWidgetBtn.addEventListener('click', openWidgetBuilder);
    console.log('✅ Add Custom Widget button listener attached');
  } else {
    console.error('❌ Add Custom Widget button not found!');
  }
  
  // Widget builder real-time preview update
  const widgetNameInput = document.getElementById('widget-name');
  const widgetIconInput = document.getElementById('widget-icon');
  const widgetColorInput = document.getElementById('widget-color');
  
  if (widgetNameInput) {
    widgetNameInput.addEventListener('input', updateWidgetPreview);
  }
  if (widgetIconInput) {
    widgetIconInput.addEventListener('input', updateWidgetPreview);
  }
  if (widgetColorInput) {
    widgetColorInput.addEventListener('change', updateWidgetPreview);
  }
  
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      
      // Remove active from all tabs and panes
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      
      // Add active to clicked tab and corresponding pane
      btn.classList.add('active');
      document.getElementById(tabName + '-tab').classList.add('active');
    });
  });
  
  // Filter buttons
  document.getElementById('applyFiltersBtn')?.addEventListener('click', applyDashboardFilters);
  document.getElementById('clearFiltersBtn')?.addEventListener('click', clearDashboardFilters);
  document.getElementById('applyCustomRangeBtn')?.addEventListener('click', applyCustomDateRange);
  
  // Date range dropdown change handler
  document.getElementById('filter-date-range')?.addEventListener('change', toggleCustomDateInputs);
  
  // Custom metrics buttons
  document.getElementById('createMetricBtn')?.addEventListener('click', showMetricBuilder);
  document.getElementById('addConditionBtn')?.addEventListener('click', addMetricCondition);
  document.getElementById('saveMetricBtn')?.addEventListener('click', saveCustomMetric);
  document.getElementById('cancelMetricBtn')?.addEventListener('click', hideMetricBuilder);
  
  // Dashboard config buttons
  document.getElementById('resetDashboardBtn')?.addEventListener('click', resetDashboardConfig);
  document.getElementById('exportConfigBtn')?.addEventListener('click', exportDashboardConfig);
  document.getElementById('importConfigBtn')?.addEventListener('click', importDashboardConfig);
  document.getElementById('saveDashboardConfigBtn')?.addEventListener('click', saveDashboardConfig);
  
  // Update board hint visibility
  updateBoardHint();
  
  console.log('✅ Kanban Board initialized successfully');
  console.log('📦 Application is fully self-contained - no external dependencies');
  
  // Confirm app is ready
  setTimeout(() => {
    if (document.getElementById('storage-status')) {
      updateStorageStatus('Ready', true);
    }
  }, 500);
});

// Update board hint visibility
function updateBoardHint() {
  const boardHint = document.getElementById('boardHint');
  if (boardHint) {
    boardHint.style.display = state.boards.length === 0 ? 'inline' : 'none';
  }
}