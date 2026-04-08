// printify.js — Printify API integration for print-on-demand products
// Jarvis creates designs → uploads to Printify → publishes to connected stores (Etsy)

const BASE = 'https://api.printify.com/v1';

function getHeaders() {
  const token = process.env.PRINTIFY_API_KEY;
  if (!token) throw new Error('PRINTIFY_API_KEY not set');
  return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
}

async function api(path, method, body) {
  const res = await fetch(BASE + path, {
    method: method || 'GET',
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Printify API error (' + res.status + '): ' + err);
  }
  return res.json();
}

// ── Shop ──
async function getShops() { return api('/shops.json'); }
async function getShopId() {
  const shops = await getShops();
  if (!shops.length) throw new Error('No Printify shops found — connect Etsy in Printify dashboard');
  return shops[0].id;
}

// ── Catalog ──
async function getCatalog() { return api('/catalog/blueprints.json'); }
async function getBlueprint(blueprintId) { return api('/catalog/blueprints/' + blueprintId + '.json'); }
async function getPrintProviders(blueprintId) { return api('/catalog/blueprints/' + blueprintId + '/print_providers.json'); }
async function getVariants(blueprintId, providerId) { return api('/catalog/blueprints/' + blueprintId + '/print_providers/' + providerId + '/variants.json'); }

// ── Products ──
async function getProducts(shopId) { return api('/shops/' + (shopId || await getShopId()) + '/products.json'); }
async function getProduct(productId, shopId) { return api('/shops/' + (shopId || await getShopId()) + '/products/' + productId + '.json'); }

async function createProduct(productData, shopId) {
  const sid = shopId || await getShopId();
  return api('/shops/' + sid + '/products.json', 'POST', productData);
}

async function publishProduct(productId, shopId) {
  const sid = shopId || await getShopId();
  return api('/shops/' + sid + '/products/' + productId + '/publish.json', 'POST', {
    title: true, description: true, images: true, variants: true, tags: true,
  });
}

async function deleteProduct(productId, shopId) {
  const sid = shopId || await getShopId();
  return api('/shops/' + sid + '/products/' + productId + '.json', 'DELETE');
}

// ── Image Upload ──
async function uploadImage(fileName, base64Data) {
  return api('/uploads/images.json', 'POST', {
    file_name: fileName,
    contents: base64Data,
  });
}

async function uploadImageFromUrl(fileName, url) {
  return api('/uploads/images.json', 'POST', {
    file_name: fileName,
    url: url,
  });
}

async function getUploads() { return api('/uploads.json'); }

// ── Orders ──
async function getOrders(shopId) { return api('/shops/' + (shopId || await getShopId()) + '/orders.json'); }

// ── High-level: Create a product from scratch ──
// This is the main function agents will use
async function createProductFromDesign(opts) {
  const {
    title,
    description,
    tags,
    imageUrl,        // URL of the design image
    imagePath,       // OR local file path
    blueprintId,     // product type (e.g. 6 = unisex t-shirt)
    printProviderId, // manufacturer (e.g. 99 = Printful)
    variants,        // array of variant IDs
    price,           // price in cents (e.g. 1999 = $19.99)
  } = opts;

  // 1. Upload image
  let imageId;
  if (imageUrl) {
    const upload = await uploadImageFromUrl(title.replace(/[^a-zA-Z0-9]/g, '_') + '.png', imageUrl);
    imageId = upload.id;
  } else if (imagePath) {
    const fs = require('fs');
    const data = fs.readFileSync(imagePath);
    const base64 = data.toString('base64');
    const upload = await uploadImage(title.replace(/[^a-zA-Z0-9]/g, '_') + '.png', base64);
    imageId = upload.id;
  } else {
    throw new Error('Need imageUrl or imagePath');
  }

  console.log('[PRINTIFY] Image uploaded: ' + imageId);

  // 2. Create product
  const product = await createProduct({
    title,
    description: description || title,
    blueprint_id: blueprintId || 6, // default: unisex t-shirt
    print_provider_id: printProviderId || 99, // default: Printful
    variants: (variants || []).map(v => ({
      id: v,
      price: price || 1999,
      is_enabled: true,
    })),
    print_areas: [{
      variant_ids: variants || [],
      placeholders: [{
        position: 'front',
        images: [{
          id: imageId,
          x: 0.5, y: 0.5,
          scale: 1,
          angle: 0,
        }],
      }],
    }],
    tags: tags || [],
  });

  console.log('[PRINTIFY] Product created: ' + product.id);
  return product;
}

// ── Quick stats ──
async function getStats() {
  const shopId = await getShopId();
  const [products, orders] = await Promise.all([
    getProducts(shopId),
    getOrders(shopId),
  ]);
  return {
    shopId,
    totalProducts: products.data?.length || 0,
    totalOrders: orders.data?.length || 0,
    products: (products.data || []).slice(0, 10).map(p => ({ id: p.id, title: p.title, status: p.status })),
    orders: (orders.data || []).slice(0, 10).map(o => ({ id: o.id, status: o.status, total: o.total_price })),
  };
}

// ── Popular blueprints for quick reference ──
const POPULAR_BLUEPRINTS = {
  tshirt: 6,           // Unisex Heavy Cotton Tee
  hoodie: 77,          // Unisex Heavy Blend Hoodie
  mug: 68,             // Mug 11oz
  poster: 282,         // Matte Vertical Posters
  sticker: 400,        // Kiss-Cut Stickers
  tote: 553,           // Cotton Tote Bag
  phonecase: 20,       // iPhone Case
  pillow: 98,          // Spun Polyester Pillow
};

module.exports = {
  getShops, getShopId, getCatalog, getBlueprint, getPrintProviders, getVariants,
  getProducts, getProduct, createProduct, publishProduct, deleteProduct,
  uploadImage, uploadImageFromUrl, getUploads, getOrders,
  createProductFromDesign, getStats,
  POPULAR_BLUEPRINTS,
};
