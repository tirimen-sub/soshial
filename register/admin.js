// 商品登録画面：商品の追加・編集・削除、データの書き出し・読み込み、売上の確認

let products = getProducts();
let editingCode = null; // 編集中の商品の番号（新規のときは null）

const form = document.getElementById('form');
const f = {
  code: document.getElementById('f-code'),
  name: document.getElementById('f-name'),
  category: document.getElementById('f-category'),
  price: document.getElementById('f-price'),
  text: document.getElementById('f-text'),
  kubun: document.getElementById('f-kubun'),
  copy: document.getElementById('f-copy'),
  form: document.getElementById('f-form'),
  volume: document.getElementById('f-volume'),
  effects: document.getElementById('f-effects'),
  usage: document.getElementById('f-usage'),
  usageNote: document.getElementById('f-usage-note'),
  ingredientsPer: document.getElementById('f-per'),
  image: document.getElementById('f-image'),
  ingredients: document.getElementById('f-ingredients'),
  cautions: document.getElementById('f-cautions'),
  storage: document.getElementById('f-storage'),
};

// 「A｜B｜C」の行 ⇔ オブジェクトの配列（半角の | でも区切れる）
function linesToRows(text, keys) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split(/[｜|]/).map(x => x.trim());
    const row = {};
    keys.forEach((k, i) => { row[k] = parts[i] || ''; });
    return row;
  });
}
function rowsToLines(rows, keys) {
  return (rows || []).map(r => keys.map(k => r[k] || '').join('｜').replace(/｜+$/, '')).join('\n');
}
const USAGE_KEYS = ['who', 'amount', 'times'];
const ING_KEYS = ['name', 'amount'];
const msg = document.getElementById('msg');
const rows = document.getElementById('rows');
const submitBtn = document.getElementById('submit');
const cancelBtn = document.getElementById('cancel');
const formTitle = document.getElementById('form-title');

// ---------- 一覧 ----------
function render() {
  document.getElementById('product-count').textContent = products.length;
  rows.innerHTML = products.map(p => `
    <tr class="${p.code === editingCode ? 'is-editing' : ''}">
      <td class="code">${escapeHTML(p.code)}</td>
      <td>${escapeHTML(p.name)}</td>
      <td>${escapeHTML(p.category)}</td>
      <td class="num">${yen(p.price)}</td>
      <td class="cell-actions">
        <button class="btn btn--small" type="button" data-edit="${escapeHTML(p.code)}">編集</button>
        <button class="btn btn--small btn--danger" type="button" data-delete="${escapeHTML(p.code)}">削除</button>
      </td>
    </tr>`).join('');

  // カテゴリーの入力候補
  const cats = [...new Set(products.map(p => p.category))];
  document.getElementById('category-list').innerHTML =
    cats.map(c => `<option value="${escapeHTML(c)}">`).join('');

  renderSales();
}

