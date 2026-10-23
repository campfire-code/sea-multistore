// 导入与导出流程：读文件 → 识别 → 汇总 → 写 Excel。文件读写通过 io 传入，便于用内存文件系统测试。
import { toTable } from './common';
import { parseOrders, parseStock, platformName, skuMatrix, storeSummary, type Kind, type Opts, type Platform, type Source } from './core';
import { readSheets, writeXlsx } from './xlsx';

export interface Io { mkdir(p: string): Promise<void>; join(...p: string[]): Promise<string>; writeFile(p: string, d: Uint8Array): Promise<void> }
export interface Meta { platform: Platform; store: string; kind: Kind; currency: string; rate: number }

let seq = 0;
/** 读一个文件（取第一个有数据的工作表），识别成一个数据源 */
export async function loadSource(bytes: Uint8Array, file: string, meta: Meta): Promise<Source> {
  const name = file.split(/[\\/]/).pop() ?? file;
  const sheets = await readSheets(bytes, name);
  const t = sheets.map((s) => toTable(s.grid)).find((x) => x.rows.length);
  if (!t) throw new Error(`${name} 里没有数据`);
  const store = meta.store.trim();
  if (!store) throw new Error('请先填写店铺名');
  const p = meta.kind === 'orders' ? parseOrders(t) : parseStock(t);
  const base = { id: `s${++seq}`, file: name, kind: meta.kind, platform: meta.platform, store, currency: meta.currency.trim().toUpperCase() || '—', rate: meta.rate > 0 ? meta.rate : 0, mapping: p.mapping, skipped: p.skipped };
  if (!p.rows.length) throw new Error(`${name} 里没有读到有效行（共 ${t.rows.length} 行，均缺少必要字段）`);
  return meta.kind === 'orders' ? { ...base, orders: p.rows as Source['orders'], stock: [] } : { ...base, orders: [], stock: p.rows as Source['stock'] };
}

export async function exportReport(sources: Source[], opts: Opts, io: Io, outDir: string, now: Date): Promise<string> {
  const stores = storeSummary(sources, opts);
  const m = skuMatrix(sources, opts);
  const hasConv = stores.some((s) => s.gmvConverted != null);
  const sheets = [
    { name: '店铺汇总', header: ['店铺', '平台', '币种', '有效订单', '取消订单', 'GMV（本币）', '客单价', ...(hasConv ? ['汇率', '折算后 GMV'] : []), 'SKU 数', '库存件数', '低库存 SKU', '断货 SKU'],
      rows: stores.map((s) => [s.store, platformName(s.platform), s.currency, s.orders, s.cancelled, s.gmv, s.aov, ...(hasConv ? [s.rate > 0 ? s.rate : null, s.gmvConverted] : []), s.skus, s.units, s.low, s.out]),
      formats: ['text', 'text', 'text', 'int', 'int', 'money', 'money', ...(hasConv ? ['money' as const, 'money' as const] : []), 'int', 'int', 'int', 'int'] as ('money' | 'int' | 'text')[] },
    { name: 'SKU 对照', header: ['SKU', '商品名称', '总库存', ...m.stores.flatMap((s) => [`${s.label} 库存`, `${s.label} 价格`]), '提示'],
      rows: m.rows.map((r) => [r.sku, r.name, r.total, ...m.stores.flatMap((s) => [r.cells[s.key]?.stock ?? null, r.cells[s.key]?.price ?? null]), r.flags.join('；')]) },
    { name: '说明', header: ['项目', '内容'], rows: [
      ['生成时间', now.toISOString().slice(0, 16).replace('T', ' ')], ['数据来源', '用户导入的各平台后台导出表格，未调用任何平台接口'],
      ['低库存线', `库存 ≤ ${opts.lowStock} 件`], ['价格差异线', `同币种店铺间相差 > ${opts.spreadPct}%`],
      ['订单口径', '同订单号多行只算一单；状态含「取消 / 退款 / cancel / refund」等字样的不计入 GMV 和客单价'], ['汇总币种', hasConv ? '折算汇率由用户填写' : '未填写汇率，各币种不折算、不相加'],
    ] },
  ];
  await io.mkdir(outDir);
  const path = await io.join(outDir, `多店调度报表-${now.toISOString().slice(0, 10)}.xlsx`);
  await io.writeFile(path, await writeXlsx(sheets as never));
  return path;
}
