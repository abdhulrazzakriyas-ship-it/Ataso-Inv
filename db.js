// Ataso Inventory ERP - Complete Relational, Barcode & Movements Storage Engine (Flat Architecture)

const LOCAL_ITEMS_KEY = 'ataso_erp_items_v3';
const LOCAL_CATEGORIES_KEY = 'ataso_erp_categories_v3';
const LOCAL_SETTINGS_KEY = 'ataso_erp_settings_v3';
const LOCAL_MOVEMENTS_KEY = 'ataso_erp_movements_v3';
const LOCAL_THEME_KEY = 'ataso_erp_theme_v3';
const LOCAL_SALES_KEY = 'ataso_erp_sales_v3';
const LOCAL_SALE_ITEMS_KEY = 'ataso_erp_sale_items_v3';
const LOCAL_RAW_MATERIALS_KEY = 'ataso_erp_raw_materials_v3';
const BROADCAST_CHANNEL_NAME = 'ataso_erp_realtime_channel_v3';

// Supabase Connection Check
let supabaseClient = null;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = (window.ENV && window.ENV.SUPABASE_URL) || localStorage.getItem('supabase_url');
  const key = (window.ENV && window.ENV.SUPABASE_ANON_KEY) || localStorage.getItem('supabase_key');
  if (url && key && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(url, key);
    } catch (e) {
      console.warn('Supabase init error', e);
    }
  }
  return supabaseClient;
}

function isSupabaseActive() {
  return Boolean(getSupabase());
}

function updateSupabaseSyncBadge(status) {
  const badge = document.getElementById('supabaseSyncBadge');
  if (!badge) return;

  if (status === 'syncing') {
    badge.className = 'supabase-sync-badge syncing';
    badge.innerHTML = '⚡ Syncing Cloud...';
  } else if (status === 'connected') {
    badge.className = 'supabase-sync-badge';
    badge.innerHTML = '☁️ Supabase: Live Sync';
  } else if (status === 'error') {
    badge.className = 'supabase-sync-badge error';
    badge.innerHTML = '⚠️ Local Sync Mode';
  } else {
    badge.className = 'supabase-sync-badge';
    badge.innerHTML = '☁️ Supabase: Connected';
  }
}

async function dbSyncAllToSupabase() {
  const sb = getSupabase();
  if (!sb) {
    updateSupabaseSyncBadge('error');
    return false;
  }

  try {
    updateSupabaseSyncBadge('syncing');

    // 1. Sync Categories
    const localCats = getLocalCategories();
    if (localCats.length > 0) {
      for (const cat of localCats) {
        await sb.from('categories').upsert({ id: cat.id, name: cat.name });
      }
    }

    // 2. Sync Inventory Items
    const localItems = getLocalItems();
    if (localItems.length > 0) {
      for (const item of localItems) {
        await sb.from('inventory_items').upsert({
          id: item.id,
          category_id: item.category_id,
          name: item.name,
          barcode: item.barcode || null,
          ream_cost: item.ream_cost !== undefined ? item.ream_cost : null,
          cost_rate: item.cost_rate !== undefined ? item.cost_rate : null,
          retail_rate: item.retail_rate !== undefined ? item.retail_rate : null,
          quantity: item.quantity !== undefined ? item.quantity : null,
          updated_at: item.updated_at || new Date().toISOString()
        });
      }
    }

    // 3. Sync Sales
    const localSales = getLocalSales();
    if (localSales.length > 0) {
      for (const sale of localSales) {
        await sb.from('sales').upsert(sale);
      }
    }

    // 4. Sync Sale Line Items
    const localSaleItems = getLocalSaleItems();
    if (localSaleItems.length > 0) {
      for (const sItem of localSaleItems) {
        await sb.from('sale_items').upsert(sItem);
      }
    }

    updateSupabaseSyncBadge('connected');
    return true;
  } catch (e) {
    console.warn('Auto Supabase sync notice:', e);
    updateSupabaseSyncBadge('connected');
    return false;
  }
}

// Precise Stock Status Logic
function getStockStatus(quantity, threshold) {
  if (quantity === null || quantity === undefined || quantity === '') {
    return {
      label: 'NO DATA',
      state: 'no-data',
      colorClass: 'status-no-data',
      badgeClass: 'badge-no-data',
    };
  }

  const qtyNum = Number(quantity);

  if (qtyNum === 0) {
    return {
      label: 'OUT OF STOCK',
      state: 'out-of-stock',
      colorClass: 'status-out-of-stock',
      badgeClass: 'badge-out-of-stock',
    };
  }

  if (qtyNum > 0 && qtyNum <= threshold) {
    return {
      label: 'LOW STOCK',
      state: 'low-stock',
      colorClass: 'status-low-stock',
      badgeClass: 'badge-low-stock',
    };
  }

  return {
    label: 'IN STOCK',
    state: 'in-stock',
    colorClass: 'status-in-stock',
    badgeClass: 'badge-in-stock',
  };
}

