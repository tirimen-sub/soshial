// ソシアル製薬 レジ・セルフレジの売上をスプレッドシートに集める GAS
// 使い方は README.md を参照
// ・doPost：レジ・セルフレジから届いた会計を「売上明細」シートに1商品1行で追記する
// ・doGet ：商品ごとの販売数を集計して JSON で返す（商品登録画面の「全体の集計」で使う）

const SHEET_NAME = '売上明細';
const HEADER = ['日時', 'レシートNo', '経路', 'バーコード番号', '商品名', '単価', '数量', '小計'];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // 同時に何人も買ったときに行が混ざらないようにする
  try {
    const sale = JSON.parse(e.postData.contents);
    const date = new Date(sale.date || Date.now());
    const rows = (sale.items || []).map(i => [
      date,
      String(sale.no || ''),
      String(sale.source || ''),
      "'" + String(i.code), // 先頭の ' で、13桁の番号が数値（指数表示）にならないようにする
      String(i.name),
      Number(i.price),
      Number(i.qty),
      Number(i.price) * Number(i.qty),
    ]);
    if (rows.length) {
      const sheet = getSheet_();
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADER.length).setValues(rows);
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues().slice(1);
  const byCode = {};
  const receipts = {};
  let total = 0;
  values.forEach(r => {
    const code = String(r[3]).replace(/^'/, '');
    const item = byCode[code] || (byCode[code] = { code: code, name: r[4], qty: 0, amount: 0 });
    item.qty += Number(r[6]);
    item.amount += Number(r[7]);
    total += Number(r[7]);
    receipts[r[1]] = true;
  });
  const ranking = Object.keys(byCode).map(k => byCode[k]).sort((a, b) => b.qty - a.qty);
  return json_({ ok: true, receipts: Object.keys(receipts).length, total: total, ranking: ranking });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
