import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTS, parseMoney, parseOrders, parseStock, skuMatrix, storeSummary, type Source } from './core';
import { toTable } from './common';

const T = (header: string[], rows: (string | number)[][]) => toTable([header, ...rows]);
const src = (o: Partial<Source>): Source => ({ id: 'x', file: 'f.xlsx', kind: 'stock', platform: 'shopee', store: '示例店A', currency: 'MYR', rate: 0, orders: [], stock: [], mapping: {}, skipped: 0, ...o });

describe('parseMoney', () => {
  it('去掉币种符号与千分位', () => {
    expect(parseMoney('RM 1,234.50')).toBe(1234.5);
    expect(parseMoney('$12')).toBe(12);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(7)).toBe(7);
  });
});

describe('parseOrders', () => {
  it('识别中英文表头，同订单号多行只算一单，取消单打标', () => {
    const r = parseOrders(T(['Order ID', 'Order Status', 'Total Amount'], [['A1', 'Completed', 100], ['A1', 'Completed', 100], ['A2', 'Cancelled', 50], ['', 'x', 1], ['A3', 'Shipped', 'n/a']]));
    expect(r.rows.map((x) => [x.orderId, x.amount, x.cancelled])).toEqual([['A1', 100, false], ['A2', 50, true]]);
    expect(r.skipped).toBe(2);
    expect(r.mapping['订单号']).toBe('Order ID');
  });
  it('缺少订单金额列时报错并列出表头', () => {
    expect(() => parseOrders(T(['订单号', '备注'], [['1', 'a']]))).toThrow(/订单金额.*订单号、备注/);
  });
  it('中文表头与「取消」状态', () => {
    const r = parseOrders(T(['订单编号', '订单状态', '订单金额'], [['1', '已取消', 9], ['2', '已完成', 11]]));
    expect(r.rows[0].cancelled).toBe(true);
    expect(r.rows[1].cancelled).toBe(false);
  });
});

describe('parseStock', () => {
  it('同 SKU 不分大小写合并库存', () => {
    const r = parseStock(T(['商家编码', '商品名称', '库存', '售价'], [['ab-1', '示例杯', 5, 10], ['AB-1', '示例杯', 3, 11], ['CD-2', '示例包', 0, 20], ['', '空', 1, 1]]));
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ sku: 'ab-1', stock: 8, price: 10 });
    expect(r.skipped).toBe(1);
  });
  it('缺库存列报错', () => {
    expect(() => parseStock(T(['SKU', '名称'], [['a', 'b']]))).toThrow(/库存/);
  });
});

describe('storeSummary', () => {
  it('订单与库存合到同一家店，取消单不计 GMV，按汇率折算', () => {
    const rows = storeSummary([
      src({ kind: 'orders', rate: 0.2, orders: [{ orderId: '1', status: '', amount: 100, cancelled: false }, { orderId: '2', status: '', amount: 50, cancelled: false }, { orderId: '3', status: '取消', amount: 999, cancelled: true }] }),
      src({ stock: [{ sku: 'a', name: '', stock: 0, price: null }, { sku: 'b', name: '', stock: 5, price: null }, { sku: 'c', name: '', stock: 100, price: null }] }),
    ], DEFAULT_OPTS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orders: 2, cancelled: 1, gmv: 150, aov: 75, gmvConverted: 30, skus: 3, units: 105, low: 1, out: 1 });
  });
  it('未填汇率时不折算', () => {
    expect(storeSummary([src({ kind: 'orders', orders: [{ orderId: '1', status: '', amount: 1, cancelled: false }] })], DEFAULT_OPTS)[0].gmvConverted).toBeNull();
  });
});

describe('skuMatrix', () => {
  const a = src({ store: 'A店', stock: [{ sku: 'X1', name: '杯', stock: 0, price: 10 }, { sku: 'X2', name: '包', stock: 50, price: 10 }, { sku: 'X3', name: '灯', stock: 40, price: 10 }] });
  const b = src({ id: 'y', store: 'B店', platform: 'lazada', stock: [{ sku: 'x1', name: '', stock: 80, price: 10 }, { sku: 'X2', name: '', stock: 5, price: 15 }] });
  it('跨店按 SKU 对齐并给出标记', () => {
    const m = skuMatrix([a, b], DEFAULT_OPTS);
    expect(m.stores).toHaveLength(2);
    const by = Object.fromEntries(m.rows.map((r) => [r.sku, r]));
    expect(by.X1.flags).toEqual(['部分店铺断货，其他店有货']);
    expect(by.X2.flags).toEqual(['部分店铺低库存', 'MYR 价格相差超过 20%']);
    expect(by.X3.flags).toEqual([]);
    expect(by.X1.total).toBe(80);
  });
  it('币种不同不比较价格', () => {
    const c = src({ id: 'z', store: 'C店', currency: 'THB', stock: [{ sku: 'X2', name: '', stock: 50, price: 500 }] });
    expect(skuMatrix([a, c], DEFAULT_OPTS).rows.find((r) => r.sku === 'X2')!.flags).toEqual([]);
  });
});