// Local Storage Multi-Device Synchronization
function getLocalCategories() {
  try {
    const raw = localStorage.getItem(LOCAL_CATEGORIES_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(SEED_CATEGORIES));
      return SEED_CATEGORIES;
    }
    return JSON.parse(raw);
  } catch (e) {
    return SEED_CATEGORIES;
  }
}

function saveLocalCategories(categories) {
  try {
    localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(categories));
    notifyBroadcast('categories_updated');
  } catch (e) {
    console.error('Error saving local categories', e);
  }
}

function getLocalItems() {
  try {
    const raw = localStorage.getItem(LOCAL_ITEMS_KEY);
    if (!raw) {
      const seed = generateSeedItems();
      localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw);
  } catch (err) {
    return generateSeedItems();
  }
}

function saveLocalItems(items) {
  try {
    localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(items));
    notifyBroadcast('items_updated');
  } catch (err) {
    console.error('Error saving local items', err);
  }
}

function getLocalMovements() {
  try {
    const raw = localStorage.getItem(LOCAL_MOVEMENTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveLocalMovements(movements) {
  try {
    localStorage.setItem(LOCAL_MOVEMENTS_KEY, JSON.stringify(movements));
    notifyBroadcast('movements_updated');
  } catch (e) {
    console.error('Error saving movements', e);
  }
}

function getLocalSales() {
  try {
    const raw = localStorage.getItem(LOCAL_SALES_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveLocalSales(sales) {
  try {
    localStorage.setItem(LOCAL_SALES_KEY, JSON.stringify(sales));
    notifyBroadcast('sales_updated');
  } catch (e) {
    console.error('Error saving sales', e);
  }
}

function getLocalSaleItems() {
  try {
    const raw = localStorage.getItem(LOCAL_SALE_ITEMS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveLocalSaleItems(items) {
  try {
    localStorage.setItem(LOCAL_SALE_ITEMS_KEY, JSON.stringify(items));
    notifyBroadcast('sales_updated');
  } catch (e) {
    console.error('Error saving sale items', e);
  }
}

function getLocalSettings() {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    return JSON.parse(raw);
  } catch (err) {
    return DEFAULT_SETTINGS;
  }
}

function saveLocalSettings(settings) {
  try {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
    notifyBroadcast('settings_updated');
  } catch (err) {
    console.error('Error saving settings', err);
  }
}

function dbGetTheme() {
  try {
    return localStorage.getItem(LOCAL_THEME_KEY) || 'light';
  } catch (e) {
    return 'light';
  }
}

function dbSetTheme(theme) {
  try {
    localStorage.setItem(LOCAL_THEME_KEY, theme);
    notifyBroadcast('theme_updated');
  } catch (e) {}
}

function notifyBroadcast(type) {
  if ('BroadcastChannel' in window) {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    bc.postMessage({ type, timestamp: Date.now() });
    bc.close();
  }
}

// Unique Barcode Validation
async function dbValidateBarcode(barcode, excludeItemId = null) {
  if (!barcode || !barcode.trim()) return true;
  const trimmed = barcode.trim();
  const items = await dbFetchAllItems();

  const duplicate = items.find(
    (i) => i.barcode && i.barcode.trim().toLowerCase() === trimmed.toLowerCase() && i.id !== excludeItemId
  );

  if (duplicate) {
    throw new Error(`This barcode (${trimmed}) is already assigned to "${duplicate.name}".`);
  }

  return true;
}

async function dbFetchItemByBarcode(barcode) {
  if (!barcode || !barcode.trim()) return null;
  const trimmed = barcode.trim().toLowerCase();
  const items = await dbFetchAllItems();

  return items.find((i) => i.barcode && i.barcode.trim().toLowerCase() === trimmed) || null;
}

// --- DATABASE CATEGORY CRUD ---

async function dbFetchCategories() {
  const sb = getSupabase();
  let categories = getLocalCategories();

  if (sb) {
    try {
      const { data, error } = await sb.from('categories').select('*').order('name');
      if (!error && data && data.length > 0) categories = data;
    } catch (e) {
      console.warn('Supabase fetchCategories error', e);
    }
  }

  const items = await dbFetchAllItems();
  const settings = await dbFetchSettings();
  const threshold = settings.low_stock_threshold;

  return categories.map((cat) => {
    const catItems = items.filter((i) => i.category_id === cat.id);
    const lowCount = catItems.filter(
      (i) => i.quantity !== null && i.quantity !== undefined && Number(i.quantity) > 0 && Number(i.quantity) <= threshold
    ).length;
    const outCount = catItems.filter((i) => Number(i.quantity) === 0).length;

    return {
      ...cat,
      item_count: catItems.length,
      low_stock_count: lowCount,
      out_of_stock_count: outCount,
    };
  });
}

async function dbAddCategory(name) {
  if (!name || !name.trim()) throw new Error('Category name is required.');
  const trimmed = name.trim();

  const categories = getLocalCategories();
  if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('A category with this name already exists.');
  }

  const newCategory = {
    id: `10000000-0000-0000-0000-${Date.now().toString().padStart(12, '0')}`,
    name: trimmed,
    created_at: new Date().toISOString(),
  };

  categories.push(newCategory);
  saveLocalCategories(categories);

  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('categories').insert(newCategory);
    } catch (e) {
      console.error('Supabase insert category error', e);
    }
  }

  return newCategory;
}

async function dbUpdateCategory(id, newName) {
  if (!newName || !newName.trim()) throw new Error('Category name is required.');
  const trimmed = newName.trim();

  const categories = getLocalCategories();
  const cat = categories.find((c) => c.id === id);
  if (!cat) throw new Error('Category not found.');

  cat.name = trimmed;
  saveLocalCategories(categories);

  const items = getLocalItems();
  items.forEach((item) => {
    if (item.category_id === id) item.category_name = trimmed;
  });
  saveLocalItems(items);

  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('categories').update({ name: trimmed }).eq('id', id);
    } catch (e) {
      console.error('Supabase update category error', e);
    }
  }

  return cat;
}

async function dbDeleteCategory(id) {
  const items = await dbFetchAllItems();
  const assignedItems = items.filter((i) => i.category_id === id);

  if (assignedItems.length > 0) {
    throw new Error(`Cannot delete category because it currently contains ${assignedItems.length} active inventory item(s). Reassign or delete those items first.`);
  }

  const categories = getLocalCategories().filter((c) => c.id !== id);
  saveLocalCategories(categories);

  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('categories').delete().eq('id', id);
    } catch (e) {
      console.error('Supabase delete category error', e);
    }
  }

  return true;
}

// --- DATABASE INVENTORY ITEM CRUD ---

async function dbFetchAllItems() {
  const sb = getSupabase();
  const categories = getLocalCategories();

  if (sb) {
    try {
      const { data, error } = await sb.from('inventory_items').select(`
        id, category_id, name, barcode, ream_cost, cost_rate, retail_rate, quantity, created_at, updated_at,
        categories ( name )
      `);
      if (!error && data && data.length > 0) {
        return data.map((row) => ({
          id: row.id,
          category_id: row.category_id,
          category_name: row.categories?.name || categories.find((c) => c.id === row.category_id)?.name || 'Category',
          name: row.name,
          barcode: row.barcode,
          ream_cost: row.ream_cost,
          cost_rate: row.cost_rate !== undefined && row.cost_rate !== null ? row.cost_rate : null,
          retail_rate: row.retail_rate,
          quantity: row.quantity,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }));
      }
    } catch (e) {
      console.warn('Supabase fetchAllItems error', e);
    }
  }

  const localItems = getLocalItems();
  return localItems.map((item) => ({
    ...item,
    category_name: categories.find((c) => c.id === item.category_id)?.name || item.category_name || 'Category',
  }));
}

async function dbFetchItemById(id) {
  const items = await dbFetchAllItems();
  return items.find((i) => i.id === id) || null;
}

async function dbAddItem(payload) {
  if (!payload.name || !payload.name.trim()) throw new Error('Item name is required.');
  if (!payload.category_id) throw new Error('Category is required.');

  if (payload.barcode && payload.barcode.trim()) {
    await dbValidateBarcode(payload.barcode.trim());
  }

  if (payload.quantity !== null && payload.quantity !== undefined && Number(payload.quantity) < 0) {
    throw new Error('Quantity cannot be negative.');
  }
  if (payload.retail_rate !== null && payload.retail_rate !== undefined && Number(payload.retail_rate) < 0) {
    throw new Error('Retail rate cannot be negative.');
  }

  const categories = getLocalCategories();
  const cat = categories.find((c) => c.id === payload.category_id);
  const catName = cat ? cat.name : 'Category';

  const newItem = {
    id: `20000000-0000-0000-0000-${Date.now().toString().padStart(12, '0')}`,
    category_id: payload.category_id,
    category_name: catName,
    name: payload.name.trim(),
    barcode: payload.barcode && payload.barcode.trim() ? payload.barcode.trim() : null,
    ream_cost: payload.ream_cost !== undefined ? payload.ream_cost : null,
    cost_rate: payload.cost_rate !== undefined ? payload.cost_rate : null,
    retail_rate: payload.retail_rate !== undefined ? payload.retail_rate : null,
    quantity: payload.quantity !== undefined ? payload.quantity : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const localItems = getLocalItems();
  localItems.push(newItem);
  saveLocalItems(localItems);

  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('inventory_items').insert({
        id: newItem.id,
        category_id: newItem.category_id,
        name: newItem.name,
        barcode: newItem.barcode,
        ream_cost: newItem.ream_cost,
        cost_rate: newItem.cost_rate,
        retail_rate: newItem.retail_rate,
        quantity: newItem.quantity,
        created_at: newItem.created_at,
        updated_at: newItem.updated_at,
      });
    } catch (e) {
      console.error('Supabase insert item error', e);
    }
  }

  return newItem;
}

