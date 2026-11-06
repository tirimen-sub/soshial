// セルフレジ（スマホ用）
// 流れ：はじめ → カメラで読み取り → 商品詳細 → カート → 購入 → レシート画像
// カメラの読み取りには html5-qrcode（self.html で読み込み）を使う

const products = getProducts();
const byCode = new Map(products.map(p => [p.code, p]));

let cart = [];          // { code, qty }
let scanner = null;     // Html5Qrcode
let scanning = false;
let current = null;     // 詳細に出している商品
let detailQty = 1;
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

// ---------- 商品詳細 ----------
function openDetail(p) {
  current = p;
  detailQty = 1;
  pauseScanner();
  $('d-img').innerHTML = p.image ? `<img src="${escapeHTML(p.image)}" alt="">` : '製品画像';
  $('d-cat').textContent = p.category;
  $('d-name').textContent = p.name;
  $('d-text').textContent = p.text || '';
  renderDetail();
  $('detail').hidden = false;
}

function renderDetail() {
  $('d-qty').textContent = detailQty;
  $('d-price').textContent = yen(current.price * detailQty);
  $('d-minus').disabled = detailQty <= 1;
}

function closeDetail() {
  $('detail').hidden = true;
  current = null;
  resumeScanner();
}

$('d-minus').addEventListener('click', () => { if (detailQty > 1) { detailQty--; renderDetail(); } });
$('d-plus').addEventListener('click', () => { if (detailQty < 99) { detailQty++; renderDetail(); } });
$('d-close').addEventListener('click', closeDetail);
$('detail').addEventListener('click', e => { if (e.target.id === 'detail') closeDetail(); });

$('d-add').addEventListener('click', () => {
  const line = cart.find(l => l.code === current.code);
  if (line) line.qty += detailQty;
  else cart.push({ code: current.code, qty: detailQty });
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
  const { count, total } = totals();
  const now = new Date();
  const no = 'S' + now.toISOString().slice(2, 10).replace(/-/g, '') + '-' +
    String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  const items = cart.map(l => {
    const p = byCode.get(l.code);
    return { code: p.code, name: p.name, price: p.price, qty: l.qty };
  });

  addSale({ no, date: now.toISOString(), items, total, source: 'セルフレジ' });

  const canvas = drawReceipt({ no, now, items, count, total });
  $('receipt-img').src = canvas.toDataURL('image/png');
  receiptBlob = await new Promise(r => canvas.toBlob(r, 'image/png'));

  const text = `ソシアル製薬のセルフレジで${count}点お買い物しました（${yen(total)}）`;
  const params = new URLSearchParams({ text, url: window.SITE_URL || '', hashtags: window.SHARE_HASHTAG || '' });
  $('post-x').href = 'https://x.com/intent/tweet?' + params.toString();

  cart = [];
  show('receipt');
});

$('again').addEventListener('click', () => show('scan'));

// ---------- レシート画像を描く ----------
function drawReceipt({ no, now, items, count, total }) {
  const W = 600;
  const pad = 44;
  const lineH = 36;
  const rows = items.reduce((n, i) => n + (i.qty > 1 ? 2 : 1), 0);
  const H = 470 + rows * lineH;

  const c = document.createElement('canvas');
  const scale = 2; // 高解像度で描く
  c.width = W * scale;
  c.height = H * scale;
  const g = c.getContext('2d');
  g.scale(scale, scale);

  const font = '"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
  const main = '#e8743b';
  const ink = '#333';
  const light = '#888';

  // 紙
  g.fillStyle = '#fffdf9';
  g.fillRect(0, 0, W, H);
  // 上下のギザギザ
  g.fillStyle = '#e9e5e1';
  for (let x = 0; x < W; x += 20) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 10, 10); g.lineTo(x + 20, 0); g.fill();
    g.beginPath(); g.moveTo(x, H); g.lineTo(x + 10, H - 10); g.lineTo(x + 20, H); g.fill();
  }

  let y = 76;
  g.textAlign = 'center';
  g.fillStyle = main;
  g.font = `bold 38px ${font}`;
  g.fillText('ソシアル製薬', W / 2, y);
  y += 30;
  g.fillStyle = light;
  g.font = `16px ${font}`;
  g.fillText('SELF CHECKOUT', W / 2, y);
  y += 36;
  g.font = `17px ${font}`;
  g.fillText(now.toLocaleString('ja-JP'), W / 2, y);
  y += 24;
  g.fillText('レシート No.' + no, W / 2, y);

  y += 26;
  dashed(g, pad, W - pad, y, light);
  y += 40;

  g.font = `20px ${font}`;
  items.forEach(i => {
    g.textAlign = 'left';
    g.fillStyle = ink;
    g.fillText(fit(g, i.name, W - pad * 2 - 130), pad, y);
    g.textAlign = 'right';
    g.fillText(yen(i.price * i.qty), W - pad, y);
    y += lineH;
    if (i.qty > 1) {
      g.textAlign = 'left';
      g.fillStyle = light;
      g.font = `17px ${font}`;
      g.fillText(`　${yen(i.price)} × ${i.qty}`, pad, y - 8);
      g.font = `20px ${font}`;
      y += lineH - 8;
    }
  });

  dashed(g, pad, W - pad, y - 12, light);
  y += 26;

  g.fillStyle = ink;
  g.font = `20px ${font}`;
  g.textAlign = 'left';  g.fillText('点数', pad, y);
  g.textAlign = 'right'; g.fillText(count + '点', W - pad, y);
  y += 46;
  g.font = `bold 32px ${font}`;
  g.textAlign = 'left';  g.fillText('合計', pad, y);
  g.textAlign = 'right'; g.fillText(yen(total), W - pad, y);
  y += 30;
  g.fillStyle = light;
  g.font = `17px ${font}`;
  g.textAlign = 'left';  g.fillText('（内消費税 10%）', pad, y);
  g.textAlign = 'right'; g.fillText(yen(Math.floor(total * 10 / 110)), W - pad, y);

  y += 50;
  g.textAlign = 'center';
  g.fillStyle = main;
  g.font = `bold 22px ${font}`;
  g.fillText('お大事にどうぞ', W / 2, y);
  y += 30;
  g.fillStyle = light;
  g.font = `15px ${font}`;
  g.fillText('※ 架空の会社・商品による展示作品です', W / 2, y);

  return c;
}

function dashed(g, x1, x2, y, color) {
  g.save();
  g.strokeStyle = color;
  g.setLineDash([6, 6]);
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
