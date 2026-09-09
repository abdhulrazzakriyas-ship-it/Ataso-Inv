// Ataso Inventory ERP - Application Controller with Barcode Scanner & Dark Mode (Flat Architecture)

let currentTab = 'dashboard';
let currentCategoryDetailId = null;
let currentSearch = '';
let currentCategoryFilter = 'all';
let currentStatusFilter = 'all';
let currentSortField = 'urgency';

let editingItemId = null;
let editingCategoryId = null;
let confirmActionCallback = null;

// Barcode Scanner & Stock Movement State
let html5QrcodeScanner = null;
let isCameraActive = false;
let selectedMovementType = 'STOCK_IN';
let recentScans = [];

// USB Keyboard Wedge Detection State
let wedgeBuffer = '';
let lastKeyTime = 0;

// Sales Management Module State
let activeSaleLines = [];
let currentViewingSaleId = null;

// HTML Escaping Utility
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initEventListeners();
  initKeyboardWedgeScanner();
  await loadCurrentView();

  // Automatic full ERP synchronization with Supabase
  if (typeof dbSyncAllToSupabase === 'function') {
    dbSyncAllToSupabase().catch((e) => console.warn('Auto sync start notice:', e));
  }

  // Real-time synchronization subscription
  dbSubscribeToChanges(async () => {
    await loadCurrentView();
  });
});

// --- THEME ENGINE ---
function initTheme() {
  const savedTheme = dbGetTheme();
  setERPTheme(savedTheme, false);
}

function setERPTheme(theme, notify = true) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
    document.getElementById('themeToggleIcon').textContent = '🌙';
    document.getElementById('themeToggleLabel').textContent = 'Dark';
  } else {
    document.body.classList.remove('dark-theme');
    document.getElementById('themeToggleIcon').textContent = '☀️';
    document.getElementById('themeToggleLabel').textContent = 'Light';
  }
  if (notify) dbSetTheme(theme);
}

function toggleTheme() {
  const isDark = document.body.classList.contains('dark-theme');
  setERPTheme(isDark ? 'light' : 'dark', true);
}