async function dbUpdateInventoryItem(id, payload) {
  const localItems = getLocalItems();
  const idx = localItems.findIndex((i) => i.id === id);
  if (idx === -1) throw new Error('Inventory item not found.');

  const existing = localItems[idx];
  const categories = getLocalCategories();
  const catId = payload.category_id || existing.category_id;
  const cat = categories.find((c) => c.id === catId);

  if (payload.barcode !== undefined && payload.barcode !== null && payload.barcode.trim() !== '') {
    await dbValidateBarcode(payload.barcode.trim(), id);
  }

  const updatedItem = {
    ...existing,
    category_id: catId,
    category_name: cat ? cat.name : existing.category_name,
    name: payload.name !== undefined ? payload.name.trim() : existing.name,
    barcode: payload.barcode !== undefined ? (payload.barcode && payload.barcode.trim() ? payload.barcode.trim() : null) : existing.barcode,
    ream_cost: payload.ream_cost !== undefined ? payload.ream_cost : existing.ream_cost,
    cost_rate: payload.cost_rate !== undefined ? payload.cost_rate : existing.cost_rate,
    retail_rate: payload.retail_rate !== undefined ? payload.retail_rate : existing.retail_rate,
    quantity: payload.quantity !== undefined ? payload.quantity : existing.quantity,
    updated_at: new Date().toISOString(),
  };

  localItems[idx] = updatedItem;
  saveLocalItems(localItems);

  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('inventory_items').update({
        category_id: updatedItem.category_id,
        name: updatedItem.name,
        barcode: updatedItem.barcode,
        ream_cost: updatedItem.ream_cost,
        cost_rate: updatedItem.cost_rate,
        retail_rate: updatedItem.retail_rate,
        quantity: updatedItem.quantity,
        updated_at: updatedItem.updated_at,
      }).eq('id', id);
    } catch (e) {
      console.error('Supabase update item error', e);
    }
  }

  return updatedItem;
}

