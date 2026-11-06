// セルフレジ（スマホ用）
// 流れ：はじめ → カメラで読み取り → 商品詳細 → カート → 購入 → レシート画像
// カメラの読み取りには html5-qrcode（self.html で読み込み）を使う

const products = getProducts();
const byCode = new Map(products.map(p => [p.code, p]));

let cart = [];          // { code, qty }
let scanner = null;     // Html5Qrcode
let scanning = false;
let current = null;     // 詳細に出している商品
let lastRead = { code: '', at: 0 };
let receiptBlob = null;

const $ = id => document.getElementById(id);

// ---------- 画面の切り替え ----------
function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('is-active', s.id === 'screen-' + name));
  window.scrollTo(0, 0);
  if (name === 'scan') startScanner();
  else stopScanner();
  updateCartBar(name);
}

// ---------- カメラ ----------
async function startScanner() {
  if (scanning) return;
  const errorEl = $('camera-error');
  errorEl.hidden = true;

  if (typeof Html5Qrcode === 'undefined') {
    errorEl.textContent = '読み取りの部品を読み込めませんでした。ネットにつながっているか確認するか、下の欄に番号を入力してください。';
    errorEl.hidden = false;
    return;
  }

  try {
    if (!scanner) {
      const F = Html5QrcodeSupportedFormats;
      scanner = new Html5Qrcode('reader', {
        formatsToSupport: [F.EAN_13, F.QR_CODE],
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      });
    }
    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: 12,
        // 横長の読み取り範囲（バーコード向け）
        qrbox: (w, h) => ({ width: Math.floor(w * 0.8), height: Math.floor(h * 0.3) }),
      },
      onRead,
      () => {} // 読めなかったフレームは無視
    );
    scanning = true;
  } catch (e) {
    errorEl.textContent = 'カメラを使えませんでした。ブラウザの設定でカメラを許可するか、下の欄に番号を入力してください。';
    errorEl.hidden = false;
  }
}

async function stopScanner() {
  if (!scanner || !scanning) return;
  scanning = false;
  try { await scanner.stop(); } catch (e) {}
}

function pauseScanner() {
  if (scanner && scanning) { try { scanner.pause(true); } catch (e) {} }
}

function resumeScanner() {
  if (scanner && scanning) { try { scanner.resume(); } catch (e) {} }
}

function onRead(text) {
  if (!$('detail').hidden) return;
  const code = text.trim();
  // 同じバーコードを続けて読みすぎないように、2秒は同じ番号を無視する
  const now = Date.now();
  if (code === lastRead.code && now - lastRead.at < 2000) return;
  lastRead = { code, at: now };
  handleCode(code);
}

$('manual').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('manual-code');
  const code = input.value.trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  input.value = '';
  input.blur();
  if (code) handleCode(code);
});

function handleCode(code) {
  const p = byCode.get(code);
  if (!p) {
    feedback(false);
    const errorEl = $('camera-error');
    errorEl.textContent = `「${code}」は登録されていない商品です。`;
    errorEl.hidden = false;
    return;
  }
  $('camera-error').hidden = true;
  feedback(true);
  openDetail(p);
}

