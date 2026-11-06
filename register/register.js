// レジ画面
// バーコードスキャナーはキーボードとして動くので、
// 「入力欄に番号が入って Enter が押される」ことを読み取りとして扱う

const products = getProducts();
const byCode = new Map(products.map(p => [p.code, p]));

// 明細： { code, qty } の並び。読んだ順に上から並べる
let cart = [];

const scanForm = document.getElementById('scan-form');
const scanInput = document.getElementById('scan');
const lastBox = document.getElementById('last');
const linesEl = document.getElementById('lines');
const countEl = document.getElementById('count');
const totalEl = document.getElementById('total');
const payBtn = document.getElementById('pay');
const clearBtn = document.getElementById('clear');
const dialog = document.getElementById('receipt-dialog');
const receiptEl = document.getElementById('receipt');

// ---------- 読み取り ----------
scanForm.addEventListener('submit', e => {
  e.preventDefault();
  // 全角数字で入っても読めるように半角にそろえる
  const code = scanInput.value.trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  scanInput.value = '';
  if (!code) return;

  const product = byCode.get(code);
  if (!product) {
    showLast(null, code);
    beep(false);
    return;
  }

  const line = cart.find(l => l.code === code);
  if (line) line.qty++;
  else cart.unshift({ code, qty: 1 });

  showLast(product);
  beep(true);
  render();
});

function showLast(product, code) {
  lastBox.classList.remove('is-flash', 'is-error');
  void lastBox.offsetWidth; // アニメーションをやり直すため
  if (product) {
    lastBox.innerHTML =
      `<p class="pos__last-label">${escapeHTML(product.category)}</p>` +
      `<p class="pos__last-name">${escapeHTML(product.name)}</p>` +
      `<p class="pos__last-price">${yen(product.price)}</p>`;
    lastBox.classList.add('is-flash');
  } else {
    lastBox.innerHTML =
      `<p class="pos__last-label">${escapeHTML(code)}</p>` +
      `<p class="pos__last-name">登録されていない商品です</p>` +
      `<p class="pos__last-price"></p>`;
    lastBox.classList.add('is-flash', 'is-error');
  }
}

// ---------- 明細の表示 ----------
function render() {
  if (cart.length === 0) {
    linesEl.innerHTML = '<li class="lines__empty">まだ商品がありません</li>';
  } else {
    linesEl.innerHTML = cart.map(l => {
      const p = byCode.get(l.code);
      return `<li class="line">
        <div><div class="line__name">${escapeHTML(p.name)}</div><div class="line__cat">${escapeHTML(p.category)}・${yen(p.price)}</div></div>
        <div class="line__qty">
          <button type="button" data-code="${l.code}" data-step="-1" aria-label="1つ減らす">−</button>
          <span>${l.qty}</span>
          <button type="button" data-code="${l.code}" data-step="1" aria-label="1つ増やす">＋</button>
        </div>
        <div class="line__sum">${yen(p.price * l.qty)}</div>
        <button class="btn btn--danger btn--small" type="button" data-code="${l.code}" data-step="remove">削除</button>
      </li>`;
    }).join('');
  }

  const { count, total } = totals();
  countEl.textContent = count + '点';
  totalEl.textContent = yen(total);
  payBtn.disabled = count === 0;
}

function totals() {
  let count = 0, total = 0;
  cart.forEach(l => {
    count += l.qty;
    total += byCode.get(l.code).price * l.qty;
  });
  return { count, total };
}

linesEl.addEventListener('click', e => {
  const btn = e.target.closest('button[data-code]');
  if (!btn) return;
  const line = cart.find(l => l.code === btn.dataset.code);
  if (btn.dataset.step === 'remove') line.qty = 0;
  else line.qty += Number(btn.dataset.step);
  cart = cart.filter(l => l.qty > 0);
  render();
  scanInput.focus();
});

clearBtn.addEventListener('click', () => {
  if (cart.length && !confirm('明細をすべて取り消しますか？')) return;
  cart = [];
  render();
  scanInput.focus();
});