async function dbDeleteInventoryItem(id) {
  const localItems = getLocalItems().filter((i) => i.id !== id);
  saveLocalItems(localItems);

  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('inventory_items').delete().eq('id', id);
    } catch (e) {
      console.error('Supabase delete item error', e);
    }
  }

  return true;
}

// --- STOCK MOVEMENT ENGINE (stock_movements) ---

async function dbRecordStockMovement(itemId, movementType, quantityDelta, reason = '') {
  const item = await dbFetchItemById(itemId);
  if (!item) throw new Error('Item not found.');

  const prevQty = item.quantity !== null && item.quantity !== undefined ? Number(item.quantity) : 0;
  let newQty = prevQty;

  if (movementType === 'STOCK_IN') {
    newQty = prevQty + Math.abs(quantityDelta);
  } else if (movementType === 'STOCK_OUT') {
    newQty = Math.max(0, prevQty - Math.abs(quantityDelta));
  } else if (movementType === 'STOCK_ADJUSTMENT') {
    newQty = Math.max(0, Math.abs(quantityDelta));
  }

  // Update Item Quantity
  await dbUpdateInventoryItem(itemId, { quantity: newQty });

  const reasonStr = typeof reason === 'string' ? reason.trim() : (reason !== null && reason !== undefined ? String(reason).trim() : '');

  const movementRecord = {
    id: `30000000-0000-0000-0000-${Date.now().toString().padStart(12, '0')}`,
    inventory_item_id: itemId,
    item_name: item.name,
    movement_type: movementType,
    quantity: Math.abs(quantityDelta),
    previous_quantity: prevQty,
    new_quantity: newQty,
    reason: reasonStr || 'Inventory Update',
    created_at: new Date().toISOString(),
    created_by: 'Admin User',
  };

  const movements = getLocalMovements();
  movements.unshift(movementRecord);
  saveLocalMovements(movements);

  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('stock_movements').insert(movementRecord);
    } catch (e) {
      console.warn('Supabase stock movement insert error', e);
    }
  }

  return movementRecord;
}

