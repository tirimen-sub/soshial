// =========================================================
// 全ページ共通：キーワード検索と、開発中メモの開閉の記憶
// =========================================================
(function () {
  // ---------- キーワード検索 ----------
  // カードの data-search（製品名・よみ・キャッチコピー・カテゴリー・剤形）から探す。
  // トップ以外のページで検索したときは、トップに ?q= を付けて移動する。
  var grid = document.querySelector('.products__grid');
  var result = document.getElementById('search-result');
  var forms = document.querySelectorAll('form[role="search"]');
  var scriptSrc = document.currentScript && document.currentScript.src;
  var topUrl = scriptSrc ? new URL('../index.html', scriptSrc).href : 'index.html';

  // 表記ゆれをそろえる：カタカナ→ひらがな、全角英数→半角、小文字、記号・空白を除く
  function normalize(text) {
    return String(text || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); })
      .replace(/[\s\-ー・‐－−_、。「」『』（）()]/g, '');
  }

  function search(query) {
    if (!grid) return;
    var q = normalize(query);
    var cards = grid.querySelectorAll('.card');
    var hits = 0;
    cards.forEach(function (card) {
      var hit = !q || normalize(card.getAttribute('data-search')).indexOf(q) !== -1;
      card.classList.toggle('is-unmatched', !hit);
      if (hit) hits++;
    });
    forms.forEach(function (f) {
      var input = f.querySelector('input[type="search"]');
      if (input && input.value !== query) input.value = query;
    });
    if (result) {
      if (q) {
        result.hidden = false;
        result.textContent = hits
          ? '「' + query + '」の検索結果：' + hits + '件'
          : '「' + query + '」に一致する製品は見つかりませんでした';
      } else {
        result.hidden = true;
        result.textContent = '';
      }
    }
  }

  forms.forEach(function (form) {
    var input = form.querySelector('input[type="search"]');
    if (!input) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var query = input.value.trim();
      if (!grid) {
        location.href = topUrl + (query ? '?q=' + encodeURIComponent(query) : '') + '#products';
        return;
      }
      // カテゴリー・50音の絞り込みは「すべて」に戻してから探す
      var all = document.getElementById('f-all');
      if (all) all.checked = true;
      search(query);
      var products = document.getElementById('products');
      if (products) products.scrollIntoView({ behavior: 'smooth' });
    });
    // 「製品を探す」の検索欄は、入力しながら絞り込む
    if (input.id === 'keyword') {
      input.addEventListener('input', function () { search(input.value.trim()); });
    }
  });

  if (grid) {
    var q = new URLSearchParams(location.search).get('q');
    if (q) search(q);
  }

  // ---------- 開発中メモ：開閉の状態を覚える ----------
  var memo = document.getElementById('devmemo-open');
  if (memo) {
    var KEY = 'soshial-devmemo-open';
    try {
      var saved = localStorage.getItem(KEY);
      if (saved !== null) memo.checked = saved === '1';
    } catch (e) {}
    memo.addEventListener('change', function () {
      try { localStorage.setItem(KEY, memo.checked ? '1' : '0'); } catch (e) {}
    });
  }
})();