// ---------- お会計 ----------
payBtn.addEventListener('click', () => {
  const { count, total } = totals();
  const now = new Date();
  const R = window.RECEIPT || {};
  const no = makeReceiptNo(R.posNo || '0001', now); // 記録する前に番号を決める
  // 画面の明細は新しい順なので、レシートは読み取った順に並べ直す
  const items = cart.slice().reverse().map(l => {
    const p = byCode.get(l.code);
    return { code: p.code, name: p.name, category: p.category, price: p.price, qty: l.qty };
  });

  // 売上を記録する（商品登録画面で確認・CSV書き出しできる）
  addSale({ no, date: now.toISOString(), items, total, source: 'レジ' });

  const d = receiptDate(now);
  const row = (l, r, cls = '') => `<div class="receipt__row ${cls}"><span>${l}</span><span>${r}</span></div>`;
  receiptEl.innerHTML = `
    <img class="receipt__logo" src="receipt-logo.png" alt="ソシアル製薬">
    <div class="receipt__info">
      <p>${escapeHTML(R.company || '')}　${escapeHTML(R.store || '')}</p>
      <p>電話番号 ${escapeHTML(R.tel || '')}</p>
      <p>いつもお買い上げ有難うございます</p>
      ${row('店No:' + escapeHTML(R.storeNo || ''), 'レジNo:' + escapeHTML(R.posNo || ''))}
      ${row(d.day, d.time)}
    </div>
    <p class="receipt__title"><span>領収証</span></p>
    ${items.map(i =>
      row(deptCode(i.category, products) + escapeHTML(i.name), yen(i.price * i.qty)) +
      (i.qty > 1 ? row(`（${i.qty}コ×単${i.price.toLocaleString('ja-JP')}）`, '', 'receipt__row--sub') : '')
    ).join('')}
    <hr>
    ${row('小計　　' + count + '点', yen(total))}
    ${row('合計', yen(total), 'receipt__total')}
    ${row('（内、消費税等', yen(innerTax(total)) + '）')}
    ${row(escapeHTML(R.payment || ''), yen(total), 'receipt__pay')}
    ${row('お釣り', '¥0')}
    <div class="receipt__memo">
      <b>お薬メモ</b>
      <p>用法・用量を守って正しくお使いください。症状が続くときは、医師・薬剤師にご相談ください。</p>
    </div>
    <div class="receipt__bars" aria-hidden="true">${receiptBars(no).map((w, i) =>
      `<span style="width:${w}px;${i % 2 ? '' : 'background:#2b2b2b'}"></span>`).join('')}</div>
    <p class="receipt__no">${no}</p>
    <p class="receipt__foot">この作品の会社・商品はすべて架空です</p>
    <button class="btn btn--main receipt__close" type="button" id="receipt-close">閉じる</button>
  `;
  dialog.showModal();
  document.getElementById('receipt-close').focus();
});

dialog.addEventListener('click', e => {
  if (e.target.id === 'receipt-close') dialog.close();
});

dialog.addEventListener('close', () => {
  cart = [];
  render();
  showIdle();
  scanInput.focus();
});

function showIdle() {
  lastBox.classList.remove('is-flash', 'is-error');
  lastBox.innerHTML =
    '<p class="pos__last-label">バーコードを読み取ってください</p>' +
    '<p class="pos__last-name">―</p><p class="pos__last-price"></p>';
}

// ---------- 入力欄からカーソルが外れないようにする ----------
// （スキャナーの入力が別の場所に入ってしまうのを防ぐ）
document.addEventListener('click', e => {
  if (dialog.open) return;
  if (e.target.closest('button, a, input')) return;
  scanInput.focus();
});
scanInput.addEventListener('blur', () => {
  setTimeout(() => {
    if (!dialog.open && !document.activeElement.closest('button, a, input')) scanInput.focus();
  }, 0);
});

// ---------- 「ピッ」の音（音声ファイルなしで鳴らす） ----------
let audioCtx;
function beep(ok) {
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

render();