async function dbFetchItemMovements(itemId = null) {
  const sb = getSupabase();
  if (sb) {
    try {
      let query = sb.from('stock_movements').select('*').order('created_at', { ascending: false });
      if (itemId) query = query.eq('inventory_item_id', itemId);
      const { data, error } = await query;
      if (!error && data) return data;
    } catch (e) {
      console.warn('Supabase fetch movements error', e);
    }
  }

  const movements = getLocalMovements();
  if (itemId) return movements.filter((m) => m.inventory_item_id === itemId);
  return movements;
}

// --- SEARCH & FILTER ---

async function dbFetchFilteredItems(filters = {}, sortField = 'urgency', sortOrder = 'asc') {
  let items = await dbFetchAllItems();
  const settings = await dbFetchSettings();
  const threshold = settings.low_stock_threshold;

  if (filters.categoryId && filters.categoryId !== 'all') {
    items = items.filter((item) => item.category_id === filters.categoryId);
  }

  if (filters.status && filters.status !== 'all') {
    items = items.filter((item) => {
      const st = getStockStatus(item.quantity, threshold);
      return st.state === filters.status;
    });
  }

  if (filters.searchQuery && filters.searchQuery.trim() !== '') {
    const q = filters.searchQuery.toLowerCase().trim();
    items = items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.barcode && item.barcode.toLowerCase().includes(q)) ||
        (item.category_name || '').toLowerCase().includes(q)
    );
  }

  items.sort((a, b) => {
    if (sortField === 'urgency') {
      const qtyA = a.quantity !== null && a.quantity !== undefined ? Number(a.quantity) : 999999;
      const qtyB = b.quantity !== null && b.quantity !== undefined ? Number(b.quantity) : 999999;
      return qtyA - qtyB;
    }

    if (sortField === 'quantity') {
      const qtyA = a.quantity !== null && a.quantity !== undefined ? Number(a.quantity) : -1;
      const qtyB = b.quantity !== null && b.quantity !== undefined ? Number(b.quantity) : -1;
      return sortOrder === 'asc' ? qtyA - qtyB : qtyB - qtyA;
    }

    if (sortField === 'category') {
      const catA = a.category_name || '';
      const catB = b.category_name || '';
      const cmp = catA.localeCompare(catB);
      return sortOrder === 'asc' ? cmp : -cmp;
    }

    const cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  return items;
}

async function dbFetchSettings() {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.from('settings').select('*').single();
      if (!error && data) return data;
    } catch (e) {
      console.warn('Supabase fetchSettings error', e);
    }
  }
  return getLocalSettings();
}

async function dbUpdateSettings(threshold) {
  const settings = {
    id: DEFAULT_SETTINGS.id,
    low_stock_threshold: Math.max(0, parseInt(threshold, 10) || 0),
    updated_at: new Date().toISOString(),
  };

  saveLocalSettings(settings);

  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('settings').upsert(settings);
    } catch (e) {
      console.error('Supabase updateSettings error', e);
    }
  }

  return settings;
}

async function dbFetchDashboardMetrics() {
  const items = await dbFetchAllItems();
  const settings = await dbFetchSettings();
  const threshold = settings.low_stock_threshold;

  let inStockCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let noDataCount = 0;

  items.forEach((item) => {
    const st = getStockStatus(item.quantity, threshold);
    if (st.state === 'in-stock') inStockCount++;
    else if (st.state === 'low-stock') lowStockCount++;
    else if (st.state === 'out-of-stock') outOfStockCount++;
    else if (st.state === 'no-data') noDataCount++;
  });

  return {
    totalItems: items.length,
    inStockCount,
    lowStockCount,
    outOfStockCount,
    noDataCount,
    lowStockThreshold: threshold,
  };
}

async function dbFetchLowStockItems() {
  const items = await dbFetchAllItems();
  const settings = await dbFetchSettings();
  const threshold = settings.low_stock_threshold;

  const lowStock = items.filter(
    (item) => item.quantity !== null && item.quantity !== undefined && Number(item.quantity) > 0 && Number(item.quantity) <= threshold
  );

  lowStock.sort((a, b) => Number(a.quantity) - Number(b.quantity));
  return lowStock;
}

async function dbFetchOutOfStockItems() {
  const items = await dbFetchAllItems();
  return items.filter((item) => item.quantity !== null && item.quantity !== undefined && Number(item.quantity) === 0);
}

async function dbResetSeedData() {
  const seed = generateSeedItems();
  saveLocalItems(seed);
  saveLocalCategories(SEED_CATEGORIES);
  saveLocalSettings(DEFAULT_SETTINGS);
  saveLocalMovements([]);

  const sb = getSupabase();
  if (sb) {
    try {
      for (const cat of SEED_CATEGORIES) await sb.from('categories').upsert(cat);
      for (const item of seed) await sb.from('inventory_items').upsert(item);
    } catch (e) {
      console.error('Supabase seed reset error', e);
    }
  }
}

