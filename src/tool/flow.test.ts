import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportReport, loadSource, type Io, type Meta } from './flow';
import { DEFAULT_OPTS, skuMatrix, storeSummary } from './core';
import { readSheets } from './xlsx';

const sample = (n: string) => new Uint8Array(readFileSync(new URL(`../../samples/${n}`, import.meta.url)));
const meta = (o: Partial<Meta>): Meta => ({ platform: 'shopee', store: '示例店A', kind: 'orders', currency: 'myr', rate: 0, ...o });
const memIo = () => { const files = new Map<string, Uint8Array>(); const io: Io = { mkdir: async () => {}, join: async (...p) => p.join('/'), writeFile: async (p, d) => void files.set(p, d) }; return { io, files }; };

describe('用 samples 里的示例文件', () => {
  it('Shopee 订单表：4 单（重复行合并），其中 1 单取消', async () => {
    const s = await loadSource(sample('shopee-示例店A-订单.csv'), 'shopee-示例店A-订单.csv', meta({}));
    expect(s.orders).toHaveLength(4);
    expect(s.orders.filter((o) => o.cancelled)).toHaveLength(1);
    expect(s.currency).toBe('MYR');
    const r = storeSummary([s], DEFAULT_OPTS)[0];
    expect([r.orders, r.gmv, r.aov]).toEqual([3, 201.4, 67.13]);
  });
  it('Lazada 英文表头订单表', async () => {
    const s = await loadSource(sample('lazada-示例店B-订单.csv'), 'x.csv', meta({ platform: 'lazada', store: '示例店B', currency: 'THB' }));
    expect(storeSummary([s], DEFAULT_OPTS)[0]).toMatchObject({ orders: 3, cancelled: 1, gmv: 2630 });
  });
  it('两家店库存跨店对照', async () => {
    const a = await loadSource(sample('shopee-示例店A-库存.csv'), 'a.csv', meta({ kind: 'stock' }));
    const b = await loadSource(sample('lazada-示例店B-库存.csv'), 'b.csv', meta({ kind: 'stock', platform: 'lazada', store: '示例店B' }));
    const m = skuMatrix([a, b], DEFAULT_OPTS);
    const by = Object.fromEntries(m.rows.map((r) => [r.sku.toUpperCase(), r.flags]));
    expect(by['DEMO-CUP']).toEqual(['部分店铺断货，其他店有货']);
    expect(by['DEMO-BAG']).toEqual(['部分店铺低库存', 'MYR 价格相差超过 20%']);
    expect(by['DEMO-STAND']).toEqual(['部分店铺低库存']);
    expect(by['DEMO-LAMP']).toEqual([]);
    expect(m.rows).toHaveLength(5);
  });
  it('没有店铺名或表头不对时报错', async () => {
    await expect(loadSource(sample('shopee-示例店A-订单.csv'), 'a.csv', meta({ store: ' ' }))).rejects.toThrow('店铺名');
    await expect(loadSource(sample('shopee-示例店A-订单.csv'), 'a.csv', meta({ kind: 'stock' }))).rejects.toThrow('库存');
  });
});

describe('导出', () => {
  it('写出 Excel：店铺汇总、SKU 对照、说明三张表，填了汇率才有折算列', async () => {
    const o = await loadSource(sample('shopee-示例店A-订单.csv'), 'a.csv', meta({ rate: 1.05 }));
    const k = await loadSource(sample('shopee-示例店A-库存.csv'), 'k.csv', meta({ kind: 'stock' }));
    const { io, files } = memIo();
    const path = await exportReport([o, k], DEFAULT_OPTS, io, '/out', new Date('2026-10-23T08:00:00Z'));
    expect(path).toBe('/out/多店调度报表-2026-10-23.xlsx');
    const sheets = await readSheets(files.get(path)!, 'r.xlsx');
    expect(sheets.map((s) => s.name)).toEqual(['店铺汇总', 'SKU 对照', '说明']);
    const head = sheets[0].grid[0] as string[];
    expect(head).toContain('折算后成交额');
    const row = sheets[0].grid[1];
    expect(row[head.indexOf('折算后成交额')]).toBe(211.47);
    expect(row[head.indexOf('断货 SKU')]).toBe(1);
  });
  it('没填汇率时没有折算列', async () => {
    const o = await loadSource(sample('lazada-示例店B-订单.csv'), 'a.csv', meta({ platform: 'lazada', store: 'B' }));
    const { io, files } = memIo();
    const p = await exportReport([o], DEFAULT_OPTS, io, '/o', new Date());
    expect((await readSheets(files.get(p)!, 'r.xlsx'))[0].grid[0]).not.toContain('折算后成交额');
  });
});
