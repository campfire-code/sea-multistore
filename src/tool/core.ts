// 多店调度的核心纯函数：把各平台后台导出的订单表 / 库存表识别成统一结构，再按店铺和 SKU 汇总。
// 不联网、不调用任何平台接口；表头靠关键词自动识别，识别不到就明确报错，不猜。
import { cellText, type Cell, type Table } from './common';

export type Platform = 'shopee' | 'lazada' | 'tiktok' | 'other';
export type Kind = 'orders' | 'stock';
export const PLATFORMS: { id: Platform; name: string }[] = [
  { id: 'shopee', name: 'Shopee' }, { id: 'lazada', name: 'Lazada' }, { id: 'tiktok', name: 'TikTok Shop' }, { id: 'other', name: '其他' },
];
export const platformName = (p: Platform) => PLATFORMS.find((x) => x.id === p)?.name ?? p;

export interface OrderRow { orderId: string; status: string; amount: number; cancelled: boolean }
export interface StockRow { sku: string; name: string; stock: number; price: number | null }
export interface Source {
  id: string; file: string; kind: Kind; platform: Platform; store: string; currency: string;
  /** 折算到统一币种的汇率，由用户填写；0 或空表示不折算 */
  rate: number;
  orders: OrderRow[]; stock: StockRow[];
  /** 识别到的列：字段名 → 表头 */
  mapping: Record<string, string>;
  skipped: number;
}

const ORDER_COLS: Record<string, RegExp[]> = {
  orderId: [/^(订单号|订单编号|订单id|订单编码)$/i, /订单.{0,2}(号|编号|id)/i, /order[\s_-]*(id|no|number|sn)/i],
  amount: [/^(订单金额|订单总额|订单总金额|实付金额|买家实付|付款金额|商品总价)$/, /(订单|实付|付款|总).{0,3}金额/, /(order|total|paid|payment)[\s_-]*(amount|total|price)/i],
  status: [/^(订单状态|状态)$/, /状态/, /status/i],
};
const STOCK_COLS: Record<string, RegExp[]> = {
  sku: [/^(sku|商家编码|商家sku|卖家sku|货号|商品编码|主商品货号)$/i, /sku|商家编码|货号|编码/i],
  name: [/^(商品名称|商品名|产品名称|标题)$/, /(商品|产品).{0,2}名|title|name/i],
  stock: [/^(库存|可售库存|库存数量|可用库存)$/, /库存|可售|stock|quantity|inventory/i],
  price: [/^(价格|售价|单价|销售价格)$/, /价格|售价|单价|price/i],
};
const CANCEL_RE = /取消|cancel|退款|refund|关闭|closed|failed|失败|未付款.{0,2}超时|expired/i;

export const parseMoney = (v: Cell): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = cellText(v).replace(/[,\s，]/g, '').replace(/^[A-Za-z$¥￥฿₫₱]+|[A-Za-z]+$/g, '');
  return t !== '' && /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

function locate(t: Table, spec: Record<string, RegExp[]>, need: string[], what: string) {
  const idx: Record<string, number> = {};
  const used = new Set<number>();
  for (const [k, res] of Object.entries(spec)) {
    const i = res.map((re) => t.header.findIndex((h, n) => !used.has(n) && re.test(h))).find((n) => n >= 0) ?? -1;
    idx[k] = i;
    if (i >= 0) used.add(i);
  }
  const miss = need.filter((k) => idx[k] < 0);
  if (miss.length) throw new Error(`${what}里没有找到「${miss.map((k) => LABEL[k]).join('、')}」列。表头是：${t.header.slice(0, 12).join('、') || '（空）'}。请把表头改成含有这些字样再导入。`);
  return idx;
}
const LABEL: Record<string, string> = { orderId: '订单号', amount: '订单金额', status: '订单状态', sku: 'SKU / 商家编码', stock: '库存', name: '商品名称', price: '价格' };