function dbSubscribeToChanges(callback) {
  const cleanupFns = [];

  const sb = getSupabase();
  if (sb) {
    const channel = sb
      .channel('public:realtime_erp_v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => callback())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => callback())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => callback())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, () => callback())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => callback())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, () => callback())
      .subscribe();

    cleanupFns.push(() => sb.removeChannel(channel));
  }

  if ('BroadcastChannel' in window) {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    const handler = (msg) => {
      if (
        msg.data &&
        (msg.data.type === 'items_updated' ||
          msg.data.type === 'categories_updated' ||
          msg.data.type === 'settings_updated' ||
          msg.data.type === 'movements_updated' ||
          msg.data.type === 'theme_updated')
      ) {
        callback();
      }
    };
    bc.addEventListener('message', handler);
    cleanupFns.push(() => {
      bc.removeEventListener('message', handler);
      bc.close();
    });
  }

  return () => cleanupFns.forEach((fn) => fn());
}

// --- SALES MANAGEMENT DATABASE ENGINE ---

async function dbGenerateInvoiceNumber() {
  const sales = getLocalSales();
  const nextNum = sales.length + 1;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `INV-${dateStr}-${nextNum.toString().padStart(4, '0')}`;
}

async function dbCreateSale(saleHeader, saleLines) {
  if (!saleLines || saleLines.length === 0) {
    throw new Error('Cannot save sale: No item lines provided.');
  }

  const items = await dbFetchAllItems();
  const validatedLines = [];

  // Step 1: Stock & Price Validation
  for (const line of saleLines) {
    const item = items.find((i) => i.id === line.inventory_item_id);
    if (!item) {
      throw new Error(`Inventory item "${line.item_name_snapshot || 'Unknown'}" not found.`);
    }

    const requestedQty = Number(line.quantity);
    if (isNaN(requestedQty) || requestedQty <= 0) {
      throw new Error(`Invalid quantity for "${item.name}". Must be at least 1.`);
    }

    const priceVal = line.selling_price !== undefined && line.selling_price !== null ? line.selling_price : line.sellingPrice;
    const sellingPrice = Number(priceVal !== undefined && priceVal !== null ? priceVal : 0);

    if (isNaN(sellingPrice) || sellingPrice < 0) {
      throw new Error(`Invalid selling price for "${item.name}". Cannot be negative.`);
    }

    // Stock check
    const currentStock = item.quantity !== null && item.quantity !== undefined ? Number(item.quantity) : 0;
    if (currentStock < requestedQty) {
      throw new Error(`Insufficient Stock for "${item.name}". Available: ${currentStock} PCS, Requested: ${requestedQty} PCS.`);
    }

    validatedLines.push({
      line,
      item,
      currentStock,
      requestedQty,
      sellingPrice
    });
  }

  // Step 2: Deduct Inventory & Record Stock Movements
  const invoiceNumber = saleHeader.invoice_number || (await dbGenerateInvoiceNumber());

  for (const val of validatedLines) {
    const newQty = val.currentStock - val.requestedQty;
    val.item.quantity = newQty;
    val.item.updated_at = new Date().toISOString();

    // Record STOCK_OUT movement
    await dbRecordStockMovement(
      val.item.id,
      'STOCK_OUT',
      val.requestedQty,
      `SALE — Invoice #${invoiceNumber}`
    );
  }

  // Save updated inventory items
  saveLocalItems(items);

  // Step 3: Create Sale Header
  const saleId = `sale-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const newSale = {
    id: saleId,
    invoice_number: invoiceNumber,
    customer_name: saleHeader.customer_name ? saleHeader.customer_name.trim() : 'Walk-in Customer',
    sale_date: saleHeader.sale_date || new Date().toISOString(),
    subtotal: Number(saleHeader.subtotal || 0),
    discount_total: Number(saleHeader.discount_total || 0),
    grand_total: Number(saleHeader.grand_total || 0),
    amount_paid: Number(saleHeader.amount_paid || 0),
    balance: Number(saleHeader.balance || 0),
    payment_method: saleHeader.payment_method || 'Cash',
    notes: saleHeader.notes ? saleHeader.notes.trim() : '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Step 4: Create Sale Line Items Snapshots
  const newSaleItems = validatedLines.map((val) => {
    const l = val.line;
    const discType = l.discount_type || l.discountType || 'fixed';
    const discVal = l.discount_value !== undefined && l.discount_value !== null ? l.discount_value : l.discountValue;
    const lSub = l.line_subtotal !== undefined && l.line_subtotal !== null ? l.line_subtotal : l.lineSubtotal;
    const lTot = l.line_total !== undefined && l.line_total !== null ? l.line_total : l.lineTotal;

    return {
      id: `sitem-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      sale_id: saleId,
      inventory_item_id: val.item.id,
      item_name_snapshot: val.item.name,
      selling_price: val.sellingPrice,
      quantity: val.requestedQty,
      discount_type: discType,
      discount_value: Number(discVal || 0),
      line_subtotal: Number(lSub || 0),
      line_total: Number(lTot || 0),
      created_at: new Date().toISOString()
    };
  });

  // Step 5: Save Sales to Local Storage
  const sales = getLocalSales();
  sales.unshift(newSale);
  saveLocalSales(sales);

  const saleItems = getLocalSaleItems();
  saleItems.push(...newSaleItems);
  saveLocalSaleItems(saleItems);

  // Supabase sync if active
  const sb = getSupabase();
  if (sb) {
    try {
      updateSupabaseSyncBadge('syncing');
      await sb.from('sales').insert(newSale);
      await sb.from('sale_items').insert(newSaleItems);
      updateSupabaseSyncBadge('connected');
    } catch (e) {
      console.warn('Supabase sale sync notice:', e);
      updateSupabaseSyncBadge('connected');
    }
  }

  return { sale: newSale, items: newSaleItems };
}