function persist() {
  if (!saveProducts(products)) {
    showMsg('このブラウザでは保存できませんでした。書き出しでファイルに残してください。', true);
  }
  // ---------- 全体の集計（GAS） ----------
if (window.SALES_ENDPOINT) {
  document.getElementById('remote').hidden = false;
  document.getElementById('remote-load').addEventListener('click', loadRemote);
}

async function loadRemote() {
  const msgEl = document.getElementById('remote-msg');
  msgEl.textContent = '読み込み中…';
  try {
    const res = await fetch(window.SALES_ENDPOINT);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    document.getElementById('remote-count').textContent = data.receipts;
    document.getElementById('remote-total').textContent = yen(data.total);
    document.getElementById('remote-ranking').innerHTML = data.ranking.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHTML(r.name)}</td>
        <td class="num">${r.qty}個</td>
        <td class="num">${yen(r.amount)}</td>
      </tr>`).join('') || '<tr><td colspan="4">まだ記録がありません</td></tr>';
    msgEl.textContent = new Date().toLocaleTimeString('ja-JP') + ' 時点';
  } catch (e) {
    msgEl.textContent = '読み込めませんでした。config.js の URL と GAS のデプロイ設定を確認してください。';
  }
}

render();
}

function showMsg(text, isError) {
  msg.textContent = text;
  msg.classList.toggle('is-error', !!isError);
}

// ---------- 追加・編集 ----------
document.getElementById('new-code').addEventListener('click', () => {
  f.code.value = nextCode(products);
  f.name.focus();
});

// スキャナーで既存のバーコードを読んだときに、Enter でフォームが送られないようにする
f.code.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    f.name.focus();
  }
});

form.addEventListener('submit', e => {
  e.preventDefault();
  const item = {
    code: f.code.value.trim(),
    name: f.name.value.trim(),
    category: f.category.value.trim(),
    price: Math.round(Number(f.price.value)),
    text: f.text.value.trim(),
    kubun: f.kubun.value.trim(),
    copy: f.copy.value.trim(),
    form: f.form.value.trim(),
    volume: f.volume.value.trim(),
    effects: f.effects.value.trim(),
    usage: linesToRows(f.usage.value, USAGE_KEYS),
    usageNote: f.usageNote.value.trim(),
    ingredientsPer: f.ingredientsPer.value.trim(),
    ingredients: linesToRows(f.ingredients.value, ING_KEYS),
    cautions: f.cautions.value.split('\n').map(l => l.trim()).filter(Boolean),
    storage: f.storage.value.trim(),
  };
  if (f.image.value.trim()) item.image = f.image.value.trim();

  if (!/^\d{13}$/.test(item.code)) return showMsg('バーコード番号は13桁の数字にしてください。', true);
  if (!isValidEAN13(item.code)) {
    return showMsg(`最後の1桁（チェックデジット）が合いません。${item.code.slice(0, 12)}${checkDigit(item.code.slice(0, 12))} なら読み取れます。`, true);
  }
  const dup = products.find(p => p.code === item.code);
  if (dup && item.code !== editingCode) return showMsg(`この番号は「${dup.name}」で使われています。`, true);

  if (editingCode) {
    const i = products.findIndex(p => p.code === editingCode);
    products[i] = item;
    showMsg(`「${item.name}」を更新しました。`);
  } else {
    products.push(item);
    showMsg(`「${item.name}」を追加しました。`);
  }
  endEdit();
  persist();
});

function startEdit(code) {
  const p = products.find(p => p.code === code);
  editingCode = code;
  f.code.value = p.code;
  f.name.value = p.name;
  f.category.value = p.category;
  f.price.value = p.price;
  f.text.value = p.text || '';
  ['kubun', 'copy', 'form', 'volume', 'effects', 'usageNote', 'ingredientsPer', 'image', 'storage']
    .forEach(k => { f[k].value = p[k] || ''; });
  f.usage.value = rowsToLines(p.usage, USAGE_KEYS);
  f.ingredients.value = rowsToLines(p.ingredients, ING_KEYS);
  f.cautions.value = (p.cautions || []).join('\n');
  formTitle.textContent = '商品を編集';
  submitBtn.textContent = '更新する';
  cancelBtn.hidden = false;
  showMsg('');
  // ---------- 全体の集計（GAS） ----------
if (window.SALES_ENDPOINT) {
  document.getElementById('remote').hidden = false;
  document.getElementById('remote-load').addEventListener('click', loadRemote);
}

async function loadRemote() {
  const msgEl = document.getElementById('remote-msg');
  msgEl.textContent = '読み込み中…';
  try {
    const res = await fetch(window.SALES_ENDPOINT);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    document.getElementById('remote-count').textContent = data.receipts;
    document.getElementById('remote-total').textContent = yen(data.total);
    document.getElementById('remote-ranking').innerHTML = data.ranking.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHTML(r.name)}</td>
        <td class="num">${r.qty}個</td>
        <td class="num">${yen(r.amount)}</td>
      </tr>`).join('') || '<tr><td colspan="4">まだ記録がありません</td></tr>';
    msgEl.textContent = new Date().toLocaleTimeString('ja-JP') + ' 時点';
  } catch (e) {
    msgEl.textContent = '読み込めませんでした。config.js の URL と GAS のデプロイ設定を確認してください。';
  }
}