/** 订单表：同一订单号多行（每行一个商品）只算一单，金额取第一行，视为订单级金额 */
export function parseOrders(t: Table): { rows: OrderRow[]; mapping: Record<string, string>; skipped: number } {
  const ix = locate(t, ORDER_COLS, ['orderId', 'amount'], '订单表');
  const seen = new Set<string>();
  const rows: OrderRow[] = [];
  let skipped = 0;
  for (const r of t.rows) {
    const id = cellText(r[ix.orderId]);
    const amount = parseMoney(r[ix.amount]);
    if (!id || amount == null) { skipped++; continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    const status = ix.status >= 0 ? cellText(r[ix.status]) : '';
    rows.push({ orderId: id, status, amount, cancelled: CANCEL_RE.test(status) });
  }
  return { rows, mapping: mapOf(t, ix), skipped };
}

/** 库存表：同 SKU 重复行库存相加，价格取第一个 */
export function parseStock(t: Table): { rows: StockRow[]; mapping: Record<string, string>; skipped: number } {
  const ix = locate(t, STOCK_COLS, ['sku', 'stock'], '库存表');
  const map = new Map<string, StockRow>();
  let skipped = 0;
  for (const r of t.rows) {
    const sku = cellText(r[ix.sku]);
    const stock = parseMoney(r[ix.stock]);
    if (!sku || stock == null) { skipped++; continue; }
    const key = sku.toUpperCase();
    const price = ix.price >= 0 ? parseMoney(r[ix.price]) : null;
    const cur = map.get(key);
    if (cur) { cur.stock += stock; if (cur.price == null) cur.price = price; } else map.set(key, { sku, name: ix.name >= 0 ? cellText(r[ix.name]) : '', stock, price });
  }
  return { rows: [...map.values()], mapping: mapOf(t, ix), skipped };
}
const mapOf = (t: Table, ix: Record<string, number>) => Object.fromEntries(Object.entries(ix).filter(([, i]) => i >= 0).map(([k, i]) => [LABEL[k], t.header[i]]));

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface StoreRow {
  key: string; store: string; platform: Platform; currency: string; rate: number;
  orders: number; cancelled: number; gmv: number; aov: number; gmvConverted: number | null;
  skus: number; units: number; low: number; out: number;
}
export interface Opts { lowStock: number; spreadPct: number }
export const DEFAULT_OPTS: Opts = { lowStock: 10, spreadPct: 20 };

export function storeSummary(sources: Source[], opts: Opts): StoreRow[] {
  const by = new Map<string, StoreRow>();
  for (const s of sources) {
    const key = `${s.platform}|${s.store}`;
    let r = by.get(key);
    if (!r) by.set(key, (r = { key, store: s.store, platform: s.platform, currency: s.currency, rate: s.rate, orders: 0, cancelled: 0, gmv: 0, aov: 0, gmvConverted: null, skus: 0, units: 0, low: 0, out: 0 }));
    if (s.kind === 'orders') {
      for (const o of s.orders) { if (o.cancelled) r.cancelled++; else { r.orders++; r.gmv += o.amount; } }
    } else {
      for (const k of s.stock) { r.skus++; r.units += k.stock; if (k.stock <= 0) r.out++; else if (k.stock <= opts.lowStock) r.low++; }
    }
    if (s.rate > 0) r.rate = s.rate;
  }
  return [...by.values()].map((r) => ({ ...r, gmv: round2(r.gmv), aov: r.orders ? round2(r.gmv / r.orders) : 0, gmvConverted: r.rate > 0 ? round2(r.gmv * r.rate) : null }));
}

export interface SkuRow {
  sku: string; name: string; total: number;
  /** 每家店的库存与价格（键为 店铺 key） */
  cells: Record<string, { stock: number; price: number | null; currency: string }>;
  flags: string[];
}
export function skuMatrix(sources: Source[], opts: Opts): { stores: { key: string; label: string }[]; rows: SkuRow[] } {
  const stores: { key: string; label: string }[] = [];
  const map = new Map<string, SkuRow>();
  for (const s of sources.filter((x) => x.kind === 'stock')) {
    const key = `${s.platform}|${s.store}`;
    if (!stores.some((x) => x.key === key)) stores.push({ key, label: `${s.store}（${platformName(s.platform)}）` });
    for (const k of s.stock) {
      const id = k.sku.toUpperCase();
      let r = map.get(id);
      if (!r) map.set(id, (r = { sku: k.sku, name: k.name, total: 0, cells: {}, flags: [] }));
      if (!r.name) r.name = k.name;
      const c = r.cells[key];
      if (c) c.stock += k.stock; else r.cells[key] = { stock: k.stock, price: k.price, currency: s.currency };
      r.total += k.stock;
    }
  }
  const rows = [...map.values()];
  for (const r of rows) {
    const cs = Object.values(r.cells);
    if (cs.length < 2) continue;
    if (cs.some((c) => c.stock <= 0) && cs.some((c) => c.stock > opts.lowStock)) r.flags.push('部分店铺断货，其他店有货');
    if (cs.some((c) => c.stock > 0 && c.stock <= opts.lowStock)) r.flags.push('部分店铺低库存');
    // 价格差异只在币种相同的店铺之间比较，不做汇率换算
    const cur = new Map<string, number[]>();
    for (const c of cs) if (c.price != null && c.price > 0) cur.set(c.currency, [...(cur.get(c.currency) ?? []), c.price]);
    for (const [c, ps] of cur) if (ps.length > 1 && (Math.max(...ps) - Math.min(...ps)) / Math.min(...ps) * 100 > opts.spreadPct) r.flags.push(`${c} 价格相差超过 ${opts.spreadPct}%`);
  }
  rows.sort((a, b) => b.flags.length - a.flags.length || a.sku.localeCompare(b.sku));
  return { stores, rows };
}

export const isLow = (n: number, opts: Opts) => n > 0 && n <= opts.lowStock;
export const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