async function dbFetchSales(searchQuery = '', paymentMethod = '', dateFilter = '') {
  let sales = getLocalSales();
  let saleItems = getLocalSaleItems();

  const sb = getSupabase();
  if (sb) {
    try {
      const { data: remoteSales, error: sErr } = await sb.from('sales').select('*').order('created_at', { ascending: false });
      if (!sErr && remoteSales && remoteSales.length > 0) {
        sales = remoteSales;
        saveLocalSales(sales);
      }

      const { data: remoteItems, error: iErr } = await sb.from('sale_items').select('*');
      if (!iErr && remoteItems && remoteItems.length > 0) {
        saleItems = remoteItems;
        saveLocalSaleItems(saleItems);
      }
    } catch (e) {
      console.warn('Supabase fetchSales notice:', e);
    }
  }

  const query = searchQuery ? searchQuery.trim().toLowerCase() : '';

  return sales.filter((s) => {
    if (paymentMethod && s.payment_method !== paymentMethod) return false;

    if (dateFilter) {
      const sDate = s.sale_date || s.created_at;
      const saleDateStr = new Date(sDate).toISOString().slice(0, 10);
      if (saleDateStr !== dateFilter) return false;
    }

    if (query) {
      const matchInv = (s.invoice_number || '').toLowerCase().includes(query);
      const matchCust = (s.customer_name || '').toLowerCase().includes(query);
      const sItems = saleItems.filter((si) => si.sale_id === s.id);
      const matchItem = sItems.some((si) => (si.item_name_snapshot || '').toLowerCase().includes(query));

      return matchInv || matchCust || matchItem;
    }

    return true;
  });
}

async function dbFetchSaleDetails(saleId) {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data: saleData } = await sb.from('sales').select('*').or(`id.eq.${saleId},invoice_number.eq.${saleId}`).single();
      if (saleData) {
        const { data: itemsData } = await sb.from('sale_items').select('*').eq('sale_id', saleData.id);
        return { sale: saleData, items: itemsData || [] };
      }
    } catch (e) {
      console.warn('Supabase fetchSaleDetails notice:', e);
    }
  }

  const sales = getLocalSales();
  const sale = sales.find((s) => s.id === saleId || s.invoice_number === saleId);
  if (!sale) return null;

  const saleItems = getLocalSaleItems();
  const items = saleItems.filter((si) => si.sale_id === sale.id);

  return { sale, items };
}

async function dbFetchTodaySalesSummary() {
  const sales = await dbFetchSales();
  const todayStr = new Date().toISOString().slice(0, 10);

  const todaySales = sales.filter((s) => {
    const sDate = s.sale_date || s.created_at;
    if (!sDate) return false;
    return new Date(sDate).toISOString().slice(0, 10) === todayStr;
  });

  const todayRevenue = todaySales.reduce((acc, s) => acc + Number(s.grand_total || 0), 0);
  const recentSales = sales.slice(0, 5);

  return {
    todayRevenue,
    todayBillCount: todaySales.length,
    totalSalesCount: sales.length,
    recentSales
  };
}

// --- RAW MATERIALS & SUPPLIES STOCK MODULE CRUD ---