render();
  form.scrollIntoView({ behavior: 'smooth' });
  f.name.focus();
}

function endEdit() {
  editingCode = null;
  form.reset();
  formTitle.textContent = '商品を追加';
  submitBtn.textContent = '追加する';
  cancelBtn.hidden = true;
}

cancelBtn.addEventListener('click', () => {
  endEdit();
  showMsg('');
  // ---------- 全体の集計（GAS） ----------
if (window.SALES_ENDPOINT) {
  document.getElementById('remote').hidden = false;
  document.getElementById('remote-load').addEventListener('click', loadRemote);
}

async function loadRemote() {
  const msgEl = document.getElementById('remote-msg');
  msgEl.textContent = '読み込み中…';
  try {
    const res = await fetch(window.SALES_ENDPOINT);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    document.getElementById('remote-count').textContent = data.receipts;
    document.getElementById('remote-total').textContent = yen(data.total);
    document.getElementById('remote-ranking').innerHTML = data.ranking.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHTML(r.name)}</td>
        <td class="num">${r.qty}個</td>
        <td class="num">${yen(r.amount)}</td>
      </tr>`).join('') || '<tr><td colspan="4">まだ記録がありません</td></tr>';
    msgEl.textContent = new Date().toLocaleTimeString('ja-JP') + ' 時点';
  } catch (e) {
    msgEl.textContent = '読み込めませんでした。config.js の URL と GAS のデプロイ設定を確認してください。';
  }
}

render();
});

rows.addEventListener('click', e => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-delete]');
  if (edit) startEdit(edit.dataset.edit);
  if (del) {
    const p = products.find(p => p.code === del.dataset.delete);
    if (!confirm(`「${p.name}」を削除しますか？`)) return;
    products = products.filter(x => x.code !== p.code);
    if (editingCode === p.code) endEdit();
    persist();
  }
});

// ---------- 書き出し・読み込み ----------
function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.getElementById('export').addEventListener('click', () => {
  const body = JSON.stringify(products, null, 2).slice(2, -2);
  const text =
    '// 商品データ（商品登録画面から書き出したもの）\n' +
    '// register フォルダの products.js と入れ替えると、初期データになる\n' +
    'window.DEFAULT_PRODUCTS = [\n' + body + '\n];\n';
  download('products.js', text, 'text/javascript');
});

document.getElementById('import').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const list = parseProducts(await file.text());
    if (!confirm(`${list.length}件の商品を読み込みます。いまの商品はすべて置き換わります。よろしいですか？`)) return;
    products = list;
    endEdit();
    persist();
    showMsg(`${list.length}件を読み込みました。`);
  } catch (err) {
    alert('読み込めませんでした。書き出した products.js か JSON ファイルを選んでください。');
  }
});

// products.js（window.DEFAULT_PRODUCTS = [...]）でも、ただの JSON でも読めるようにする
function parseProducts(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  let arr = text.slice(start, end + 1);
  let list;
  try {
    list = JSON.parse(arr);
  } catch (e) {
    // 手で書いた products.js（キーに "" がない形）にも対応する
    arr = arr.replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":').replace(/,\s*([\]}])/g, '$1');
    list = JSON.parse(arr);
  }
  if (!Array.isArray(list)) throw new Error('not array');
  return list.map(p => ({
    ...p, // 製品ページ用の項目（用法・用量など）もそのまま残す
    code: String(p.code),
    name: String(p.name),
    category: String(p.category || ''),
    price: Number(p.price) || 0,
    text: String(p.text || ''),
  }));
}

document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('登録した内容を消して、初期データ（products.js）に戻しますか？')) return;
  resetProducts();
  products = getProducts();
  endEdit();
  showMsg('初期データに戻しました。');
  // ---------- 全体の集計（GAS） ----------
if (window.SALES_ENDPOINT) {
  document.getElementById('remote').hidden = false;
  document.getElementById('remote-load').addEventListener('click', loadRemote);
}

async function loadRemote() {
  const msgEl = document.getElementById('remote-msg');
  msgEl.textContent = '読み込み中…';
  try {
    const res = await fetch(window.SALES_ENDPOINT);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    document.getElementById('remote-count').textContent = data.receipts;
    document.getElementById('remote-total').textContent = yen(data.total);
    document.getElementById('remote-ranking').innerHTML = data.ranking.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHTML(r.name)}</td>
        <td class="num">${r.qty}個</td>
        <td class="num">${yen(r.amount)}</td>
      </tr>`).join('') || '<tr><td colspan="4">まだ記録がありません</td></tr>';
    msgEl.textContent = new Date().toLocaleTimeString('ja-JP') + ' 時点';
  } catch (e) {
    msgEl.textContent = '読み込めませんでした。config.js の URL と GAS のデプロイ設定を確認してください。';
  }
}

