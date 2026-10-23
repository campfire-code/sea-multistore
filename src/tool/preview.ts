// 截图与预览用的示例数据（不会进入正式运行）。店铺名、商品名均为虚构的「示例」。
import { toTable } from './common';
import { parseOrders, parseStock, type Source } from './core';

export const rows = () => [];
export const params = {};
export const isPreview = () => typeof location !== 'undefined' && location.pathname.endsWith('preview.html');

const base = { rate: 0, mapping: {}, skipped: 0 };
const orders = (id: string, file: string, platform: Source['platform'], store: string, currency: string, rate: number, amounts: [number, string][]): Source => {
  const t = toTable([['订单号', '订单状态', '订单金额'], ...amounts.map(([a, s], i) => [`${id}${i + 1}`, s, a])]);
  const p = parseOrders(t);
  return { ...base, id, file, kind: 'orders', platform, store, currency, rate, orders: p.rows, stock: [], mapping: p.mapping };
};
const stock = (id: string, file: string, platform: Source['platform'], store: string, currency: string, data: [string, string, number, number][]): Source => {
  const p = parseStock(toTable([['SKU', '商品名称', '库存', '价格'], ...data]));
  return { ...base, id, file, kind: 'stock', platform, store, currency, rate: 0, orders: [], stock: p.rows, mapping: p.mapping };
};
const amts = (n: number, base: number): [number, string][] => Array.from({ length: n }, (_, i) => [base + (i % 7) * 9.5, i % 9 === 4 ? '已取消' : '已完成']);

export const demoSources = (): Source[] => [
  orders('o1', '示例店A-订单.xlsx', 'shopee', '示例店A', 'MYR', 0.21, amts(42, 38)),
  orders('o2', '示例店B-订单.xlsx', 'lazada', '示例店B', 'THB', 0.028, amts(35, 420)),
  orders('o3', '示例店C-订单.xlsx', 'tiktok', '示例店C', 'IDR', 0.000062, amts(28, 95000)),
  stock('k1', '示例店A-库存.xlsx', 'shopee', '示例店A', 'MYR', [['DEMO-CUP', '示例保温杯', 0, 39.9], ['DEMO-BAG', '示例帆布袋', 6, 19.9], ['DEMO-STAND', '示例手机支架', 300, 12.5], ['DEMO-BOX', '示例收纳盒', 48, 15], ['DEMO-MAT', '示例瑜伽垫', 120, 45]]),
  stock('k2', '示例店B-库存.xlsx', 'lazada', '示例店B', 'THB', [['DEMO-CUP', '示例保温杯', 85, 399], ['DEMO-BAG', '示例帆布袋', 40, 279], ['DEMO-STAND', '示例手机支架', 3, 129], ['DEMO-LAMP', '示例台灯', 22, 590]]),
  stock('k3', '示例店C-库存.xlsx', 'tiktok', '示例店C', 'IDR', [['DEMO-CUP', '示例保温杯', 30, 99000], ['DEMO-LAMP', '示例台灯', 0, 129000], ['DEMO-MAT', '示例瑜伽垫', 8, 159000]]),
];
