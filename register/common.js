// レジ・商品登録・バーコード一覧で共通に使う処理
// ・商品データはブラウザ（localStorage）に保存する。
//   保存がないときは products.js の初期データを使う
// ・ファイルを直接開いても（file://）動くように、fetch は使わない

const STORAGE_KEY = 'soshial-register-products';
const SALES_KEY = 'soshial-register-sales';

// ---------- 保存まわり（保存できない環境でも止まらないように try/catch） ----------
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

function getProducts() {
  const saved = loadJSON(STORAGE_KEY, null);
  return Array.isArray(saved) ? saved : structuredClone(window.DEFAULT_PRODUCTS);
}

function saveProducts(list) {
  return saveJSON(STORAGE_KEY, list);
}

function resetProducts() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

function getSales() {
  return loadJSON(SALES_KEY, []);
}

// 売上を記録する。sale = { no, date, items: [{code,name,price,qty}], total, source }
// 端末の中に残し、GAS の URL が設定されていればスプレッドシートにも送る
function addSale(sale) {
  const sales = getSales();
  sales.push(sale);
  saveJSON(SALES_KEY, sales);
  sendSale(sale);
}

function sendSale(sale) {
  const url = window.SALES_ENDPOINT;
  if (!url) return;
  try {
    // text/plain で送ると、GAS 側で CORS の事前確認が起きずに受け取れる
    fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(sale),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {}
}

function clearSales() {
  try { localStorage.removeItem(SALES_KEY); } catch (e) {}
}

// ---------- 表示用 ----------
function yen(n) {
  return '¥' + Number(n).toLocaleString('ja-JP');
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// ---------- バーコード（JAN / EAN-13） ----------
// 12桁からチェックデジット（13桁目）を計算する
function checkDigit(d12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

function isValidEAN13(code) {
  return /^\d{13}$/.test(code) && checkDigit(code.slice(0, 12)) === code[12];
}

// 使われていない次の番号（20 から始まる店舗内専用コード）を作る
function nextCode(products) {
  let max = 0;
  products.forEach(p => {
    if (/^2000000\d{6}$/.test(p.code)) max = Math.max(max, Number(p.code.slice(7, 12)));
  });
  const d12 = '2000000' + String(max + 1).padStart(5, '0');
  return d12 + checkDigit(d12);
}

// EAN-13 を SVG の文字列にする（ライブラリなしで描く）
const EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const EAN_R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const EAN_PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

function barcodeSVG(code) {
  if (!isValidEAN13(code)) return '<p class="barcode-error">番号が正しくありません</p>';

  const parity = EAN_PARITY[Number(code[0])];
  let bits = '101';
  for (let i = 1; i <= 6; i++) {
    const d = Number(code[i]);
    bits += parity[i - 1] === 'L' ? EAN_L[d] : EAN_G[d];
  }
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += EAN_R[Number(code[i])];
  bits += '101';

  // 左右に余白（クワイエットゾーン）を取る。1モジュール = 1単位
  const quiet = 11;
  const width = bits.length + quiet * 2;
  const barH = 60;
  const guardH = 66;
  const guards = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);

  let rects = '';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      const h = guards.has(i) ? guardH : barH;
      rects += `<rect x="${quiet + i}" y="0" width="1" height="${h}"/>`;
    }
  }

  const font = 'font-family="OCR-B, Consolas, monospace" font-size="9"';
  const text =
    `<text x="${quiet - 7}" y="74" ${font}>${code[0]}</text>` +
    `<text x="${quiet + 24}" y="74" ${font} text-anchor="middle" letter-spacing="1.6">${code.slice(1, 7)}</text>` +
    `<text x="${quiet + 70}" y="74" ${font} text-anchor="middle" letter-spacing="1.6">${code.slice(7)}</text>`;

  return `<svg class="barcode" viewBox="0 0 ${width} 78" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="バーコード ${code}">` +
    `<rect width="${width}" height="78" fill="#fff"/><g fill="#000">${rects}${text}</g></svg>`;
}

// ---------- レシート ----------
// 部門コード：カテゴリーごとに 101, 102 … を割り振る（商品データに並んだ順）
function deptCode(category, products) {
  const cats = [];
  products.forEach(p => { if (!cats.includes(p.category)) cats.push(p.category); });
  const i = cats.indexOf(category);
  return String(101 + (i < 0 ? cats.length : i));
}

// レシート番号：店No-レジNo-日付-その日のこの端末での通し番号
function makeReceiptNo(regNo, date) {
  const R = window.RECEIPT || {};
  const ymd = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
  const today = date.toDateString();
  const count = getSales().filter(s => new Date(s.date).toDateString() === today).length + 1;
  return [R.storeNo || '0001', regNo, ymd, String(count).padStart(4, '0')].join('-');
}

// 「2026年11月06日(金)」「18時07分」
function receiptDate(date) {
  const w = '日月火水木金土'[date.getDay()];
  const p = n => String(n).padStart(2, '0');
  return {
    day: `${date.getFullYear()}年${p(date.getMonth() + 1)}月${p(date.getDate())}日(${w})`,
    time: `${p(date.getHours())}時${p(date.getMinutes())}分`,
  };
}

// 税込合計に含まれる消費税（10%）
function innerTax(total) {
  return Math.floor(total * 10 / 110);
}

// 飾りのバーコード（レシート番号から模様を作る。読み取りはできない）
function receiptBars(no) {
  const bars = [];
  let seed = 0;
  for (const c of no) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  for (let i = 0; i < 46; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    bars.push(1 + (seed >>> 16) % 3);       // 線の太さ
    bars.push(1 + (seed >>> 20) % 3);       // すき間
  }
  return bars;
}