// ---------- 製品ページ ----------
function openDetail(p) {
  current = p;
  pauseScanner();
  const text = (id, v) => { $(id).textContent = v || ''; };
  const section = (id, has) => { $(id).hidden = !has; };

  $('d-img').innerHTML = p.image
    ? `<img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}">`
    : `<span class="product__ph">${escapeHTML(p.name)}<small>製品画像</small></span>`;
  text('d-cat', p.category);
  text('d-kubun', p.kubun);
  $('d-kubun').hidden = !p.kubun;
  text('d-name', p.name);
  text('d-copy', p.copy || p.text);
  text('d-spec', [p.form, p.volume].filter(Boolean).join('・'));
  text('d-price', yen(p.price));

  text('d-effects', p.effects);
  section('sec-effects', !!p.effects);

  const usage = p.usage || [];
  $('d-usage').innerHTML = usage.map(u => `<tr>
      <td>${escapeHTML(u.who)}</td>
      <td${u.times ? '' : ' colspan="2"'}>${escapeHTML(u.amount)}</td>
      ${u.times ? `<td>${escapeHTML(u.times)}</td>` : ''}
    </tr>`).join('');
  text('d-usage-note', p.usageNote);
  section('sec-usage', usage.length > 0);

  const ing = p.ingredients || [];
  $('d-ingredients').innerHTML = ing.map(i =>
    `<tr><td>${escapeHTML(i.name)}</td><td class="num">${escapeHTML(i.amount)}</td></tr>`).join('');
  text('d-per', p.ingredientsPer ? `（${p.ingredientsPer}）` : '');
  section('sec-ingredients', ing.length > 0);

  const cautions = p.cautions || [];
  $('d-cautions').innerHTML = cautions.map(c => `<li>${escapeHTML(c)}</li>`).join('');
  section('sec-cautions', cautions.length > 0);

  text('d-storage', p.storage);
  section('sec-storage', !!p.storage);

  $('detail').hidden = false;
  $('detail').scrollTop = 0;
  document.body.classList.add('is-locked');
}

function closeDetail() {
  $('detail').hidden = true;
  document.body.classList.remove('is-locked');
  current = null;
  resumeScanner();
}

$('d-close').addEventListener('click', closeDetail);

// 1つずつカートに入れる（個数はカート画面で変えられる）
$('d-add').addEventListener('click', () => {
  const line = cart.find(l => l.code === current.code);
  if (line) line.qty++;
  else cart.push({ code: current.code, qty: 1 });
  closeDetail();
  updateCartBar('scan');
  const bar = $('cartbar');
  bar.classList.remove('is-bump');
  void bar.offsetWidth;
  bar.classList.add('is-bump');
});

// ---------- カート ----------
function totals() {
  let count = 0, total = 0;
  cart.forEach(l => { count += l.qty; total += byCode.get(l.code).price * l.qty; });
  return { count, total };
}

function updateCartBar(screen) {
  const { count, total } = totals();
  $('bar-count').textContent = count;
  $('bar-total').textContent = yen(total);
  $('cartbar').hidden = !(screen === 'scan' && count > 0);
}

function renderCart() {
  const list = $('cart-list');
  if (!cart.length) {
    list.innerHTML = '<li class="s-cart__empty">カートは空です</li>';
  } else {
    list.innerHTML = cart.map(l => {
      const p = byCode.get(l.code);
      return `<li>
        <span class="s-cart__name">${escapeHTML(p.name)}</span>
        <span class="s-cart__sum">${yen(p.price * l.qty)}</span>
        <span class="s-cart__ctrl">
          <button type="button" data-code="${l.code}" data-step="-1" aria-label="1つ減らす">−</button>
          ${l.qty}個
          <button type="button" data-code="${l.code}" data-step="1" aria-label="1つ増やす">＋</button>
          ${yen(p.price)}
        </span>
      </li>`;
    }).join('');
  }
  const { count, total } = totals();
  $('cart-count').textContent = count;
  $('cart-total').textContent = yen(total);
  $('buy').disabled = count === 0;
}

$('cart-list').addEventListener('click', e => {
  const btn = e.target.closest('button[data-code]');
  if (!btn) return;
  const line = cart.find(l => l.code === btn.dataset.code);
  line.qty += Number(btn.dataset.step);
  cart = cart.filter(l => l.qty > 0);
  renderCart();
});

$('cartbar').addEventListener('click', () => { renderCart(); show('cart'); });
$('back-scan').addEventListener('click', () => show('scan'));
$('start').addEventListener('click', () => {
  // iPhone では、ボタンを押したタイミングで音を準備しておかないと鳴らない
  try { audioCtx = audioCtx || new AudioContext(); audioCtx.resume(); } catch (e) {}
  show('scan');
});