// --- TOASTS & CONFIRM DIALOGS ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : 'toast-success'}`;
  toast.innerHTML = `
    <span>${type === 'error' ? '🚨' : '✓'}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function showConfirmDialog(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmActionCallback = onConfirm;
  document.getElementById('confirmModalOverlay').style.display = 'flex';
}

function closeConfirmDialog() {
  document.getElementById('confirmModalOverlay').style.display = 'none';
  confirmActionCallback = null;
}

// --- KEYBOARD WEDGE USB SCANNER LISTENER ---
function initKeyboardWedgeScanner() {
  document.addEventListener('keydown', async (e) => {
    // Ignore input if user is typing in an active text box or textarea
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
      if (active.id !== 'scanInput') return;
    }

    const currentTime = Date.now();
    if (currentTime - lastKeyTime > 60) {
      wedgeBuffer = '';
    }
    lastKeyTime = currentTime;

    if (e.key === 'Enter') {
      if (wedgeBuffer.length >= 4) {
        e.preventDefault();
        const scannedCode = wedgeBuffer.trim();
        wedgeBuffer = '';
        await processScannedBarcode(scannedCode);
      }
    } else if (e.key.length === 1) {
      wedgeBuffer += e.key;
    }
  });
}

function initEventListeners() {
  // Theme Toggle Button
  document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);

  // Navigation Links
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      const target = el.getAttribute('data-nav');
      const filterStatus = el.getAttribute('data-status-filter');
      const filterCategory = el.getAttribute('data-category-filter');

      currentTab = target;
      if (filterStatus) currentStatusFilter = filterStatus;
      else if (target === 'inventory') currentStatusFilter = 'all';

      if (filterCategory) currentCategoryFilter = filterCategory;
      else if (target === 'inventory') currentCategoryFilter = 'all';

      updateNavActiveState();
      await loadCurrentView();
    });
  });

  // Global Header Search Input
  const globalSearchInput = document.getElementById('globalSearchInput');
  if (globalSearchInput) {
    globalSearchInput.addEventListener('input', async (e) => {
      currentSearch = e.target.value;
      if (currentTab !== 'inventory') {
        currentTab = 'inventory';
        updateNavActiveState();
      }
      await renderInventoryView();
    });
  }

  // Barcode Form Submit
  const barcodeScanForm = document.getElementById('barcodeScanForm');
  if (barcodeScanForm) {
    barcodeScanForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = document.getElementById('scanInput').value.trim();
      if (val) await processScannedBarcode(val);
    });
  }

  const clearScanBtn = document.getElementById('clearScanBtn');
  if (clearScanBtn) {
    clearScanBtn.addEventListener('click', () => {
      document.getElementById('scanInput').value = '';
      renderScanView(null, null);
    });
  }

  const startCameraBtn = document.getElementById('startCameraBtn');
  if (startCameraBtn) {
    startCameraBtn.addEventListener('click', toggleCameraScanner);
  }

  // Confirmation Modal buttons
  document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirmDialog);
  document.getElementById('confirmOkBtn').addEventListener('click', async () => {
    if (confirmActionCallback) {
      const fn = confirmActionCallback;
      closeConfirmDialog();
      await fn();
    }
  });

  // Modal Close Buttons
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach((m) => (m.style.display = 'none'));
      editingItemId = null;
      editingCategoryId = null;
      stopCameraScanner();
    });
  });

  // Action Triggers
  document.querySelectorAll('[data-action="add-item"]').forEach((btn) => {
    btn.addEventListener('click', () => openAddItemModal());
  });

  document.querySelectorAll('[data-action="add-category"]').forEach((btn) => {
    btn.addEventListener('click', () => openAddCategoryModal());
  });

  document.querySelectorAll('[data-action="add-raw-material"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openAddRawMaterialModal();
    });
  });

  // Form Submissions
  document.getElementById('addItemForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSaveItemForm();
  });

  document.getElementById('addCategoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSaveCategoryForm();
  });

  document.getElementById('stockUpdateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSaveStockUpdate();
  });

  // Sales Module Event Listeners
  const openPicker1 = document.getElementById('openItemPickerBtn');
  if (openPicker1) openPicker1.addEventListener('click', () => openItemPickerModal());

  const openPicker2 = document.getElementById('openItemPickerBtn2');
  if (openPicker2) openPicker2.addEventListener('click', () => openItemPickerModal());

  const saveSaleBtn = document.getElementById('saveSaleBtn');
  if (saveSaleBtn) saveSaleBtn.addEventListener('click', async () => await handleSaveSale());

  const newSaleAmountPaid = document.getElementById('newSaleAmountPaid');
  if (newSaleAmountPaid) {
    newSaleAmountPaid.addEventListener('input', () => updateSaleSummaryTotals());
  }

  // Item Picker Search & Filters
  const pickerSearch = document.getElementById('pickerSearchInput');
  if (pickerSearch) {
    pickerSearch.addEventListener('input', () => renderItemPickerList());
  }
  const pickerCatFilter = document.getElementById('pickerCategoryFilter');
  if (pickerCatFilter) {
    pickerCatFilter.addEventListener('change', () => renderItemPickerList());
  }

  // Sales History Filters
  const shSearch = document.getElementById('salesHistorySearch');
  if (shSearch) shSearch.addEventListener('input', async () => await renderSalesHistoryView());

  const shPayFilter = document.getElementById('salesHistoryPaymentFilter');
  if (shPayFilter) shPayFilter.addEventListener('change', async () => await renderSalesHistoryView());

  const shDateFilter = document.getElementById('salesHistoryDateFilter');
  if (shDateFilter) shDateFilter.addEventListener('change', async () => await renderSalesHistoryView());

  const dlInvPdfBtn = document.getElementById('downloadInvoicePdfBtn');
  if (dlInvPdfBtn) dlInvPdfBtn.addEventListener('click', async () => await downloadInvoicePDF());

  const expInvPdfBtn = document.getElementById('exportInventoryPdfBtn');
  if (expInvPdfBtn) expInvPdfBtn.addEventListener('click', async () => await generateInventoryPDFReport());

  const shResetFilter = document.getElementById('salesHistoryResetFilter');
  if (shResetFilter) {
    shResetFilter.addEventListener('click', async () => {
      document.getElementById('salesHistorySearch').value = '';
      document.getElementById('salesHistoryPaymentFilter').value = '';
      document.getElementById('salesHistoryDateFilter').value = '';
      await renderSalesHistoryView();
    });
  }

  // Raw Materials Filters
  const rawSearch = document.getElementById('rawMatSearchInput');
  if (rawSearch) rawSearch.addEventListener('input', async () => await renderRawMaterialsView());

  const rawCat = document.getElementById('rawMatCategoryFilter');
  if (rawCat) rawCat.addEventListener('change', async () => await renderRawMaterialsView());

  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = parseInt(document.getElementById('thresholdInput').value, 10);
    if (isNaN(val) || val < 0) {
      showToast('Threshold must be a non-negative whole number.', 'error');
      return;
    }
    await dbUpdateSettings(val);
    showToast(`Low Stock Threshold set to ${val}.`);
    await loadCurrentView();
  });
}

function updateNavActiveState() {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    const navName = el.getAttribute('data-nav');
    const filterStatus = el.getAttribute('data-status-filter');

    let isActive = navName === currentTab;
    if (navName === 'inventory' && filterStatus) {
      isActive = currentTab === 'inventory' && currentStatusFilter === filterStatus;
    }

    if (isActive) el.classList.add('active');
    else el.classList.remove('active');
  });
}

function updateBreadcrumb() {
  const trail = document.getElementById('breadcrumbTrail');
  if (!trail) return;

  const map = {
    dashboard: '<span class="breadcrumb-item active">Dashboard</span>',
    inventory: '<a href="#" data-nav="dashboard" class="breadcrumb-item">Home</a> / <span class="breadcrumb-item active">Inventory Directory</span>',
    scan: '<a href="#" data-nav="dashboard" class="breadcrumb-item">Home</a> / <span class="breadcrumb-item active">Barcode Scanner</span>',
    categories: '<a href="#" data-nav="dashboard" class="breadcrumb-item">Home</a> / <span class="breadcrumb-item active">Categories</span>',
    'category-detail': '<a href="#" data-nav="dashboard" class="breadcrumb-item">Home</a> / <a href="#" data-nav="categories" class="breadcrumb-item">Categories</a> / <span class="breadcrumb-item active">Category Items</span>',
    sales: '<a href="#" data-nav="dashboard" class="breadcrumb-item">Home</a> / <span class="breadcrumb-item active">Sales Hub</span>',
    'new-sale': '<a href="#" data-nav="dashboard" class="breadcrumb-item">Home</a> / <a href="#" data-nav="sales" class="breadcrumb-item">Sales</a> / <span class="breadcrumb-item active">New Sale / Bill</span>',
    'sales-history': '<a href="#" data-nav="dashboard" class="breadcrumb-item">Home</a> / <a href="#" data-nav="sales" class="breadcrumb-item">Sales</a> / <span class="breadcrumb-item active">Sales History</span>',
    'sale-detail': '<a href="#" data-nav="dashboard" class="breadcrumb-item">Home</a> / <a href="#" data-nav="sales-history" class="breadcrumb-item">Sales History</a> / <span class="breadcrumb-item active">Invoice Details</span>',
    'low-stock': '<a href="#" data-nav="dashboard" class="breadcrumb-item">Home</a> / <span class="breadcrumb-item active">Low Stock Module</span>',
    'out-of-stock': '<a href="#" data-nav="dashboard" class="breadcrumb-item">Home</a> / <span class="breadcrumb-item active">Out of Stock Module</span>',
    'raw-materials': '<a href="#" data-nav="dashboard" class="breadcrumb-item">Home</a> / <span class="breadcrumb-item active">Raw Materials Stock</span>',
    settings: '<a href="#" data-nav="dashboard" class="breadcrumb-item">Home</a> / <span class="breadcrumb-item active">ERP Settings</span>',
  };

  trail.innerHTML = map[currentTab] || '<span class="breadcrumb-item active">Dashboard</span>';
}

async function loadCurrentView() {
  updateBreadcrumb();

  // Stop camera scanner if navigating away from scan view
  if (currentTab !== 'scan') stopCameraScanner();

  // Metrics & Badges Update
  const metrics = await dbFetchDashboardMetrics();
  const alertCount = metrics.lowStockCount + metrics.outOfStockCount;

  const headerAlertBadge = document.getElementById('headerAlertBadge');
  const sidebarLowBadge = document.getElementById('sidebarLowBadge');
  const sidebarOutBadge = document.getElementById('sidebarOutBadge');
  const bottomLowBadge = document.getElementById('bottomLowBadge');

  if (headerAlertBadge) headerAlertBadge.textContent = alertCount;
  if (sidebarLowBadge) sidebarLowBadge.textContent = metrics.lowStockCount;
  if (sidebarOutBadge) sidebarOutBadge.textContent = metrics.outOfStockCount;
  if (bottomLowBadge) bottomLowBadge.textContent = metrics.lowStockCount;

  // View Switching
  document.querySelectorAll('.view-pane').forEach((p) => (p.style.display = 'none'));

  if (currentTab === 'dashboard') {
    document.getElementById('viewDashboard').style.display = 'block';
    await renderDashboardView(metrics);
  } else if (currentTab === 'inventory') {
    document.getElementById('viewInventory').style.display = 'block';
    await renderInventoryView();
  } else if (currentTab === 'scan') {
    document.getElementById('viewScan').style.display = 'block';
    // Focus search input
    setTimeout(() => document.getElementById('scanInput').focus(), 100);
  } else if (currentTab === 'categories') {
    document.getElementById('viewCategories').style.display = 'block';
    await renderCategoriesView();
  } else if (currentTab === 'category-detail') {
    document.getElementById('viewCategoryDetail').style.display = 'block';
    await renderCategoryDetailView(currentCategoryDetailId);
  } else if (currentTab === 'sales') {
    document.getElementById('viewSales').style.display = 'block';
    await renderSalesHubView();
  } else if (currentTab === 'new-sale') {
    document.getElementById('viewNewSale').style.display = 'block';
    await renderNewSaleView();
  } else if (currentTab === 'sales-history') {
    document.getElementById('viewSalesHistory').style.display = 'block';
    await renderSalesHistoryView();
  } else if (currentTab === 'sale-detail') {
    document.getElementById('viewSaleDetails').style.display = 'block';
    await renderSaleDetailView(currentViewingSaleId);
  } else if (currentTab === 'low-stock') {
    document.getElementById('viewLowStock').style.display = 'block';
    await renderLowStockView();
  } else if (currentTab === 'out-of-stock') {
    document.getElementById('viewOutOfStock').style.display = 'block';
    await renderOutOfStockView();
  } else if (currentTab === 'raw-materials') {
    document.getElementById('viewRawMaterials').style.display = 'block';
    await renderRawMaterialsView();
  } else if (currentTab === 'settings') {
    document.getElementById('viewSettings').style.display = 'block';
    await renderSettingsView(metrics.lowStockThreshold);
  }
}

// --- BARCODE PROCESSING & CAMERA SCANNER ---

async function processScannedBarcode(barcode) {
  if (!barcode || !barcode.trim()) return;
  const code = barcode.trim();

  // Record in recent scans history
  if (!recentScans.includes(code)) {
    recentScans.unshift(code);
    if (recentScans.length > 5) recentScans.pop();
    renderRecentScans();
  }

  // Switch tab to scan view if not active
  if (currentTab !== 'scan') {
    currentTab = 'scan';
    updateNavActiveState();
    await loadCurrentView();
  }

  document.getElementById('scanInput').value = code;

  // Lookup in DB
  const item = await dbFetchItemByBarcode(code);
  renderScanView(code, item);
}

function renderScanView(scannedCode, item) {
  const container = document.getElementById('scanResultContainer');

  if (!scannedCode) {
    container.innerHTML = `
      <div class="section-box" style="padding: 40px; text-align: center; border: 2px dashed var(--color-border);">
        <p style="font-size: 14px; font-weight: 700; color: var(--color-muted);">
          Scan a product barcode to view stock, update inventory, or add a new item.
        </p>
      </div>
    `;
    return;
  }

  if (item) {
    // PRODUCT FOUND
    dbFetchSettings().then((settings) => {
      const st = getStockStatus(item.quantity, settings.low_stock_threshold);
      container.innerHTML = `
        <div class="product-found-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <span class="category-pill">${item.category_name || 'Category'}</span>
              <h2 style="font-size: 22px; font-weight: 900; color: var(--color-black); margin-top: 2px;">${item.name}</h2>
              <p style="font-size: 12px; font-family: monospace; font-weight: 700; color: var(--color-muted); margin-top: 2px;">
                Barcode: <strong>${item.barcode}</strong>
              </p>
            </div>
            <span class="status-badge ${st.badgeClass}">${st.label}</span>
          </div>

          <div class="card-meta" style="grid-template-columns: repeat(3, 1fr); padding: 16px; margin: 16px 0; background-color: var(--color-light-bg);">
            <div>
              <span style="color: var(--color-muted); display: block; font-size: 11px; text-transform: uppercase;">Stock Quantity</span>
              <strong style="font-size: 26px; font-weight: 900; color: ${item.quantity === 0 || (item.quantity !== null && item.quantity <= settings.low_stock_threshold) ? 'var(--color-red)' : 'var(--color-black)'};">
                ${item.quantity !== null && item.quantity !== undefined ? item.quantity + ' PCS' : 'NO DATA'}
              </strong>
            </div>
            <div>
              <span style="color: var(--color-muted); display: block; font-size: 11px; text-transform: uppercase;">Cost Rate (Selling)</span>
              <strong style="font-size: 15px; color: var(--color-red); font-weight: 800;">${item.cost_rate !== null && item.cost_rate !== undefined && item.cost_rate !== '' ? 'LKR ' + Number(item.cost_rate).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</strong>
            </div>
            <div>
              <span style="color: var(--color-muted); display: block; font-size: 11px; text-transform: uppercase;">Retail Rate (Shop)</span>
              <strong style="font-size: 15px;">${item.retail_rate !== null && item.retail_rate !== undefined ? 'LKR ' + Number(item.retail_rate).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</strong>
            </div>
          </div>

          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button type="button" class="btn-primary" style="flex: 2; font-weight: 800;" onclick="quickSellItem('${item.id}')" ${item.quantity === 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>🛒 SELL ITEM</button>
            <button type="button" class="btn-dark" style="flex: 1.5;" onclick="openStockUpdateModal('${item.id}')">⚡ Stock</button>
            <button type="button" class="btn-secondary" style="flex: 1;" onclick="openItemDetailModal('${item.id}')">👁️ Details</button>
            <button type="button" class="btn-secondary" style="flex: 1;" onclick="openEditItemModal('${item.id}')">✏️ Edit</button>
          </div>
        </div>
      `;
    });
  } else {
    // BARCODE NOT FOUND -> NEW BARCODE DETECTED WORKFLOW
    container.innerHTML = `
      <div class="new-barcode-detected-card">
        <div style="font-size: 32px; margin-bottom: 8px;">📷</div>
        <h2 style="font-size: 20px; font-weight: 900; color: var(--color-red); margin-bottom: 4px;">NEW BARCODE DETECTED</h2>
        <p style="font-size: 14px; font-family: monospace; font-weight: 800; color: var(--color-black); margin-bottom: 16px;">
          Barcode: <strong>${scannedCode}</strong>
        </p>

        <p style="font-size: 12px; color: var(--color-muted); max-width: 320px; margin: 0 auto 20px auto;">
          This barcode is not currently assigned to any stationery item in your database.
        </p>

        <button type="button" class="btn-primary" style="width: 100%; max-width: 300px; padding: 12px 20px; font-size: 14px;" onclick="openAddItemWithBarcode('${scannedCode}')">
          + ADD AS NEW ITEM
        </button>
      </div>
    `;
  }
}

function renderRecentScans() {
  const container = document.getElementById('recentScansList');
  if (!container) return;

  if (recentScans.length === 0) {
    container.innerHTML = '<p style="font-size: 12px; color: var(--color-muted);">No recent scans in this session.</p>';
    return;
  }

  container.innerHTML = recentScans
    .map(
      (code) => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background-color: var(--color-light-bg); border-radius: var(--radius-sm); border: 1px solid var(--color-border); font-size: 13px;">
        <span style="font-family: monospace; font-weight: 800;">${code}</span>
        <button type="button" class="btn-secondary" style="padding: 4px 10px; min-height: 28px; font-size: 11px;" onclick="processScannedBarcode('${code}')">Scan →</button>
      </div>
    `
    )
    .join('');
}

function toggleCameraScanner() {
  if (isCameraActive) {
    stopCameraScanner();
  } else {
    startCameraScanner();
  }
}

function startCameraScanner() {
  const wrapper = document.getElementById('cameraViewportWrapper');
  if (!wrapper) return;
  wrapper.style.display = 'block';

  if (!window.Html5Qrcode) {
    showToast('Camera scanner library loading... please try again.', 'error');
    return;
  }

  try {
    if (!html5QrcodeScanner) {
      html5QrcodeScanner = new Html5Qrcode('scannerViewfinder');
    }

    html5QrcodeScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      async (decodedText) => {
        showToast(`Scanned: ${decodedText}`);
        stopCameraScanner();
        await processScannedBarcode(decodedText);
      },
      (err) => {}
    ).then(() => {
      isCameraActive = true;
      document.getElementById('startCameraBtn').textContent = '⏹️ Stop Camera';
    }).catch((e) => {
      console.warn('Camera access error', e);
      showToast('Unable to access camera. Please check browser permissions.', 'error');
      wrapper.style.display = 'none';
    });
  } catch (e) {
    console.error('Camera scanner exception', e);
  }
}

function stopCameraScanner() {
  const wrapper = document.getElementById('cameraViewportWrapper');
  if (wrapper) wrapper.style.display = 'none';

  if (html5QrcodeScanner && isCameraActive) {
    try {
      html5QrcodeScanner.stop().then(() => {
        isCameraActive = false;
        const btn = document.getElementById('startCameraBtn');
        if (btn) btn.textContent = '📷 Toggle Camera Scanner';
      });
    } catch (e) {
      isCameraActive = false;
    }
  }
}

// --- RENDER VIEWS ---

async function renderDashboardView(metrics) {
  document.getElementById('metricTotalItems').textContent = metrics.totalItems;
  document.getElementById('metricInStock').textContent = metrics.inStockCount;
  document.getElementById('metricLowStock').textContent = metrics.lowStockCount;
  document.getElementById('metricOutOfStock').textContent = metrics.outOfStockCount;

  // Low Stock Urgent List
  const lowItems = await dbFetchLowStockItems();
  const lowCards = document.getElementById('dashboardLowStockContainer');
  const lowTable = document.getElementById('dashboardLowStockTableBody');

  if (lowItems.length === 0) {
    lowCards.innerHTML = `
      <div style="padding: 24px; text-align: center; background-color: var(--color-emerald-bg); border: 1px solid #a7f3d0; border-radius: 12px; color: var(--color-emerald); font-weight: 800; font-size: 13px;">
        ✓ ALL STOCK LEVELS ARE HEALTHY. NO ITEMS ARE CURRENTLY LOW IN STOCK.
      </div>
    `;
    if (lowTable) lowTable.innerHTML = '';
  } else {
    lowCards.innerHTML = lowItems.map((i) => renderCardHTML(i, metrics.lowStockThreshold)).join('');
    if (lowTable) lowTable.innerHTML = lowItems.map((i) => renderTableRowHTML(i, metrics.lowStockThreshold)).join('');
  }

  // Out of Stock List
  const outItems = await dbFetchOutOfStockItems();
  const outCards = document.getElementById('dashboardOutContainer');
  const outTable = document.getElementById('dashboardOutTableBody');

  if (outItems.length === 0) {
    outCards.innerHTML = `
      <div style="padding: 16px; text-align: center; background-color: var(--color-light-bg); border-radius: 8px; color: var(--color-muted); font-size: 12px; font-weight: 700;">
        NO ITEMS ARE CURRENTLY OUT OF STOCK.
      </div>
    `;
    if (outTable) outTable.innerHTML = '';
  } else {
    outCards.innerHTML = outItems.map((i) => renderCardHTML(i, metrics.lowStockThreshold)).join('');
    if (outTable) outTable.innerHTML = outItems.map((i) => renderTableRowHTML(i, metrics.lowStockThreshold)).join('');
  }
}

