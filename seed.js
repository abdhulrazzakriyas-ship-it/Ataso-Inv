// Ataso Inventory ERP - Seed Data (Flat Architecture - 126 Initial Stationery Items with Barcodes)

const DEFAULT_SETTINGS = {
  id: '00000000-0000-0000-0000-000000000001',
  low_stock_threshold: 10,
  updated_at: new Date().toISOString(),
};

const SEED_CATEGORIES = [
  { id: '10000000-0000-0000-0000-000000000001', name: 'Exercise A5' },
  { id: '10000000-0000-0000-0000-000000000002', name: 'CR A4' },
  { id: '10000000-0000-0000-0000-000000000003', name: 'B5' },
  { id: '10000000-0000-0000-0000-000000000004', name: 'PR Children’s Ex A5' },
  { id: '10000000-0000-0000-0000-000000000005', name: 'Other Special Books' },
  { id: '10000000-0000-0000-0000-000000000006', name: 'DR BD' },
  { id: '10000000-0000-0000-0000-000000000007', name: 'Paper Items' },
  { id: '10000000-0000-0000-0000-000000000008', name: 'Daily Account & Day Book' },
];

const INITIAL_ITEMS_RAW = [
  {
    categoryId: '10000000-0000-0000-0000-000000000001',
    categoryName: 'Exercise A5',
    items: [
      { name: 'Ex 40P =', barcode: '890123456701' },
      { name: 'Ex 80P =', barcode: '890123456702' },
      { name: 'Ex 120P =', barcode: '890123456703' },
      { name: 'Ex 160P =', barcode: '890123456704' },
      { name: 'Ex 200P =', barcode: '890123456705' },
      { name: 'Ex 400P =', barcode: '890123456706' },
      { name: 'Ex 40P #', barcode: '890123456707' },
      { name: 'Ex 80P #', barcode: '890123456708' },
      { name: 'Ex 120P #', barcode: '890123456709' },
      { name: 'Ex 160P #', barcode: '890123456710' },
      { name: 'Ex 200P #', barcode: '890123456711' },
      { name: 'Ex 400P #', barcode: '890123456712' },
    ]
  },
  {
    categoryId: '10000000-0000-0000-0000-000000000002',
    categoryName: 'CR A4',
    items: [
      { name: 'CR 1 40P =', barcode: '890123456713' },
      { name: 'CR 2 80P =', barcode: '890123456714' },
      { name: 'CR 3 120P =', barcode: '890123456715' },
      { name: 'CR 4 160P =', barcode: '890123456716' },
      { name: 'CR 5 200P =', barcode: '890123456717' },
      { name: 'CR 10 400P =', barcode: '890123456718' },
      { name: 'CR 1 40P #', barcode: '890123456719' },
      { name: 'CR 2 80P #', barcode: '890123456720' },
      { name: 'CR 3 120P #', barcode: '890123456721' },
      { name: 'CR 4 160P #', barcode: '890123456722' },
      { name: 'CR 5 200P #', barcode: '890123456723' },
      { name: 'CR 10 400P #', barcode: '890123456724' },
    ]
  },
  {
    categoryId: '10000000-0000-0000-0000-000000000003',
    categoryName: 'B5',
    items: [
      { name: 'B5 40P =', barcode: '890123456725' },
      { name: 'B5 80P =', barcode: '890123456726' },
      { name: 'B5 120P =', barcode: '890123456727' },
      { name: 'B5 160P =', barcode: '890123456728' },
      { name: 'B5 200P =', barcode: '890123456729' },
      { name: 'B5 40P #', barcode: '890123456730' },
      { name: 'B5 80P #', barcode: '890123456731' },
      { name: 'B5 120P #', barcode: '890123456732' },
      { name: 'B5 160P #', barcode: '890123456733' },
      { name: 'B5 200P #', barcode: '890123456734' },
      { name: 'B5 80P Plain', barcode: '890123456735' },
      { name: 'B5 80P ½”', barcode: '890123456736' },
      { name: 'B5 80P 1”', barcode: '890123456737' },
      { name: 'B5 80P J', barcode: '890123456738' },
      { name: 'B5 120P Plain', barcode: '890123456739' },
      { name: 'B5 120P ½”', barcode: '890123456740' },
      { name: 'B5 120P 1”', barcode: '890123456741' },
      { name: 'B5 120P J', barcode: '890123456742' },
      { name: 'B5 160P Plain', barcode: '890123456743' },
      { name: 'B5 160P ½”', barcode: '890123456744' },
      { name: 'B5 160P 1”', barcode: '890123456745' },
      { name: 'B5 160P J', barcode: '890123456746' },
      { name: 'B5 200P Plain', barcode: '890123456747' },
      { name: 'B5 200P ½”', barcode: '890123456748' },
      { name: 'B5 200P 1”', barcode: '890123456749' },
      { name: 'B5 200P J', barcode: '890123456750' },
    ]
  },
  {
    categoryId: '10000000-0000-0000-0000-000000000004',
    categoryName: 'PR Children’s Ex A5',
    items: [
      { name: 'PR 80P Plain' },
      { name: 'PR 80P ½”' },
      { name: 'PR 80P 1”' },
      { name: 'PR 80P Double Rule' },
      { name: 'PR 80P 4 Rule' },
      { name: 'PR 80P Madu Rule' },
      { name: 'PR 80P J' },
      { name: 'PR 120P Plain' },
      { name: 'PR 120P ½”' },
      { name: 'PR 120P 1”' },
      { name: 'PR 120P Double Rule' },
      { name: 'PR 120P 4 Rule' },
      { name: 'PR 120P Madu Rule' },
      { name: 'PR 120P J' },
      { name: 'PR 160P Plain' },
      { name: 'PR 160P ½”' },
      { name: 'PR 160P 1”' },
      { name: 'PR 160P Double Rule' },
      { name: 'PR 160P 4 Rule' },
      { name: 'PR 160P Madu Rule' },
      { name: 'PR 160P J' },
      { name: 'PR 200P Plain' },
      { name: 'PR 200P ½”' },
      { name: 'PR 200P 1”' },
      { name: 'PR 200P Double Rule' },
      { name: 'PR 200P 4 Rule' },
      { name: 'PR 200P Madu Rule' },
      { name: 'PR 200P J' },
    ]
  },
  {
    categoryId: '10000000-0000-0000-0000-000000000005',
    categoryName: 'Other Special Books',
    items: [
      { name: 'Science Book 40P', barcode: '890123456780' },
      { name: 'Science Book 80P', barcode: '890123456781' },
      { name: 'Science Book 120P' },
      { name: 'Graph Book 40P' },
      { name: 'Graph Book 80P' },
      { name: 'Graph Book 120P' },
      { name: 'World Map Book 40P' },
      { name: 'World Map Book 80P' },
      { name: 'World Map Book 120P' },
      { name: 'SriLanka Map Book 40P' },
      { name: 'SriLanka Map Book 80P' },
      { name: 'SriLanka Map Book 120P' },
      { name: 'Bill Book' },
      { name: 'Bill Book S' },
      { name: 'Bill Book M' },
      { name: 'Bill Book L' },
      { name: 'Bill Book XL' },
      { name: 'Carbon Bill Book S' },
      { name: 'Carbon Bill Book M' },
      { name: 'Carbon Bill Book L' },
      { name: 'Carbon Bill Book XL' },
      { name: 'Field Note 40P' },
      { name: 'Field Note 80P' },
    ]
  },
  {
    categoryId: '10000000-0000-0000-0000-000000000006',
    categoryName: 'DR BD',
    items: [
      { name: 'DR 40P' },
      { name: 'DR 80P' },
      { name: 'DR 120P' },
      { name: 'BD 40P' },
      { name: 'BD 80P' },
      { name: 'BD 120P' },
    ]
  },
  {
    categoryId: '10000000-0000-0000-0000-000000000007',
    categoryName: 'Paper Items',
    items: [
      { name: 'Demy Paper' },
      { name: 'Wrapping Paper' },
      { name: 'Transparent Sheet' },
      { name: 'Brown Paper' },
      { name: 'Tissue Sheet' },
      { name: 'A4 Paper 70GSM' },
      { name: 'A4 Paper 80GSM', barcode: '890123456799' },
      { name: 'Color A4' },
      { name: 'Varnish Paper' },
      { name: 'Exam Paper' },
      { name: 'Fulscap Paper =' },
      { name: 'Fulscap Paper #' },
      { name: 'White Paper' },
      { name: 'Black Paper' },
    ]
  },
  {
    categoryId: '10000000-0000-0000-0000-000000000008',
    categoryName: 'Daily Account & Day Book',
    items: [
      { name: 'Day Book 1' },
      { name: 'Day Book 2' },
      { name: 'Day Book 3' },
      { name: 'Day Book 4' },
      { name: 'Day Book 5' },
    ]
  }
];

function generateSeedItems() {
  const items = [];
  let itemIndex = 1;

  INITIAL_ITEMS_RAW.forEach((group) => {
    group.items.forEach((item) => {
      const paddedId = itemIndex.toString().padStart(12, '0');
      items.push({
        id: `20000000-0000-0000-0000-${paddedId}`,
        category_id: group.categoryId,
        category_name: group.categoryName,
        name: item.name,
        barcode: item.barcode || null,
        ream_cost: null,
        retail_rate: null,
        quantity: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      itemIndex++;
    });
  });

  return items;
}