// ---------- 購入 ----------
$('buy').addEventListener('click', async () => {
  const btn = $('buy');
  btn.disabled = true;
  const { count, total } = totals();
  const now = new Date();
  const R = window.RECEIPT || {};
  const no = makeReceiptNo(R.selfNo || '0003', now); // 記録する前に番号を決める
  const items = cart.map(l => {
    const p = byCode.get(l.code);
    return { code: p.code, name: p.name, category: p.category, price: p.price, qty: l.qty };
  });

  addSale({ no, date: now.toISOString(), items, total, source: 'セルフレジ' });

  const canvas = await drawReceipt({ no, now, items, count, total });
  $('receipt-img').src = canvas.toDataURL('image/png');
  receiptBlob = await new Promise(r => canvas.toBlob(r, 'image/png'));

  const text = `ソシアル製薬のセルフレジで${count}点お買い物しました（${yen(total)}）`;
  const params = new URLSearchParams({ text, url: window.SITE_URL || '', hashtags: window.SHARE_HASHTAG || '' });
  $('post-x').href = 'https://x.com/intent/tweet?' + params.toString();

  cart = [];
  btn.disabled = false;
  show('receipt');
});

$('again').addEventListener('click', () => show('scan'));

// ---------- レシート画像を描く（PCレジのレシートと同じレイアウト） ----------
const RECEIPT_FONT = '"BIZ UDGothic", "Hiragino Kaku Gothic ProN", "Yu Gothic", monospace';

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function drawReceipt({ no, now, items, count, total }) {
  const R = window.RECEIPT || {};
  // 文字と画像がそろってから描く（そろわなくても代わりのもので描く）
  try {
    await Promise.race([
      Promise.all([document.fonts.load(`13px ${RECEIPT_FONT}`), document.fonts.load(`bold 13px ${RECEIPT_FONT}`)]),
      new Promise(r => setTimeout(r, 1500)),
    ]);
  } catch (e) {}
  const logo = await loadImage('receipt-logo.png');

  const W = 340, pad = 22, lh = 20;
  const lines = items.reduce((n, i) => n + (i.qty > 1 ? 2 : 1), 0);
  const H = 610 + lines * lh;
  const scale = 3; // 高解像度で描く

  const c = document.createElement('canvas');
  c.width = W * scale;
  c.height = H * scale;
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.textBaseline = 'alphabetic';

  const ink = '#2b2b2b', light = '#6b6b6b', main = '#e8743b', dark = '#b5501c';
  const font = (size, bold) => `${bold ? 'bold ' : ''}${size}px ${RECEIPT_FONT}`;
  const row = (l, r, y, opt = {}) => {
    g.fillStyle = opt.color || ink;
    g.font = font(opt.size || 13, opt.bold);
    g.textAlign = 'left';
    g.fillText(opt.fitW ? fit(g, l, opt.fitW) : l, pad + (opt.indent || 0), y);
    g.textAlign = 'right';
    g.fillText(r, W - pad, y);
  };

  // 紙と上のギザギザ
  g.fillStyle = '#fffdf9';
  g.fillRect(0, 0, W, H);
  g.fillStyle = main;
  for (let x = -8; x < W; x += 12) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 6, 0); g.lineTo(x + 14, 8); g.lineTo(x + 8, 8); g.fill();
  }

  // ロゴ
  let y = 34;
  if (logo) {
    const lw = 200, lhgt = lw * logo.height / logo.width;
    g.drawImage(logo, (W - lw) / 2, y, lw, lhgt);
    y += lhgt + 26;
  } else {
    g.fillStyle = main; g.font = font(30, true); g.textAlign = 'center';
    g.fillText('ソシアル製薬', W / 2, y + 30);
    y += 60;
  }

  // 店舗情報
  const d = receiptDate(now);
  g.fillStyle = ink; g.font = font(13); g.textAlign = 'left';
  g.fillText(`${R.company || ''}　${R.store || ''}`, pad, y); y += lh;
  g.fillText(`電話番号 ${R.tel || ''}`, pad, y); y += lh;
  g.fillText('いつもお買い上げ有難うございます', pad, y); y += lh;
  row('店No:' + (R.storeNo || ''), 'セルフレジNo:' + (R.selfNo || ''), y); y += lh;
  row(d.day, d.time, y); y += 34;

  // 領収証
  g.fillStyle = dark; g.font = font(16, true); g.textAlign = 'center';
  g.save();
  if ('letterSpacing' in g) g.letterSpacing = '8px';
  g.fillText('領収証', W / 2 + 4, y);
  g.restore();
  g.strokeStyle = main; g.lineWidth = 1;
  g.beginPath(); g.moveTo(pad, y - 6); g.lineTo(W / 2 - 50, y - 6); g.moveTo(W / 2 + 50, y - 6); g.lineTo(W - pad, y - 6); g.stroke();
  y += 28;

  // 明細
  items.forEach(i => {
    row(deptCode(i.category, products) + i.name, yen(i.price * i.qty), y, { fitW: W - pad * 2 - 80 });
    y += lh;
    if (i.qty > 1) {
      row(`（${i.qty}コ×単${i.price.toLocaleString('ja-JP')}）`, '', y, { indent: 26, color: light });
      y += lh;
    }
  });

  dashed(g, pad, W - pad, y - 6, '#8a8a8a');
  y += 14;
  row(`小計　　${count}点`, yen(total), y); y += 32;
  row('合計', yen(total), y, { size: 26, bold: true, color: dark }); y += 24;
  row('（内、消費税等', yen(innerTax(total)) + '）', y); y += 26;
  row(R.payment || '', yen(total), y); y += lh;
  row('お釣り', '¥0', y); y += 22;

  // お薬メモ
  const boxH = 70;
  g.strokeStyle = main; g.lineWidth = 1;
  roundRect(g, pad, y, W - pad * 2, boxH, 4);
  g.fillStyle = dark; g.font = font(13, true); g.textAlign = 'left';
  g.fillText('お薬メモ', pad + 12, y + 22);
  g.fillStyle = ink; g.font = font(12);
  g.fillText('用法・用量を守って正しくお使いください。', pad + 12, y + 42);
  g.fillText('症状が続くときは、医師・薬剤師にご相談ください。', pad + 12, y + 59);
  y += boxH + 18;

  // 飾りのバーコードとレシート番号
  const bars = receiptBars(no);
  const bw = bars.reduce((a, b) => a + b, 0);
  let x = (W - bw) / 2;
  g.fillStyle = ink;
  bars.forEach((w, i) => { if (i % 2 === 0) g.fillRect(x, y, w, 44); x += w; });
  y += 60;
  g.font = font(12); g.textAlign = 'center';
  g.fillText(no, W / 2, y); y += 26;
  g.fillStyle = light; g.font = font(11);
  g.fillText('この作品の会社・商品はすべて架空です', W / 2, y);

  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.stroke();
}

function dashed(g, x1, x2, y, color) {
  g.save();
  g.strokeStyle = color;
  g.setLineDash([4, 4]);
  g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke();
  g.restore();
}

// 長い商品名は幅に収まるように省略する
function fit(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  while (text.length && g.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}

// ---------- 保存・シェア ----------
$('share').addEventListener('click', async () => {
  if (!receiptBlob) return;
  const file = new File([receiptBlob], 'soshial-receipt.png', { type: 'image/png' });
  const tag = window.SHARE_HASHTAG ? ' #' + window.SHARE_HASHTAG : '';
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: 'ソシアル製薬のセルフレジでお買い物しました' + tag });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return; // シェアをやめたとき
  }
  // シェアできない端末では、画像をダウンロードする
  const a = document.createElement('a');
  a.href = URL.createObjectURL(receiptBlob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- 読み取ったときの音と振動 ----------
let audioCtx;
function feedback(ok) {
  try { if (navigator.vibrate) navigator.vibrate(ok ? 60 : [80, 60, 80]); } catch (e) {}
  try {
    audioCtx = audioCtx || new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = ok ? 2400 : 400;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + (ok ? 0.08 : 0.3));
  } catch (e) {}
}
