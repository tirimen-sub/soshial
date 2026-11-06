// 設定
// ・SALES_ENDPOINT に GAS（Google Apps Script）のウェブアプリの URL を入れると、
//   レジ・セルフレジで買われた記録がスプレッドシートに集まる
//   設定のしかたは gas/README.md を参照
// ・空のままなら、記録はそれぞれの端末の中だけに残る
window.SALES_ENDPOINT = '';

// セルフレジのレシートや投稿に入れる、サイトの URL
window.SITE_URL = 'https://tirimen-sub.github.io/soshial/';

// 投稿につけるハッシュタグ（# はつけない）
window.SHARE_HASHTAG = 'ソシアル製薬';

// レシートに印字する店舗情報（すべて架空）
window.RECEIPT = {
  company: '株式会社ソシアル製薬',
  store: '卒業制作展 会場店',
  tel: '000-0000-0000',
  storeNo: '0001',
  posNo: '0001',   // PCレジのレジNo
  selfNo: '0003',  // セルフレジのレジNo
  payment: 'ソシアルPay',
};