render();
});

// ---------- 売上 ----------
function renderSales() {
  const sales = getSales();
  let total = 0, items = 0;
  sales.forEach(s => {
    total += s.total;
    s.items.forEach(i => { items += i.qty; });
  });
  document.getElementById('sales-count').textContent = sales.length;
  document.getElementById('sales-total').textContent = yen(total);
  document.getElementById('sales-items').textContent = items;

  // 商品ごとの販売数ランキング（売れていない商品も0個として出す）
  const stats = new Map(products.map(p => [p.code, { name: p.name, category: p.category, qty: 0, amount: 0 }]));
  sales.forEach(s => s.items.forEach(i => {
    if (!stats.has(i.code)) stats.set(i.code, { name: i.name + '（登録外）', category: '', qty: 0, amount: 0 });
    const st = stats.get(i.code);
    st.qty += i.qty;
    st.amount += i.price * i.qty;
  }));
  const list = [...stats.values()].sort((a, b) => b.qty - a.qty || b.amount - a.amount);
  document.getElementById('ranking').innerHTML = list.map((st, i) => `
    <tr>
      <td>${st.qty ? i + 1 : '-'}</td>
      <td>${escapeHTML(st.name)}</td>
      <td>${escapeHTML(st.category)}</td>
      <td class="num">${st.qty}個</td>
      <td class="num">${yen(st.amount)}</td>
    </tr>`).join('');
}

document.getElementById('sales-csv').addEventListener('click', () => {
  const sales = getSales();
  if (!sales.length) return alert('まだ売上の記録がありません。');
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const lines = [['レシートNo', '日時', 'バーコード番号', '商品名', '単価', '数量', '小計'].map(q).join(',')];
  sales.forEach(s => {
    const date = new Date(s.date).toLocaleString('ja-JP');
    s.items.forEach(i => {
      lines.push([s.no, date, i.code, i.name, i.price, i.qty, i.price * i.qty].map(q).join(','));
    });
  });
  // 先頭の BOM で、Excel で開いても文字化けしないようにする
  download('sales.csv', '﻿' + lines.join('\r\n'), 'text/csv');
});

document.getElementById('sales-clear').addEventListener('click', () => {
  if (!confirm('売上の記録をすべて消しますか？（元に戻せません）')) return;
  clearSales();
  renderSales();
});

// ---------- 全体の集計（GAS） ----------
if (window.SALES_ENDPOINT) {
  document.getElementById('remote').hidden = false;
  document.getElementById('remote-load').addEventListener('click', loadRemote);
}

async function loadRemote() {
  const msgEl = document.getElementById('remote-msg');
  msgEl.textContent = '読み込み中…';
  try {
    const res = await fetch(window.SALES_ENDPOINT);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    document.getElementById('remote-count').textContent = data.receipts;
    document.getElementById('remote-total').textContent = yen(data.total);
    document.getElementById('remote-ranking').innerHTML = data.ranking.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHTML(r.name)}</td>
        <td class="num">${r.qty}個</td>
        <td class="num">${yen(r.amount)}</td>
      </tr>`).join('') || '<tr><td colspan="4">まだ記録がありません</td></tr>';
    msgEl.textContent = new Date().toLocaleTimeString('ja-JP') + ' 時点';
  } catch (e) {
    msgEl.textContent = '読み込めませんでした。config.js の URL と GAS のデプロイ設定を確認してください。';
  }
}

render();