async function renderInventoryView() {
  const categories = await dbFetchCategories();
  const settings = await dbFetchSettings();
  const threshold = settings.low_stock_threshold;

  const catSelect = document.getElementById('invCatSelect');
  if (catSelect) {
    catSelect.innerHTML = `<option value="all">All Categories (${categories.length})</option>` +
      categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  const searchInput = document.getElementById('invSearchInput');
  const statusSelect = document.getElementById('invStatusSelect');
  const sortSelect = document.getElementById('invSortSelect');

  if (searchInput) searchInput.value = currentSearch;
  if (catSelect) catSelect.value = currentCategoryFilter;
  if (statusSelect) statusSelect.value = currentStatusFilter;
  if (sortSelect) sortSelect.value = currentSortField;

  if (searchInput) searchInput.oninput = (e) => { currentSearch = e.target.value; renderInventoryView(); };
  if (catSelect) catSelect.onchange = (e) => { currentCategoryFilter = e.target.value; renderInventoryView(); };
  if (statusSelect) statusSelect.onchange = (e) => { currentStatusFilter = e.target.value; renderInventoryView(); };
  if (sortSelect) sortSelect.onchange = (e) => { currentSortField = e.target.value; renderInventoryView(); };

  const items = await dbFetchFilteredItems(
    { searchQuery: currentSearch, categoryId: currentCategoryFilter, status: currentStatusFilter },
    currentSortField
  );

  document.getElementById('inventoryCountBadge').textContent = `${items.length} Items`;

  const cardsContainer = document.getElementById('inventoryCardsContainer');
  const tableBody = document.getElementById('inventoryTableBody');

  if (items.length === 0) {
    cardsContainer.innerHTML = `
      <div style="padding: 40px; text-align: center; background: var(--color-card-bg); border-radius: 16px; border: 1px solid var(--color-border); grid-column: span 2;">
        <h3 style="font-size: 16px; font-weight: 800; margin-bottom: 4px;">No inventory items found</h3>
        <p style="font-size: 12px; color: var(--color-muted); margin-bottom: 16px;">Create a new item or adjust your search filters.</p>
        <button type="button" class="btn-primary" onclick="openAddItemModal()">+ ADD ITEM</button>
      </div>
    `;
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 32px;">No items match your criteria.</td></tr>';
  } else {
    cardsContainer.innerHTML = items.map((i) => renderCardHTML(i, threshold)).join('');
    if (tableBody) tableBody.innerHTML = items.map((i) => renderTableRowHTML(i, threshold)).join('');
  }
}

async function renderCategoriesView() {
  const categories = await dbFetchCategories();
  const grid = document.getElementById('categoriesGrid');

  if (categories.length === 0) {
    grid.innerHTML = `
      <div style="padding: 40px; text-align: center; background: var(--color-card-bg); border-radius: 16px; border: 1px solid var(--color-border); grid-column: span 3;">
        <h3 style="font-size: 16px; font-weight: 800;">No categories yet</h3>
        <button type="button" class="btn-primary" style="margin-top: 12px;" onclick="openAddCategoryModal()">+ ADD CATEGORY</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = categories
    .map((cat) => {
      const hasLow = cat.low_stock_count > 0;
      const hasOut = cat.out_of_stock_count > 0;

      return `
        <div class="inventory-card ${hasOut || hasLow ? 'is-low' : ''}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="font-size: 24px;">📘</div>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn-icon" title="Edit Category" onclick="openEditCategoryModal('${cat.id}', '${cat.name.replace(/'/g, "\\'")}')">✏️</button>
              <button type="button" class="btn-icon btn-danger-icon" title="Delete Category" onclick="handleDeleteCategory('${cat.id}', '${cat.name.replace(/'/g, "\\'")}')">🗑️</button>
            </div>
          </div>

          <h3 style="font-size: 18px; font-weight: 900; margin-top: 10px;">${cat.name}</h3>
          <p style="font-size: 12px; font-weight: 700; color: var(--color-muted); margin-top: 2px;">${cat.item_count} Items in category</p>
          
          <div style="display: flex; gap: 6px; margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--color-border);">
            ${hasLow ? `<span class="status-badge badge-low-stock">⚠️ ${cat.low_stock_count} Low</span>` : '<span class="status-badge badge-in-stock">Healthy</span>'}
            ${hasOut ? `<span class="status-badge badge-out-of-stock">🚫 ${cat.out_of_stock_count} Out</span>` : ''}
          </div>

          <button type="button" class="btn-secondary" style="width: 100%; margin-top: 12px; justify-content: center;" onclick="viewCategoryDetail('${cat.id}')">
            View Category Items →
          </button>
        </div>
      `;
    })
    .join('');
}

async function viewCategoryDetail(catId) {
  currentCategoryDetailId = catId;
  currentTab = 'category-detail';
  updateNavActiveState();
  await loadCurrentView();
}

async function renderCategoryDetailView(catId) {
  const categories = await dbFetchCategories();
  const cat = categories.find((c) => c.id === catId);
  const settings = await dbFetchSettings();
  const threshold = settings.low_stock_threshold;

  if (!cat) {
    currentTab = 'categories';
    await loadCurrentView();
    return;
  }

  document.getElementById('catDetailTitle').textContent = cat.name;
  document.getElementById('catDetailItemsCount').textContent = `${cat.item_count} Configured Items`;

  const items = await dbFetchFilteredItems({ categoryId: catId });

  const container = document.getElementById('catDetailCardsContainer');
  const table = document.getElementById('catDetailTableBody');

  if (items.length === 0) {
    container.innerHTML = `
      <div style="padding: 32px; text-align: center; background: var(--color-card-bg); border-radius: 12px; border: 1px solid var(--color-border);">
        <p style="font-size: 13px; color: var(--color-muted); font-weight: 700;">No items inside this category yet.</p>
        <button type="button" class="btn-primary" style="margin-top: 12px;" onclick="openAddItemModal('${cat.id}')">+ ADD ITEM TO ${cat.name.toUpperCase()}</button>
      </div>
    `;
    if (table) table.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 24px;">No items in this category.</td></tr>';
  } else {
    container.innerHTML = items.map((i) => renderCardHTML(i, threshold)).join('');
    if (table) table.innerHTML = items.map((i) => renderTableRowHTML(i, threshold)).join('');
  }
}

async function renderLowStockView() {
  const items = await dbFetchLowStockItems();
  const settings = await dbFetchSettings();
  const threshold = settings.low_stock_threshold;

  document.getElementById('lowStockPageCount').textContent = `${items.length} Low Stock Items`;

  const container = document.getElementById('lowStockCardsContainer');
  const table = document.getElementById('lowStockTableBody');

  if (items.length === 0) {
    container.innerHTML = `
      <div style="padding: 40px; text-align: center; background: var(--color-card-bg); border-radius: 16px; border: 1px solid var(--color-border);">
        <h3 style="font-size: 16px; font-weight: 800; color: var(--color-emerald);">✓ All stock levels are healthy!</h3>
        <p style="font-size: 12px; color: var(--color-muted); margin-top: 4px;">No items are currently equal to or below the low stock threshold (${threshold}).</p>
      </div>
    `;
    if (table) table.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 24px;">No low stock items.</td></tr>';
  } else {
    container.innerHTML = items.map((i) => renderCardHTML(i, threshold)).join('');
    if (table) table.innerHTML = items.map((i) => renderTableRowHTML(i, threshold)).join('');
  }
}

async function renderOutOfStockView() {
  const items = await dbFetchOutOfStockItems();
  const settings = await dbFetchSettings();
  const threshold = settings.low_stock_threshold;

  document.getElementById('outOfStockPageCount').textContent = `${items.length} Out of Stock Items`;

  const container = document.getElementById('outOfStockCardsContainer');
  const table = document.getElementById('outOfStockTableBody');

  if (items.length === 0) {
    container.innerHTML = `
      <div style="padding: 40px; text-align: center; background: var(--color-card-bg); border-radius: 16px; border: 1px solid var(--color-border);">
        <h3 style="font-size: 16px; font-weight: 800;">No items are currently out of stock</h3>
        <p style="font-size: 12px; color: var(--color-muted); margin-top: 4px;">Zero quantity items will appear here automatically.</p>
      </div>
    `;
    if (table) table.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 24px;">No out of stock items.</td></tr>';
  } else {
    container.innerHTML = items.map((i) => renderCardHTML(i, threshold)).join('');
    if (table) table.innerHTML = items.map((i) => renderTableRowHTML(i, threshold)).join('');
  }
}

async function renderSettingsView(threshold) {
  const input = document.getElementById('thresholdInput');
  if (input) input.value = threshold;
}

// --- CARD & TABLE ROW HTML RENDERERS ---

function renderCardHTML(item, threshold) {
  const st = getStockStatus(item.quantity, threshold);
  const isLowOrOut = st.state === 'low-stock' || st.state === 'out-of-stock';
  const isOut = item.quantity === 0;

  const reamCostFormatted = item.ream_cost !== null && item.ream_cost !== undefined && item.ream_cost !== '' 
    ? (isNaN(Number(item.ream_cost)) ? item.ream_cost : 'LKR ' + Number(item.ream_cost).toLocaleString('en-US', { minimumFractionDigits: 2 }))
    : '—';
  const costRateVal = item.cost_rate !== null && item.cost_rate !== undefined && item.cost_rate !== '' ? item.cost_rate : null;
  const costRateFormatted = costRateVal !== null && costRateVal !== undefined && costRateVal !== '' && !isNaN(Number(costRateVal))
    ? 'LKR ' + Number(costRateVal).toLocaleString('en-US', { minimumFractionDigits: 2 }) 
    : '—';
  const retailRateFormatted = item.retail_rate !== null && item.retail_rate !== undefined && item.retail_rate !== '' 
    ? 'LKR ' + Number(item.retail_rate).toLocaleString('en-US', { minimumFractionDigits: 2 }) 
    : '—';

  return `
    <div class="inventory-card ${isLowOrOut ? 'is-low' : ''}">
      <div class="card-top">
        <div>
          <span class="category-pill">${escapeHtml(item.category_name || 'Category')}</span>
          <h3 class="item-title">${escapeHtml(item.name)}</h3>
          ${item.barcode ? `<div style="font-size: 11px; font-family: monospace; color: var(--color-muted);">Barcode: <strong>${escapeHtml(item.barcode)}</strong></div>` : ''}
        </div>
        <span class="status-badge ${st.badgeClass}">${st.label}</span>
      </div>

      <div class="card-meta" style="grid-template-columns: repeat(3, 1fr); padding: 12px; margin: 12px 0;">
        <div>
          <span style="color: var(--color-muted); display: block; font-size: 10px; text-transform: uppercase;">Ream Cost</span>
          <strong style="font-size: 13px;">${reamCostFormatted}</strong>
        </div>
        <div>
          <span style="color: var(--color-muted); display: block; font-size: 10px; text-transform: uppercase;">Cost Rate (Sell)</span>
          <strong style="color: var(--color-red); font-size: 13px;">${costRateFormatted}</strong>
        </div>
        <div>
          <span style="color: var(--color-muted); display: block; font-size: 10px; text-transform: uppercase;">Retail Rate (Shop)</span>
          <strong style="font-size: 13px;">${retailRateFormatted}</strong>
        </div>
      </div>

      <div class="card-bottom" style="flex-wrap: wrap; gap: 8px;">
        <div style="font-size: 13px;">
          <span style="color: var(--color-muted);">Qty:</span>
          <strong style="font-size: 18px; font-weight: 900; color: ${isLowOrOut ? 'var(--color-red)' : 'var(--color-black)'};">
            ${item.quantity !== null && item.quantity !== undefined ? item.quantity + ' PCS' : 'NO DATA'}
          </strong>
        </div>

        <div style="display: flex; gap: 6px; flex: 1; justify-content: flex-end; flex-wrap: wrap;">
          <button type="button" class="btn-primary" style="padding: 6px 12px; font-size: 12px; font-weight: 800;" onclick="quickSellItem('${item.id}')" ${isOut ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
            🛒 Sell
          </button>
          <button type="button" class="btn-dark" style="padding: 6px 10px; font-size: 12px;" onclick="openStockUpdateModal('${item.id}')">⚡ Stock</button>
          <button type="button" class="btn-secondary" style="padding: 6px 10px; font-size: 12px;" onclick="openEditItemModal('${item.id}')">✏️ Edit</button>
          <button type="button" class="btn-icon btn-danger-icon" style="padding: 6px 10px; font-size: 12px; min-width: 34px;" title="Delete Item" onclick="handleDeleteItem('${item.id}', '${item.name.replace(/'/g, "\\'")}')">🗑️</button>
        </div>
      </div>
    </div>
  `;
}

function renderTableRowHTML(item, threshold) {
  const st = getStockStatus(item.quantity, threshold);
  const isLowOrOut = st.state === 'low-stock' || st.state === 'out-of-stock';
  const isOut = item.quantity === 0;

  const reamCostFormatted = item.ream_cost !== null && item.ream_cost !== undefined && item.ream_cost !== '' 
    ? (isNaN(Number(item.ream_cost)) ? item.ream_cost : 'LKR ' + Number(item.ream_cost).toLocaleString('en-US', { minimumFractionDigits: 2 }))
    : '—';
  const costRateVal = item.cost_rate !== null && item.cost_rate !== undefined && item.cost_rate !== '' ? item.cost_rate : null;
  const costRateFormatted = costRateVal !== null && costRateVal !== undefined && costRateVal !== '' && !isNaN(Number(costRateVal))
    ? 'LKR ' + Number(costRateVal).toLocaleString('en-US', { minimumFractionDigits: 2 }) 
    : '—';
  const retailRateFormatted = item.retail_rate !== null && item.retail_rate !== undefined && item.retail_rate !== '' 
    ? 'LKR ' + Number(item.retail_rate).toLocaleString('en-US', { minimumFractionDigits: 2 }) 
    : '—';

  return `
    <tr class="${isLowOrOut ? 'is-low-row' : ''}">
      <td><span class="category-pill">${escapeHtml(item.category_name || 'Category')}</span></td>
      <td style="font-weight: 900;">${escapeHtml(item.name)}</td>
      <td style="font-family: monospace; font-size: 12px;">${item.barcode ? escapeHtml(item.barcode) : '—'}</td>
      <td style="text-align: right; font-weight: 600;">${reamCostFormatted}</td>
      <td style="text-align: right; font-weight: 800; color: var(--color-red);">${costRateFormatted}</td>
      <td style="text-align: right;">${retailRateFormatted}</td>
      <td style="text-align: center; font-size: 16px; font-weight: 900; color: ${isLowOrOut ? 'var(--color-red)' : 'var(--color-black)'};">
        ${item.quantity !== null && item.quantity !== undefined ? item.quantity + ' PCS' : 'NO DATA'}
      </td>
      <td style="text-align: center; color: var(--color-muted);">${threshold}</td>
      <td style="text-align: center;"><span class="status-badge ${st.badgeClass}">${st.label}</span></td>
      <td style="text-align: center;">
        <div class="table-action-group" style="justify-content: center; gap: 4px;">
          <button type="button" class="btn-primary" style="padding: 5px 12px; font-size: 11px; font-weight: 800; border-radius: var(--radius-sm);" title="Sell Item" onclick="quickSellItem('${item.id}')" ${isOut ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
            🛒 Sell
          </button>
          <button type="button" class="btn-icon" title="Update Stock" onclick="openStockUpdateModal('${item.id}')">⚡</button>
          <button type="button" class="btn-icon" title="Item Details" onclick="openItemDetailModal('${item.id}')">👁️</button>
          <button type="button" class="btn-icon" title="Edit Item" onclick="openEditItemModal('${item.id}')">✏️</button>
          <button type="button" class="btn-icon btn-danger-icon" title="Delete Item" onclick="handleDeleteItem('${item.id}', '${item.name.replace(/'/g, "\\'")}')">🗑️</button>
        </div>
      </td>
    </tr>
  `;
}

// --- MODAL & ACTION HANDLERS ---

async function openAddItemModal(defaultCatId = null) {
  editingItemId = null;
  document.getElementById('addItemModalTitle').textContent = '+ ADD NEW INVENTORY ITEM';
  document.getElementById('itemFormName').value = '';
  document.getElementById('itemFormBarcode').value = '';
  if (document.getElementById('itemFormReamCost')) document.getElementById('itemFormReamCost').value = '';
  document.getElementById('itemFormCost').value = '';
  document.getElementById('itemFormRate').value = '';
  document.getElementById('itemFormQty').value = '';

  const categories = await dbFetchCategories();
  const select = document.getElementById('itemFormCategory');
  select.innerHTML = categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');

  if (defaultCatId) select.value = defaultCatId;
  document.getElementById('addItemModalOverlay').style.display = 'flex';
}

async function openAddItemWithBarcode(prefilledBarcode) {
  await openAddItemModal();
  if (prefilledBarcode) {
    document.getElementById('itemFormBarcode').value = prefilledBarcode;
  }
}

async function openEditItemModal(itemId) {
  const item = await dbFetchItemById(itemId);
  if (!item) return;

  editingItemId = item.id;
  document.getElementById('addItemModalTitle').textContent = `EDIT ITEM: ${item.name}`;

  const categories = await dbFetchCategories();
  const select = document.getElementById('itemFormCategory');
  select.innerHTML = categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  select.value = item.category_id;

  document.getElementById('itemFormName').value = item.name;
  document.getElementById('itemFormBarcode').value = item.barcode || '';
  if (document.getElementById('itemFormReamCost')) document.getElementById('itemFormReamCost').value = item.ream_cost !== null && item.ream_cost !== undefined ? item.ream_cost : '';
  const costRateVal = item.cost_rate !== null && item.cost_rate !== undefined ? item.cost_rate : '';
  document.getElementById('itemFormCost').value = costRateVal !== null && costRateVal !== undefined ? costRateVal : '';
  document.getElementById('itemFormRate').value = item.retail_rate !== null && item.retail_rate !== undefined ? item.retail_rate : '';
  document.getElementById('itemFormQty').value = item.quantity !== null && item.quantity !== undefined ? item.quantity : '';

  document.getElementById('addItemModalOverlay').style.display = 'flex';
}

async function handleSaveItemForm() {
  const catId = document.getElementById('itemFormCategory').value;
  const nameVal = document.getElementById('itemFormName').value.trim();
  const barcodeVal = document.getElementById('itemFormBarcode').value.trim();
  const reamCostVal = document.getElementById('itemFormReamCost') ? document.getElementById('itemFormReamCost').value.trim() : '';
  const costVal = document.getElementById('itemFormCost').value.trim();
  const rateVal = document.getElementById('itemFormRate').value.trim();
  const qtyVal = document.getElementById('itemFormQty').value.trim();

  let parsedReamCost = null;
  if (reamCostVal !== '') {
    parsedReamCost = isNaN(parseFloat(reamCostVal)) ? reamCostVal : parseFloat(reamCostVal);
  }

  let parsedCost = null;
  if (costVal !== '') {
    parsedCost = parseFloat(costVal);
    if (isNaN(parsedCost) || parsedCost < 0) return showToast('Cost Rate must be a non-negative number.', 'error');
  }

  let parsedRate = null;
  if (rateVal !== '') {
    parsedRate = parseFloat(rateVal);
    if (isNaN(parsedRate) || parsedRate < 0) return showToast('Retail Rate must be a non-negative number.', 'error');
  }

  let parsedQty = null;
  if (qtyVal !== '') {
    if (!/^\d+$/.test(qtyVal)) return showToast('Quantity must be a non-negative whole number.', 'error');
    parsedQty = parseInt(qtyVal, 10);
  }

  try {
    if (editingItemId) {
      await dbUpdateInventoryItem(editingItemId, {
        category_id: catId,
        name: nameVal,
        barcode: barcodeVal,
        ream_cost: parsedReamCost,
        cost_rate: parsedCost,
        retail_rate: parsedRate,
        quantity: parsedQty,
      });
      showToast('Inventory item updated successfully.');
    } else {
      await dbAddItem({
        category_id: catId,
        name: nameVal,
        barcode: barcodeVal,
        ream_cost: parsedReamCost,
        cost_rate: parsedCost,
        retail_rate: parsedRate,
        quantity: parsedQty,
      });
      showToast('New inventory item added successfully.');
    }

    document.getElementById('addItemModalOverlay').style.display = 'none';
    editingItemId = null;
    await loadCurrentView();
  } catch (err) {
    showToast(err.message || 'Error saving item.', 'error');
  }
}

// --- STOCK UPDATE & MOVEMENT MODAL ---

function selectMovementType(type) {
  selectedMovementType = type;
  document.getElementById('pillStockIn').className = type === 'STOCK_IN' ? 'type-pill active-in' : 'type-pill';
  document.getElementById('pillStockOut').className = type === 'STOCK_OUT' ? 'type-pill active-out' : 'type-pill';
  document.getElementById('pillStockAdjust').className = type === 'STOCK_ADJUSTMENT' ? 'type-pill active-adjust' : 'type-pill';

  const labelMap = {
    STOCK_IN: 'Quantity to Add (+ PCS)',
    STOCK_OUT: 'Quantity to Remove (- PCS)',
    STOCK_ADJUSTMENT: 'New Set Quantity (= PCS)',
  };
  document.getElementById('stockUpdateQtyLabel').textContent = labelMap[type];
}

async function openStockUpdateModal(itemId) {
  const item = await dbFetchItemById(itemId);
  if (!item) return;

  editingItemId = item.id;
  document.getElementById('stockUpdateTitle').textContent = item.name;
  document.getElementById('stockUpdateCategory').textContent = item.category_name || 'Category';
  document.getElementById('stockUpdateCurrentQty').textContent = item.quantity !== null && item.quantity !== undefined ? item.quantity + ' PCS' : 'NO DATA';

  document.getElementById('stockUpdateQtyInput').value = '';
  document.getElementById('stockUpdateReasonInput').value = '';
  selectMovementType('STOCK_IN');

  document.getElementById('stockUpdateModalOverlay').style.display = 'flex';
}

async function handleSaveStockUpdate() {
  if (!editingItemId) return;
  const qtyVal = document.getElementById('stockUpdateQtyInput').value.trim();
  const reasonVal = document.getElementById('stockUpdateReasonInput').value.trim();

  if (!qtyVal || !/^\d+$/.test(qtyVal)) {
    return showToast('Quantity must be a valid whole number.', 'error');
  }

  const delta = parseInt(qtyVal, 10);
  try {
    await dbRecordStockMovement(editingItemId, selectedMovementType, delta, reasonVal || 'Stock Update');
    document.getElementById('stockUpdateModalOverlay').style.display = 'none';
    editingItemId = null;
    showToast('Stock quantity updated successfully.');
    await loadCurrentView();
  } catch (e) {
    showToast(e.message || 'Error updating stock.', 'error');
  }
}

async function openItemDetailModal(itemId) {
  const item = await dbFetchItemById(itemId);
  if (!item) return;

  const settings = await dbFetchSettings();
  const st = getStockStatus(item.quantity, settings.low_stock_threshold);

  document.getElementById('detailItemName').textContent = item.name;
  document.getElementById('detailCategory').textContent = item.category_name || 'Category';
  document.getElementById('detailBarcode').textContent = item.barcode || 'Not set';
  document.getElementById('detailStatusBadge').className = `status-badge ${st.badgeClass}`;
  document.getElementById('detailStatusBadge').textContent = st.label;

  document.getElementById('detailQty').textContent = item.quantity !== null && item.quantity !== undefined ? item.quantity + ' PCS' : 'NO DATA';
  document.getElementById('detailReamCost').textContent = item.ream_cost !== null && item.ream_cost !== undefined && item.ream_cost !== '' ? (isNaN(Number(item.ream_cost)) ? item.ream_cost : 'LKR ' + Number(item.ream_cost).toLocaleString('en-US', { minimumFractionDigits: 2 })) : 'Not Set';
  const costRateVal = item.cost_rate !== null && item.cost_rate !== undefined && item.cost_rate !== '' ? item.cost_rate : null;
  if (document.getElementById('detailCostRate')) {
    document.getElementById('detailCostRate').textContent = costRateVal !== null && costRateVal !== undefined && costRateVal !== '' && !isNaN(Number(costRateVal)) ? 'LKR ' + Number(costRateVal).toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'Not Set';
  }
  document.getElementById('detailRetailRate').textContent = item.retail_rate !== null && item.retail_rate !== undefined ? 'LKR ' + Number(item.retail_rate).toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'Not Set';

  // Render recent movements log for item
  const movements = await dbFetchItemMovements(itemId);
  const logContainer = document.getElementById('detailMovementsLog');
  if (movements.length === 0) {
    logContainer.innerHTML = '<p style="color: var(--color-muted);">No stock movements recorded yet.</p>';
  } else {
    logContainer.innerHTML = movements.slice(0, 5).map((m) => `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px border-neutral-100;">
        <span><strong>${m.movement_type}</strong> (${m.reason})</span>
        <span style="font-weight: 800;">${m.previous_quantity} → ${m.new_quantity} PCS</span>
      </div>
    `).join('');
  }

  const sellBtn = document.getElementById('detailSellBtn');
  if (sellBtn) {
    sellBtn.disabled = item.quantity === 0;
    sellBtn.style.opacity = item.quantity === 0 ? '0.5' : '1';
    sellBtn.onclick = () => {
      document.getElementById('itemDetailModalOverlay').style.display = 'none';
      quickSellItem(item.id);
    };
  }

  document.getElementById('detailEditBtn').onclick = () => {
    document.getElementById('itemDetailModalOverlay').style.display = 'none';
    openEditItemModal(item.id);
  };

  document.getElementById('detailQtyBtn').onclick = () => {
    document.getElementById('itemDetailModalOverlay').style.display = 'none';
    openStockUpdateModal(item.id);
  };

  document.getElementById('detailDeleteBtn').onclick = () => {
    document.getElementById('itemDetailModalOverlay').style.display = 'none';
    handleDeleteItem(item.id, item.name);
  };

  document.getElementById('itemDetailModalOverlay').style.display = 'flex';
}

function handleDeleteItem(itemId, name) {
  showConfirmDialog(
    'Delete Inventory Item?',
    `Are you sure you want to delete "${name}"? This action cannot be undone.`,
    async () => {
      await dbDeleteInventoryItem(itemId);
      showToast(`Item "${name}" deleted successfully.`);
      await loadCurrentView();
    }
  );
}

// --- CATEGORY CRUD MODALS & ACTIONS ---

function openAddCategoryModal() {
  editingCategoryId = null;
  document.getElementById('addCategoryTitle').textContent = '+ ADD NEW CATEGORY';
  document.getElementById('categoryNameInput').value = '';
  document.getElementById('addCategoryModalOverlay').style.display = 'flex';
}

function openEditCategoryModal(catId, name) {
  editingCategoryId = catId;
  document.getElementById('addCategoryTitle').textContent = `RENAME CATEGORY: ${name}`;
  document.getElementById('categoryNameInput').value = name;
  document.getElementById('addCategoryModalOverlay').style.display = 'flex';
}

async function handleSaveCategoryForm() {
  const nameVal = document.getElementById('categoryNameInput').value.trim();
  if (!nameVal) return showToast('Category name is required.', 'error');

  try {
    if (editingCategoryId) {
      await dbUpdateCategory(editingCategoryId, nameVal);
      showToast('Category renamed successfully.');
    } else {
      await dbAddCategory(nameVal);
      showToast('New category created successfully.');
    }

    document.getElementById('addCategoryModalOverlay').style.display = 'none';
    editingCategoryId = null;
    await loadCurrentView();
  } catch (err) {
    showToast(err.message || 'Error saving category.', 'error');
  }
}

async function handleDeleteCategory(catId, name) {
  try {
    const items = await dbFetchAllItems();
    const assigned = items.filter((i) => i.category_id === catId);

    if (assigned.length > 0) {
      alert(`⚠️ Cannot delete category "${name}" because it currently contains ${assigned.length} active inventory item(s).\n\nPlease reassign or delete those items first.`);
      return;
    }

    showConfirmDialog(
      'Delete Category?',
      `Are you sure you want to delete category "${name}"?`,
      async () => {
        await dbDeleteCategory(catId);
        showToast(`Category "${name}" deleted.`);
        await loadCurrentView();
      }
    );
  } catch (err) {
    showToast(err.message || 'Unable to delete category.', 'error');
  }
}

async function handleResetData() {
  showConfirmDialog(
    'Reset All ERP Data?',
    'Reset all inventory items and categories to initial stationery seed data (126 items across 8 categories with barcodes)?',
    async () => {
      await dbResetSeedData();
      showToast('Database reset to initial 126 stationery seed items.');
      await loadCurrentView();
    }
  );
}

// --- SALES MANAGEMENT MODULE CONTROLLER ---

async function renderSalesHubView() {
  const summary = await dbFetchTodaySalesSummary();
  const sales = await dbFetchSales();

  const revEl = document.getElementById('salesHubTodayRevenue');
  const billsEl = document.getElementById('salesHubTodayBills');
  const totalBillsEl = document.getElementById('salesHubTotalBills');

  if (revEl) revEl.textContent = `LKR ${summary.todayRevenue.toFixed(2)}`;
  if (billsEl) billsEl.textContent = `${summary.todayBillCount} Bills Created Today`;
  if (totalBillsEl) totalBillsEl.textContent = summary.totalSalesCount;

  renderSalesTableRows(sales.slice(0, 10), 'salesHubTableBody', 'salesHubCardsContainer');
}

async function renderNewSaleView(reset = false) {
  if (reset || activeSaleLines.length === 0) {
    activeSaleLines = [];
  }

  const invoiceNum = await dbGenerateInvoiceNumber();
  const invEl = document.getElementById('newSaleInvoiceNum');
  if (invEl) invEl.value = invoiceNum;

  const dateEl = document.getElementById('newSaleDate');
  if (dateEl) dateEl.value = new Date().toLocaleString();

  renderSaleLinesTable();
}

function renderSaleLinesTable() {
  const tbody = document.getElementById('newSaleLinesTableBody');
  const mobileContainer = document.getElementById('newSaleMobileCardsContainer');
  const emptyMsg = document.getElementById('emptySaleLinesMessage');

  if (activeSaleLines.length === 0) {
    if (tbody) tbody.innerHTML = '';
    if (mobileContainer) mobileContainer.innerHTML = '';
    if (emptyMsg) emptyMsg.style.display = 'block';
    updateSaleSummaryTotals();
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';

  let tableHtml = '';
  let mobileHtml = '';

  activeSaleLines.forEach((line, index) => {
    const isOverStock = line.stockQty !== null && line.stockQty !== undefined && Number(line.quantity) > Number(line.stockQty);
    const lineSubtotal = line.sellingPrice * line.quantity;
    
    let lineDiscount = 0;
    if (line.discountType === 'percent') {
      lineDiscount = (lineSubtotal * (line.discountValue || 0)) / 100;
    } else {
      lineDiscount = line.discountValue || 0;
    }
    const lineTotal = Math.max(0, lineSubtotal - lineDiscount);

    line.lineSubtotal = lineSubtotal;
    line.lineTotal = lineTotal;

    // Desktop Row
    tableHtml += `
      <tr style="${isOverStock ? 'background-color: var(--color-red-light);' : ''}">
        <td>
          <strong style="font-size: 13px; display: block;">${escapeHtml(line.item_name_snapshot)}</strong>
          <span style="font-size: 11px; color: var(--color-muted);">${escapeHtml(line.categoryName || '')}</span>
          ${isOverStock ? `<div style="font-size: 11px; color: var(--color-red); font-weight: 800; margin-top: 2px;">⚠️ Insufficient Stock (Available: ${line.stockQty})</div>` : ''}
        </td>
        <td style="text-align: center;">
          <span class="status-badge ${line.stockQty === 0 ? 'badge-out-of-stock' : 'badge-in-stock'}">${line.stockQty !== null ? line.stockQty : '∞'}</span>
        </td>
        <td style="text-align: right; font-weight: 800; color: var(--color-red); font-size: 13px;">
          LKR ${line.sellingPrice.toFixed(2)}
        </td>
        <td style="text-align: center;">
          <input type="number" class="sale-qty-input" min="1" step="1" value="${line.quantity}" oninput="updateLineQty(${index}, this.value)">
        </td>
        <td style="text-align: right;">
          <div style="display: flex; gap: 4px;">
            <select class="form-input" style="padding: 4px; font-size: 11px; width: 65px;" onchange="updateLineDiscountType(${index}, this.value)">
              <option value="fixed" ${line.discountType === 'fixed' ? 'selected' : ''}>LKR</option>
              <option value="percent" ${line.discountType === 'percent' ? 'selected' : ''}>%</option>
            </select>
            <input type="number" class="sale-discount-input" min="0" step="0.01" value="${line.discountValue || 0}" oninput="updateLineDiscount(${index}, this.value)">
          </div>
        </td>
        <td style="text-align: right; font-weight: 900; color: var(--color-black);">
          LKR ${lineTotal.toFixed(2)}
        </td>
        <td style="text-align: center;">
          <button type="button" class="btn-danger-icon btn-icon" onclick="removeSaleLine(${index})" style="width: 28px; height: 28px; font-size: 12px;" title="Remove Line">✕</button>
        </td>
      </tr>
    `;

    // Mobile Card
    mobileHtml += `
      <div class="inventory-card" style="${isOverStock ? 'border: 2px solid var(--color-red-border); background-color: var(--color-red-light);' : ''}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div>
            <strong style="font-size: 14px; display: block; color: var(--color-black);">${escapeHtml(line.item_name_snapshot)}</strong>
            <span style="font-size: 11px; color: var(--color-muted);">${escapeHtml(line.categoryName || '')}</span>
          </div>
          <button type="button" class="btn-danger-icon btn-icon" onclick="removeSaleLine(${index})" style="width: 32px; height: 32px; font-size: 14px;" title="Remove Line">✕</button>
        </div>

        ${isOverStock ? `<div style="font-size: 11px; color: var(--color-red); font-weight: 800; margin-bottom: 8px;">⚠️ Insufficient Stock (Available: ${line.stockQty})</div>` : ''}

        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 10px; background-color: var(--color-light-bg); padding: 10px; border-radius: var(--radius-sm); font-size: 12px;">
          <div>
            <span style="color: var(--color-muted); display: block;">Cost Rate</span>
            <strong style="color: var(--color-red); font-size: 14px;">LKR ${line.sellingPrice.toFixed(2)}</strong>
          </div>
          <div>
            <span style="color: var(--color-muted); display: block;">Line Total</span>
            <strong style="font-size: 14px; color: var(--color-black);">LKR ${lineTotal.toFixed(2)}</strong>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 8px; margin-top: 10px;">
          <div>
            <label style="font-size: 11px; font-weight: 800; display: block; margin-bottom: 2px;">Qty (PCS)</label>
            <input type="number" class="sale-qty-input" min="1" step="1" value="${line.quantity}" oninput="updateLineQty(${index}, this.value)">
          </div>
          <div>
            <label style="font-size: 11px; font-weight: 800; display: block; margin-bottom: 2px;">Line Discount</label>
            <div style="display: flex; gap: 4px;">
              <select class="form-input" style="padding: 4px; font-size: 11px; width: 55px;" onchange="updateLineDiscountType(${index}, this.value)">
                <option value="fixed" ${line.discountType === 'fixed' ? 'selected' : ''}>LKR</option>
                <option value="percent" ${line.discountType === 'percent' ? 'selected' : ''}>%</option>
              </select>
              <input type="number" class="sale-discount-input" min="0" step="0.01" value="${line.discountValue || 0}" oninput="updateLineDiscount(${index}, this.value)">
            </div>
          </div>
        </div>
      </div>
    `;
  });

  if (tbody) tbody.innerHTML = tableHtml;
  if (mobileContainer) mobileContainer.innerHTML = mobileHtml;
  updateSaleSummaryTotals();
}

function updateLinePrice(index, val) {
  const price = parseFloat(val);
  if (!isNaN(price) && price >= 0) {
    activeSaleLines[index].sellingPrice = price;
    renderSaleLinesTable();
  }
}

function updateLineQty(index, val) {
  const qty = parseInt(val, 10);
  if (!isNaN(qty) && qty > 0) {
    activeSaleLines[index].quantity = qty;
    renderSaleLinesTable();
  }
}

function updateLineDiscount(index, val) {
  const disc = parseFloat(val);
  if (!isNaN(disc) && disc >= 0) {
    activeSaleLines[index].discountValue = disc;
    renderSaleLinesTable();
  }
}

function updateLineDiscountType(index, type) {
  activeSaleLines[index].discountType = type;
  renderSaleLinesTable();
}

function removeSaleLine(index) {
  activeSaleLines.splice(index, 1);
  renderSaleLinesTable();
  renderItemPickerList();
}

function updateSaleSummaryTotals() {
  let subtotal = 0;
  let discountTotal = 0;

  activeSaleLines.forEach((line) => {
    const lineSubtotal = (line.sellingPrice || 0) * (line.quantity || 1);
    let lineDiscount = 0;
    if (line.discountType === 'percent') {
      lineDiscount = (lineSubtotal * (line.discountValue || 0)) / 100;
    } else {
      lineDiscount = line.discountValue || 0;
    }
    subtotal += lineSubtotal;
    discountTotal += lineDiscount;
  });

  const grandTotal = Math.max(0, subtotal - discountTotal);
  const paidVal = parseFloat(document.getElementById('newSaleAmountPaid').value) || 0;
  const balance = paidVal - grandTotal;

  const subText = document.getElementById('newSaleSubtotalText');
  if (subText) subText.textContent = `LKR ${subtotal.toFixed(2)}`;

  const discText = document.getElementById('newSaleDiscountText');
  if (discText) discText.textContent = `- LKR ${discountTotal.toFixed(2)}`;

  const grandText = document.getElementById('newSaleGrandTotalText');
  if (grandText) grandText.textContent = `LKR ${grandTotal.toFixed(2)}`;

  const balanceEl = document.getElementById('newSaleBalanceText');
  if (balanceEl) {
    balanceEl.textContent = `LKR ${balance.toFixed(2)}`;
    balanceEl.style.color = balance < 0 ? 'var(--color-red)' : 'var(--color-emerald)';
  }
}

// Item Picker Modal Controller (Strictly Search-based, NO Barcode Scanner)
async function openItemPickerModal() {
  const categories = getLocalCategories();
  const select = document.getElementById('pickerCategoryFilter');
  if (select) {
    select.innerHTML = '<option value="">All Categories</option>' + 
      categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }
  document.getElementById('pickerSearchInput').value = '';
  document.getElementById('itemPickerModalOverlay').style.display = 'flex';
  await renderItemPickerList();
  setTimeout(() => document.getElementById('pickerSearchInput').focus(), 100);
}

async function renderItemPickerList() {
  const container = document.getElementById('pickerItemsList');
  if (!container) return;

  const query = document.getElementById('pickerSearchInput').value.trim().toLowerCase();
  const catFilter = document.getElementById('pickerCategoryFilter').value;
  const items = await dbFetchAllItems();
  const categories = getLocalCategories();

  const filtered = items.filter(i => {
    if (catFilter && i.category_id !== catFilter) return false;
    if (query) {
      const matchName = i.name.toLowerCase().includes(query);
      const cat = categories.find(c => c.id === i.category_id);
      const matchCat = cat && cat.name.toLowerCase().includes(query);
      return matchName || matchCat;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--color-muted); padding: 20px;">No items match search criteria.</p>';
    return;
  }

  let html = '';
  filtered.forEach(i => {
    const cat = categories.find(c => c.id === i.category_id);
    const isOut = i.quantity !== null && Number(i.quantity) === 0;
    const costRate = i.cost_rate !== null && i.cost_rate !== undefined && i.cost_rate !== '' ? Number(i.cost_rate) : 0;
    const retailRate = i.retail_rate !== null && i.retail_rate !== undefined && i.retail_rate !== '' ? Number(i.retail_rate) : 0;

    // Count how many units of this item are currently added in activeSaleLines
    const addedLine = activeSaleLines.find(l => l.inventory_item_id === i.id);
    const addedQty = addedLine ? addedLine.quantity : 0;

    html += `
      <div class="picker-item-row">
        <div>
          <strong style="font-size: 13px; display: block;">${escapeHtml(i.name)}</strong>
          <span style="font-size: 11px; color: var(--color-muted);">${escapeHtml(cat ? cat.name : 'Uncategorized')} • <strong style="color: var(--color-red);">Cost Rate: LKR ${costRate.toFixed(2)}</strong> | Retail Rate: LKR ${retailRate.toFixed(2)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="status-badge ${isOut ? 'badge-out-of-stock' : 'badge-in-stock'}">
            ${i.quantity !== null ? i.quantity + ' PCS' : 'NO DATA'}
          </span>
          <button type="button" class="${addedQty > 0 ? 'btn-secondary' : 'btn-primary'}" style="padding: 6px 12px; font-size: 11px; min-width: 95px;" onclick="addItemToSaleLine('${i.id}')" ${isOut ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
            ${addedQty > 0 ? `✓ Added (${addedQty})` : '+ Add to Sale'}
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function quickSellItem(itemId) {
  const items = await dbFetchAllItems();
  const item = items.find((i) => i.id === itemId);
  if (!item) return;

  if (item.quantity === 0) {
    showToast(`"${item.name}" is OUT OF STOCK!`, 'error');
    return;
  }

  await addItemToSaleLine(itemId);
  currentTab = 'new-sale';
  updateNavActiveState();
  await loadCurrentView();
}

async function addItemToSaleLine(itemId) {
  const items = await dbFetchAllItems();
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const categories = getLocalCategories();
  const cat = categories.find(c => c.id === item.category_id);

  // Default selling price to item's Cost Rate (cost_rate), or fallback to retail_rate
  const costPrice = item.cost_rate !== null && item.cost_rate !== undefined && item.cost_rate !== '' 
    ? Number(item.cost_rate) 
    : (item.retail_rate !== null && item.retail_rate !== undefined ? Number(item.retail_rate) : 0);

  // Check if item is already in bill lines
  const existing = activeSaleLines.find(l => l.inventory_item_id === item.id);
  if (existing) {
    existing.quantity += 1;
    showToast(`Increased "${item.name}" quantity to ${existing.quantity}.`);
  } else {
    activeSaleLines.push({
      inventory_item_id: item.id,
      item_name_snapshot: item.name,
      categoryName: cat ? cat.name : '',
      stockQty: item.quantity !== null ? Number(item.quantity) : null,
      sellingPrice: costPrice,
      quantity: 1,
      discountType: 'fixed',
      discountValue: 0
    });
    showToast(`Added "${item.name}" to sale.`);
  }

  renderSaleLinesTable();
  await renderItemPickerList();
}

async function handleSaveSale() {
  if (activeSaleLines.length === 0) {
    return showToast('Cannot save sale: Please add at least one line item.', 'error');
  }

  // Stock check validation
  for (const line of activeSaleLines) {
    if (line.stockQty !== null && Number(line.quantity) > Number(line.stockQty)) {
      return showToast(`Insufficient Stock for "${line.item_name_snapshot}". Available: ${line.stockQty} PCS, Requested: ${line.quantity} PCS.`, 'error');
    }
  }

  const invEl = document.getElementById('newSaleInvoiceNum');
  const custEl = document.getElementById('newSaleCustomer');
  const payEl = document.getElementById('newSalePaymentMethod');
  const notesEl = document.getElementById('newSaleNotes');
  const paidEl = document.getElementById('newSaleAmountPaid');

  const invoiceNumber = invEl ? invEl.value : '';
  const customerName = custEl ? custEl.value : '';
  const paymentMethod = payEl ? payEl.value : 'Cash';
  const notes = notesEl ? notesEl.value : '';
  const amountPaid = paidEl ? (parseFloat(paidEl.value) || 0) : 0;

  // Calculate totals
  let subtotal = 0;
  let discountTotal = 0;

  activeSaleLines.forEach(line => {
    const lSub = line.sellingPrice * line.quantity;
    let lDisc = 0;
    if (line.discountType === 'percent') {
      lDisc = (lSub * (line.discountValue || 0)) / 100;
    } else {
      lDisc = line.discountValue || 0;
    }
    subtotal += lSub;
    discountTotal += lDisc;
  });

  const grandTotal = Math.max(0, subtotal - discountTotal);
  const balance = amountPaid - grandTotal;

  const saleHeader = {
    invoice_number: invoiceNumber,
    customer_name: customerName,
    sale_date: new Date().toISOString(),
    subtotal,
    discount_total: discountTotal,
    grand_total: grandTotal,
    amount_paid: amountPaid,
    balance,
    payment_method: paymentMethod,
    notes
  };

  const formattedLines = activeSaleLines.map((line) => {
    const lSub = (line.sellingPrice || 0) * (line.quantity || 1);
    let lDisc = 0;
    if (line.discountType === 'percent') {
      lDisc = (lSub * (line.discountValue || 0)) / 100;
    } else {
      lDisc = line.discountValue || 0;
    }
    const lTot = Math.max(0, lSub - lDisc);

    return {
      ...line,
      selling_price: line.sellingPrice || 0,
      discount_type: line.discountType || 'fixed',
      discount_value: line.discountValue || 0,
      line_subtotal: lSub,
      line_total: lTot
    };
  });

  try {
    const result = await dbCreateSale(saleHeader, formattedLines);
    showToast(`Sale saved! Invoice #${result.sale.invoice_number} created.`);
    
    // Clear active sale state
    activeSaleLines = [];
    currentViewingSaleId = result.sale.id;

    // Navigate to invoice detail view
    currentTab = 'sale-detail';
    updateNavActiveState();
    await loadCurrentView();
  } catch (err) {
    showToast(err.message || 'Failed to save sale.', 'error');
  }
}

async function renderSalesHistoryView() {
  const query = document.getElementById('salesHistorySearch').value;
  const payFilter = document.getElementById('salesHistoryPaymentFilter').value;
  const dateFilter = document.getElementById('salesHistoryDateFilter').value;

  const sales = await dbFetchSales(query, payFilter, dateFilter);
  renderSalesTableRows(sales, 'salesHistoryTableBody', 'salesHistoryCardsContainer');
}

function renderSalesTableRows(sales, tableBodyId, cardsContainerId) {
  const tbody = document.getElementById(tableBodyId);
  const cardsContainer = document.getElementById(cardsContainerId);
  if (!tbody) return;

  if (sales.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--color-muted); padding: 32px;">No sales invoices found.</td></tr>';
    if (cardsContainer) cardsContainer.innerHTML = '<p style="text-align: center; color: var(--color-muted); padding: 20px;">No sales invoices found.</p>';
    return;
  }

  let tableHtml = '';
  let cardsHtml = '';

  sales.forEach(s => {
    const sDate = new Date(s.sale_date).toLocaleString();
    const gTotal = Number(s.grand_total || 0).toFixed(2);
    const subTotal = Number(s.subtotal || 0).toFixed(2);
    const discTotal = Number(s.discount_total || 0).toFixed(2);

    tableHtml += `
      <tr>
        <td><strong style="font-family: monospace; color: var(--color-red);">${escapeHtml(s.invoice_number)}</strong></td>
        <td>${sDate}</td>
        <td>${escapeHtml(s.customer_name || 'Walk-in Customer')}</td>
        <td><span class="category-pill">${escapeHtml(s.payment_method || 'Cash')}</span></td>
        <td style="text-align: right;">LKR ${subTotal}</td>
        <td style="text-align: right; color: var(--color-emerald);">- LKR ${discTotal}</td>
        <td style="text-align: right; font-weight: 900; color: var(--color-black);">LKR ${gTotal}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="viewSaleDetails('${s.id}')">View Invoice</button>
        </td>
      </tr>
    `;

    cardsHtml += `
      <div class="inventory-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div>
            <strong style="font-family: monospace; color: var(--color-red); font-size: 15px;">${escapeHtml(s.invoice_number)}</strong>
            <div style="font-size: 12px; color: var(--color-muted);">${sDate}</div>
          </div>
          <span class="category-pill">${escapeHtml(s.payment_method || 'Cash')}</span>
        </div>
        <div style="font-size: 13px; font-weight: 700; margin-bottom: 8px;">Customer: ${escapeHtml(s.customer_name || 'Walk-in Customer')}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--color-border); padding-top: 8px; margin-top: 8px;">
          <div style="font-size: 16px; font-weight: 900; color: var(--color-black);">LKR ${gTotal}</div>
          <button type="button" class="btn-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="viewSaleDetails('${s.id}')">View Invoice</button>
        </div>
      </div>
    `;
  });

  tbody.innerHTML = tableHtml;
  if (cardsContainer) cardsContainer.innerHTML = cardsHtml;
}

function viewSaleDetails(saleId) {
  currentViewingSaleId = saleId;
  currentTab = 'sale-detail';
  updateNavActiveState();
  loadCurrentView();
}

async function renderSaleDetailView(saleId) {
  if (!saleId) return;

  const details = await dbFetchSaleDetails(saleId);
  if (!details || !details.sale) {
    showToast('Invoice not found.', 'error');
    currentTab = 'sales-history';
    updateNavActiveState();
    await loadCurrentView();
    return;
  }

  const s = details.sale;
  const items = details.items || [];

  document.getElementById('invDetailNum').textContent = s.invoice_number;
  document.getElementById('invDetailDate').textContent = `Date: ${new Date(s.sale_date).toLocaleString()}`;
  document.getElementById('invDetailPaymentMethod').textContent = `Payment: ${s.payment_method || 'Cash'}`;
  document.getElementById('invDetailCustomer').textContent = s.customer_name || 'Walk-in Customer';
  document.getElementById('invDetailNotes').textContent = s.notes ? `Notes: ${s.notes}` : '';

  const tbody = document.getElementById('invDetailItemsTableBody');
  if (tbody) {
    let html = '';
    items.forEach((item, index) => {
      const price = Number(item.selling_price || 0).toFixed(2);
      const disc = Number(item.discount_value || 0).toFixed(2);
      const total = Number(item.line_total || 0).toFixed(2);

      html += `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${escapeHtml(item.item_name_snapshot)}</strong></td>
          <td style="text-align: right;">LKR ${price}</td>
          <td style="text-align: center;">${item.quantity}</td>
          <td style="text-align: right;">${disc > 0 ? (item.discount_type === 'percent' ? `${disc}%` : `LKR ${disc}`) : '—'}</td>
          <td style="text-align: right; font-weight: 800;">LKR ${total}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  document.getElementById('invDetailSubtotal').textContent = `LKR ${Number(s.subtotal || 0).toFixed(2)}`;
  document.getElementById('invDetailDiscount').textContent = `- LKR ${Number(s.discount_total || 0).toFixed(2)}`;
  document.getElementById('invDetailGrandTotal').textContent = `LKR ${Number(s.grand_total || 0).toFixed(2)}`;
  document.getElementById('invDetailPaid').textContent = `LKR ${Number(s.amount_paid || 0).toFixed(2)}`;
  document.getElementById('invDetailBalance').textContent = `LKR ${Number(s.balance || 0).toFixed(2)}`;
}

// --- PDF GENERATION & EXPORT ENGINE ---

async function downloadInvoicePDF() {
  const invElement = document.getElementById('printableInvoice');
  if (!invElement) return showToast('Invoice container not found.', 'error');

  const invoiceNum = document.getElementById('invDetailNum').textContent || 'Invoice';
  showToast('Generating clean Bill PDF...', 'success');

  const opt = {
    margin: [8, 8, 8, 8],
    filename: `${invoiceNum}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    if (window.html2pdf) {
      await html2pdf().set(opt).from(invElement).save();
      showToast(`PDF ${invoiceNum}.pdf downloaded successfully!`);
    } else {
      window.print();
    }
  } catch (err) {
    console.error('PDF export error:', err);
    showToast('Fallback to browser print.', 'error');
    window.print();
  }
}

async function generateInventoryPDFReport() {
  showToast('Building full Inventory PDF Report...', 'success');
  const items = await dbFetchAllItems();
  const categories = getLocalCategories();

  if (items.length === 0) {
    return showToast('No inventory items to export.', 'error');
  }

  // Create temporary off-screen container for crisp PDF rendering
  const reportContainer = document.createElement('div');
  reportContainer.className = 'pdf-report-wrapper';
  
  const dateStr = new Date().toLocaleString();
  const todayFileStr = new Date().toISOString().slice(0, 10);

  let inStockCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  items.forEach(i => {
    const qty = i.quantity !== null && i.quantity !== undefined ? Number(i.quantity) : 0;
    if (qty === 0) outOfStockCount++;
    else if (qty <= 5) lowStockCount++;
    else inStockCount++;
  });

  let tableRowsHtml = '';
  items.forEach((item, index) => {
    const cat = categories.find(c => c.id === item.category_id);
    const costRate = item.cost_rate !== null && item.cost_rate !== undefined && item.cost_rate !== '' ? 'LKR ' + Number(item.cost_rate).toFixed(2) : '—';
    const retailRate = item.retail_rate !== null && item.retail_rate !== undefined && item.retail_rate !== '' ? 'LKR ' + Number(item.retail_rate).toFixed(2) : '—';
    const qtyStr = item.quantity !== null && item.quantity !== undefined ? item.quantity + ' PCS' : 'NO DATA';
    
    let statusBadge = '<span style="color: #059669; font-weight: 800;">IN STOCK</span>';
    if (item.quantity === null || item.quantity === undefined) statusBadge = '<span style="color: #71717a;">NO DATA</span>';
    else if (Number(item.quantity) === 0) statusBadge = '<span style="color: #dc2626; font-weight: 900;">OUT OF STOCK</span>';
    else if (Number(item.quantity) <= 5) statusBadge = '<span style="color: #d97706; font-weight: 800;">LOW STOCK</span>';

    tableRowsHtml += `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(cat ? cat.name : 'Uncategorized')}</strong></td>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td style="font-family: monospace;">${escapeHtml(item.barcode || '—')}</td>
        <td style="text-align: right; color: #dc2626; font-weight: 700;">${costRate}</td>
        <td style="text-align: right;">${retailRate}</td>
        <td style="text-align: center; font-weight: 800;">${qtyStr}</td>
        <td style="text-align: center;">${statusBadge}</td>
      </tr>
    `;
  });

  reportContainer.innerHTML = `
    <div class="pdf-report-header">
      <div>
        <h1 style="font-size: 22px; font-weight: 900; color: #dc2626; margin: 0;">ATASO ERP — INVENTORY REPORT</h1>
        <p style="font-size: 11px; color: #71717a; margin: 4px 0 0 0;">Stationery & Book Inventory System • Comprehensive Audit Log</p>
      </div>
      <div style="text-align: right; font-size: 11px; color: #09090b;">
        <div><strong>Generated:</strong> ${dateStr}</div>
        <div><strong>Total Items:</strong> ${items.length}</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; font-size: 11px; background: #f4f4f5; padding: 12px; border-radius: 6px; color: #000000;">
      <div><span style="color: #71717a;">Total Items:</span> <strong style="display:block; font-size: 14px; color: #000000;">${items.length}</strong></div>
      <div><span style="color: #71717a;">In Stock:</span> <strong style="display:block; font-size: 14px; color: #059669;">${inStockCount}</strong></div>
      <div><span style="color: #71717a;">Low Stock:</span> <strong style="display:block; font-size: 14px; color: #d97706;">${lowStockCount}</strong></div>
      <div><span style="color: #71717a;">Out of Stock:</span> <strong style="display:block; font-size: 14px; color: #dc2626;">${outOfStockCount}</strong></div>
    </div>

    <table class="pdf-report-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Category</th>
          <th>Item Name</th>
          <th>Barcode</th>
          <th style="text-align: right;">Cost Rate</th>
          <th style="text-align: right;">Retail Rate</th>
          <th style="text-align: center;">Current Qty</th>
          <th style="text-align: center;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>

    <div style="margin-top: 30px; border-top: 1px solid #e4e4e7; padding-top: 12px; font-size: 10px; color: #71717a; text-align: center;">
      Ataso ERP • Full Inventory Audit Report • Page 1 of 1
    </div>
  `;

  document.body.appendChild(reportContainer);

  const opt = {
    margin: [8, 8, 8, 8],
    filename: `Ataso_Inventory_Report_${todayFileStr}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };

  try {
    if (window.html2pdf) {
      await html2pdf().set(opt).from(reportContainer).save();
      showToast(`Inventory Report PDF downloaded successfully!`);
    } else {
      window.print();
    }
  } catch (err) {
    console.error('Inventory PDF export error:', err);
    showToast('Error generating PDF report.', 'error');
  } finally {
    reportContainer.remove();
  }
}

// --- RAW MATERIALS & SUPPLIES MODULE RENDERERS & HANDLERS ---

let editingRawMaterialId = null;
let editingRawAdjustId = null;
let selectedRawAdjustType = 'USE';

async function renderRawMaterialsView() {
  const materials = await dbFetchRawMaterials();
  const searchInput = document.getElementById('rawMatSearchInput');
  const catFilter = document.getElementById('rawMatCategoryFilter');

  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const selectedCat = catFilter ? catFilter.value : '';

  const filtered = materials.filter((m) => {
    const matchCat = !selectedCat || m.category === selectedCat;
    const matchSearch = !query || m.name.toLowerCase().includes(query) || m.category.toLowerCase().includes(query);
    return matchCat && matchSearch;
  });

  const totalItems = materials.length;
  const totalValue = materials.reduce((acc, m) => acc + (Number(m.quantity || 0) * Number(m.unit_cost || 0)), 0);
  const lowAlerts = materials.filter((m) => Number(m.quantity || 0) <= Number(m.min_threshold || 5)).length;

  if (document.getElementById('rawMatTotalItems')) document.getElementById('rawMatTotalItems').textContent = totalItems;
  if (document.getElementById('rawMatTotalValue')) document.getElementById('rawMatTotalValue').textContent = 'LKR ' + totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 });
  if (document.getElementById('rawMatLowAlerts')) document.getElementById('rawMatLowAlerts').textContent = lowAlerts;

  const cardsContainer = document.getElementById('rawMatCardsContainer');
  const tableBody = document.getElementById('rawMatTableBody');

  if (filtered.length === 0) {
    const emptyHtml = '<div style="padding: 30px; text-align: center; color: var(--color-muted); font-size: 13px;">No raw material stock items found. Click "+ Add Raw Material" to create one.</div>';
    if (cardsContainer) cardsContainer.innerHTML = emptyHtml;
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="8">${emptyHtml}</td></tr>`;
    return;
  }

  if (cardsContainer) {
    cardsContainer.innerHTML = filtered.map((m) => {
      const isLow = Number(m.quantity || 0) <= Number(m.min_threshold || 5);
      const isOut = Number(m.quantity || 0) === 0;
      const totalVal = Number(m.quantity || 0) * Number(m.unit_cost || 0);

      return `
        <div class="inventory-card ${isLow ? 'is-low' : ''}">
          <div class="card-top">
            <div>
              <span class="category-pill" style="background: var(--color-light-bg); border: 1px solid var(--color-border); color: var(--color-black); font-weight: 800;">${escapeHtml(m.category)}</span>
              <h3 class="item-title" style="margin-top: 4px;">${escapeHtml(m.name)}</h3>
              ${m.notes ? `<div style="font-size: 11px; color: var(--color-muted);">${escapeHtml(m.notes)}</div>` : ''}
            </div>
            <span class="status-badge ${isOut ? 'badge-out-of-stock' : (isLow ? 'badge-low-stock' : 'badge-in-stock')}">
              ${isOut ? 'OUT OF STOCK' : (isLow ? 'LOW STOCK' : 'IN STORE')}
            </span>
          </div>

          <div class="card-meta" style="grid-template-columns: repeat(3, 1fr); padding: 12px; margin: 12px 0;">
            <div>
              <span style="color: var(--color-muted); display: block; font-size: 10px; text-transform: uppercase;">Unit Cost</span>
              <strong style="font-size: 13px; color: var(--color-red);">LKR ${Number(m.unit_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div>
              <span style="color: var(--color-muted); display: block; font-size: 10px; text-transform: uppercase;">Stock Qty</span>
              <strong style="font-size: 15px; font-weight: 900; color: ${isOut ? 'var(--color-red)' : 'var(--color-black)'};">${m.quantity} ${escapeHtml(m.unit_type)}</strong>
            </div>
            <div>
              <span style="color: var(--color-muted); display: block; font-size: 10px; text-transform: uppercase;">Stock Value</span>
              <strong style="font-size: 13px;">LKR ${totalVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
            </div>
          </div>

          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button type="button" class="btn-primary" style="flex: 2; font-size: 12px; font-weight: 800;" onclick="openAdjustRawMaterialModal('${m.id}')">⚡ Use / Adjust</button>
            <button type="button" class="btn-secondary" style="flex: 1; font-size: 12px;" onclick="openEditRawMaterialModal('${m.id}')">✏️ Edit</button>
            <button type="button" class="btn-icon btn-danger-icon" style="min-width: 34px; font-size: 12px;" title="Delete Material" onclick="handleDeleteRawMaterial('${m.id}', '${m.name.replace(/'/g, "\\'")}')">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  }

  if (tableBody) {
    tableBody.innerHTML = filtered.map((m) => {
      const isLow = Number(m.quantity || 0) <= Number(m.min_threshold || 5);
      const isOut = Number(m.quantity || 0) === 0;
      const totalVal = Number(m.quantity || 0) * Number(m.unit_cost || 0);

      return `
        <tr class="${isLow ? 'is-low-row' : ''}">
          <td><span class="category-pill" style="background: var(--color-light-bg); border: 1px solid var(--color-border); font-weight: 800;">${escapeHtml(m.category)}</span></td>
          <td style="font-weight: 900;">
            ${escapeHtml(m.name)}
            ${m.notes ? `<div style="font-size: 11px; color: var(--color-muted); font-weight: normal;">${escapeHtml(m.notes)}</div>` : ''}
          </td>
          <td style="text-align: right; font-weight: 800; color: var(--color-red);">LKR ${Number(m.unit_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td style="text-align: center; font-weight: 900; font-size: 15px; color: ${isOut ? 'var(--color-red)' : 'var(--color-black)'};">${m.quantity}</td>
          <td style="text-align: center; font-weight: 600; font-size: 12px;">${escapeHtml(m.unit_type)}</td>
          <td style="text-align: right; font-weight: 800;">LKR ${totalVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td style="text-align: center;">
            <span class="status-badge ${isOut ? 'badge-out-of-stock' : (isLow ? 'badge-low-stock' : 'badge-in-stock')}">
              ${isOut ? 'OUT OF STOCK' : (isLow ? 'LOW STOCK' : 'IN STORE')}
            </span>
          </td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 4px; justify-content: center;">
              <button type="button" class="btn-primary" style="padding: 4px 10px; font-size: 11px; font-weight: 800;" onclick="openAdjustRawMaterialModal('${m.id}')">⚡ Use / Adjust</button>
              <button type="button" class="btn-icon" style="font-size: 12px;" title="Edit Material" onclick="openEditRawMaterialModal('${m.id}')">✏️</button>
              <button type="button" class="btn-icon btn-danger-icon" style="font-size: 12px;" title="Delete Material" onclick="handleDeleteRawMaterial('${m.id}', '${m.name.replace(/'/g, "\\'")}')">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
}

function openAddRawMaterialModal() {
  editingRawMaterialId = null;
  document.getElementById('rawMaterialModalTitle').textContent = '➕ Add Raw Material';
  document.getElementById('rawFormName').value = '';
  document.getElementById('rawFormCategory').value = 'Paper';
  document.getElementById('rawFormUnitType').value = 'Reams';
  document.getElementById('rawFormCost').value = '';
  document.getElementById('rawFormQty').value = '';
  document.getElementById('rawFormThreshold').value = '5';
  document.getElementById('rawFormNotes').value = '';
  document.getElementById('rawMaterialModalOverlay').style.display = 'flex';
}

async function openEditRawMaterialModal(id) {
  const materials = await dbFetchRawMaterials();
  const m = materials.find((item) => item.id === id);
  if (!m) return;

  editingRawMaterialId = m.id;
  document.getElementById('rawMaterialModalTitle').textContent = `✏️ Edit Material: ${m.name}`;
  document.getElementById('rawFormName').value = m.name;
  document.getElementById('rawFormCategory').value = m.category || 'Paper';
  document.getElementById('rawFormUnitType').value = m.unit_type || 'Reams';
  document.getElementById('rawFormCost').value = m.unit_cost !== null && m.unit_cost !== undefined ? m.unit_cost : '';
  document.getElementById('rawFormQty').value = m.quantity !== null && m.quantity !== undefined ? m.quantity : '';
  document.getElementById('rawFormThreshold').value = m.min_threshold !== null && m.min_threshold !== undefined ? m.min_threshold : '5';
  document.getElementById('rawFormNotes').value = m.notes || '';
  document.getElementById('rawMaterialModalOverlay').style.display = 'flex';
}

async function handleSaveRawMaterialForm() {
  const nameVal = document.getElementById('rawFormName').value.trim();
  const catVal = document.getElementById('rawFormCategory').value;
  const unitVal = document.getElementById('rawFormUnitType').value;
  const costVal = document.getElementById('rawFormCost').value.trim();
  const qtyVal = document.getElementById('rawFormQty').value.trim();
  const thresholdVal = document.getElementById('rawFormThreshold').value.trim();
  const notesVal = document.getElementById('rawFormNotes').value.trim();

  if (!nameVal) return showToast('Material Name is required.', 'error');

  const parsedCost = costVal !== '' ? parseFloat(costVal) : 0;
  const parsedQty = qtyVal !== '' ? parseInt(qtyVal, 10) : 0;
  const parsedThreshold = thresholdVal !== '' ? parseInt(thresholdVal, 10) : 5;

  try {
    if (editingRawMaterialId) {
      await dbUpdateRawMaterial(editingRawMaterialId, {
        name: nameVal,
        category: catVal,
        unit_type: unitVal,
        unit_cost: parsedCost,
        quantity: parsedQty,
        min_threshold: parsedThreshold,
        notes: notesVal
      });
      showToast('Raw material updated successfully.');
    } else {
      await dbAddRawMaterial({
        name: nameVal,
        category: catVal,
        unit_type: unitVal,
        unit_cost: parsedCost,
        quantity: parsedQty,
        min_threshold: parsedThreshold,
        notes: notesVal
      });
      showToast('New raw material added successfully.');
    }

    document.getElementById('rawMaterialModalOverlay').style.display = 'none';
    editingRawMaterialId = null;
    await renderRawMaterialsView();
  } catch (err) {
    showToast(err.message || 'Error saving raw material.', 'error');
  }
}

function selectRawAdjustType(type) {
  selectedRawAdjustType = type;
  document.getElementById('rawPillUse').className = type === 'USE' ? 'type-pill active-out' : 'type-pill';
  document.getElementById('rawPillRestock').className = type === 'RESTOCK' ? 'type-pill active-in' : 'type-pill';
  document.getElementById('rawPillSet').className = type === 'SET_EXACT' ? 'type-pill active-adjust' : 'type-pill';

  const labelMap = {
    USE: 'Quantity to Issue / Use (-)',
    RESTOCK: 'Quantity to Add / Restock (+)',
    SET_EXACT: 'New Set Quantity (=)',
  };
  document.getElementById('rawAdjustQtyLabel').textContent = labelMap[type];
}

async function openAdjustRawMaterialModal(id) {
  const materials = await dbFetchRawMaterials();
  const m = materials.find((item) => item.id === id);
  if (!m) return;

  editingRawAdjustId = m.id;
  document.getElementById('rawAdjustModalTitle').textContent = `⚡ Adjust: ${m.name}`;
  document.getElementById('rawAdjustModalSub').textContent = `Current Stock: ${m.quantity} ${m.unit_type} | Category: ${m.category}`;
  document.getElementById('rawAdjustQtyInput').value = '';
  document.getElementById('rawAdjustReasonInput').value = '';

  selectRawAdjustType('USE');
  document.getElementById('rawMaterialAdjustModalOverlay').style.display = 'flex';
}

async function handleSaveRawMaterialAdjust() {
  if (!editingRawAdjustId) return;
  const qtyVal = document.getElementById('rawAdjustQtyInput').value.trim();
  const reasonVal = document.getElementById('rawAdjustReasonInput').value.trim();

  if (!qtyVal || isNaN(parseInt(qtyVal, 10)) || parseInt(qtyVal, 10) < 0) {
    return showToast('Please enter a valid quantity.', 'error');
  }

  const delta = parseInt(qtyVal, 10);
  try {
    await dbAdjustRawMaterialQty(editingRawAdjustId, selectedRawAdjustType, delta, reasonVal);
    document.getElementById('rawMaterialAdjustModalOverlay').style.display = 'none';
    editingRawAdjustId = null;
    showToast('Raw material stock adjusted successfully.');
    await renderRawMaterialsView();
  } catch (err) {
    showToast(err.message || 'Error adjusting material stock.', 'error');
  }
}

function openConfirmDialog(title, message, onConfirm) {
  showConfirmDialog(title, message, onConfirm);
}

function handleDeleteRawMaterial(id, name) {
  showConfirmDialog(
    'Delete Raw Material',
    `Are you sure you want to delete material "${name}"? This action cannot be undone.`,
    async () => {
      try {
        await dbDeleteRawMaterial(id);
        showToast(`Material "${name}" deleted.`);
        await renderRawMaterialsView();
      } catch (e) {
        showToast(e.message || 'Error deleting material.', 'error');
      }
    }
  );
}

// Global Window Bindings for Mobile Inline Onclick Handlers
window.openAddRawMaterialModal = openAddRawMaterialModal;
window.openEditRawMaterialModal = openEditRawMaterialModal;
window.handleSaveRawMaterialForm = handleSaveRawMaterialForm;
window.selectRawAdjustType = selectRawAdjustType;
window.openAdjustRawMaterialModal = openAdjustRawMaterialModal;
window.handleSaveRawMaterialAdjust = handleSaveRawMaterialAdjust;
window.handleDeleteRawMaterial = handleDeleteRawMaterial;