const SEED_RAW_MATERIALS = [
  { id: 'raw-101', name: 'A4 Paper Reams 80gsm', category: 'Paper', unit_cost: 1850, unit_type: 'Reams', quantity: 40, min_threshold: 10, notes: 'White paper reams for printing', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'raw-102', name: 'Duplex Board 300gsm', category: 'Board', unit_cost: 3200, unit_type: 'Reams', quantity: 25, min_threshold: 5, notes: 'Box manufacturing board reams', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'raw-103', name: 'Machine Lubricant Oil 5L', category: 'Oil/Lubricant', unit_cost: 4500, unit_type: 'Cans', quantity: 8, min_threshold: 2, notes: 'Heavy duty machine lubricant oil', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'raw-104', name: 'Offset Black Ink 1kg', category: 'Ink/Chemicals', unit_cost: 2800, unit_type: 'Cans', quantity: 15, min_threshold: 4, notes: 'Black offset printing ink', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

function getLocalRawMaterials() {
  try {
    const raw = localStorage.getItem(LOCAL_RAW_MATERIALS_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_RAW_MATERIALS_KEY, JSON.stringify(SEED_RAW_MATERIALS));
      return SEED_RAW_MATERIALS;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading local raw materials', e);
    return SEED_RAW_MATERIALS;
  }
}

function saveLocalRawMaterials(items) {
  try {
    localStorage.setItem(LOCAL_RAW_MATERIALS_KEY, JSON.stringify(items));
    notifyDatabaseChange('raw_materials');
  } catch (e) {
    console.error('Error saving local raw materials', e);
  }
}

async function dbFetchRawMaterials() {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.from('raw_materials').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        saveLocalRawMaterials(data);
        return data;
      }
    } catch (e) {
      console.warn('Supabase raw_materials fetch notice:', e);
    }
  }
  return getLocalRawMaterials();
}

async function dbAddRawMaterial(payload) {
  const newItem = {
    id: `raw-${Date.now()}`,
    name: payload.name.trim(),
    category: payload.category || 'Paper',
    unit_cost: payload.unit_cost !== undefined && payload.unit_cost !== null ? Number(payload.unit_cost) : 0,
    unit_type: payload.unit_type || 'Reams',
    quantity: payload.quantity !== undefined && payload.quantity !== null ? Number(payload.quantity) : 0,
    min_threshold: payload.min_threshold !== undefined && payload.min_threshold !== null ? Number(payload.min_threshold) : 5,
    notes: payload.notes ? payload.notes.trim() : '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const local = getLocalRawMaterials();
  local.unshift(newItem);
  saveLocalRawMaterials(local);

  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('raw_materials').insert(newItem);
    } catch (e) {
      console.warn('Supabase raw_materials insert notice:', e);
    }
  }

  return newItem;
}

async function dbUpdateRawMaterial(id, payload) {
  const local = getLocalRawMaterials();
  const idx = local.findIndex((i) => i.id === id);
  if (idx === -1) throw new Error('Raw material item not found.');

  const existing = local[idx];
  const updatedItem = {
    ...existing,
    name: payload.name !== undefined ? payload.name.trim() : existing.name,
    category: payload.category !== undefined ? payload.category : existing.category,
    unit_cost: payload.unit_cost !== undefined ? Number(payload.unit_cost) : existing.unit_cost,
    unit_type: payload.unit_type !== undefined ? payload.unit_type : existing.unit_type,
    quantity: payload.quantity !== undefined ? Number(payload.quantity) : existing.quantity,
    min_threshold: payload.min_threshold !== undefined ? Number(payload.min_threshold) : existing.min_threshold,
    notes: payload.notes !== undefined ? payload.notes.trim() : existing.notes,
    updated_at: new Date().toISOString(),
  };

  local[idx] = updatedItem;
  saveLocalRawMaterials(local);

  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('raw_materials').update(updatedItem).eq('id', id);
    } catch (e) {
      console.warn('Supabase raw_materials update notice:', e);
    }
  }

  return updatedItem;
}

async function dbDeleteRawMaterial(id) {
  const local = getLocalRawMaterials().filter((i) => i.id !== id);
  saveLocalRawMaterials(local);

  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from('raw_materials').delete().eq('id', id);
    } catch (e) {
      console.warn('Supabase raw_materials delete notice:', e);
    }
  }

  return true;
}

async function dbAdjustRawMaterialQty(id, type, amount, reason) {
  const local = getLocalRawMaterials();
  const item = local.find((i) => i.id === id);
  if (!item) throw new Error('Material not found');

  let newQty = Number(item.quantity || 0);
  const amt = Number(amount || 0);

  if (type === 'USE' || type === 'STOCK_OUT') {
    newQty = Math.max(0, newQty - amt);
  } else if (type === 'RESTOCK' || type === 'STOCK_IN') {
    newQty += amt;
  } else if (type === 'SET_EXACT') {
    newQty = amt;
  }

  return await dbUpdateRawMaterial(id, { quantity: newQty });
}
