// 截图与预览用的示例数据（不会进入正式运行）。店铺名、商品名均为虚构。
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
  orders('o1', '马来旗舰店-订单.xlsx', 'shopee', '马来旗舰店', 'MYR', 0.21, amts(42, 38)),
  orders('o2', '泰国精选店-订单.xlsx', 'lazada', '泰国精选店', 'THB', 0.028, amts(35, 420)),
  orders('o3', '印尼百货店-订单.xlsx', 'tiktok', '印尼百货店', 'IDR', 0.000062, amts(28, 95000)),
  stock('k1', '马来旗舰店-库存.xlsx', 'shopee', '马来旗舰店', 'MYR', [['BW-1001', '不锈钢保温杯', 0, 39.9], ['BW-1002', '帆布托特包', 6, 19.9], ['BW-1003', '桌面手机支架', 300, 12.5], ['BW-1004', '桌面收纳盒', 48, 15], ['BW-1005', '加厚瑜伽垫', 120, 45]]),
  stock('k2', '泰国精选店-库存.xlsx', 'lazada', '泰国精选店', 'THB', [['BW-1001', '不锈钢保温杯', 85, 399], ['BW-1002', '帆布托特包', 40, 279], ['BW-1003', '桌面手机支架', 3, 129], ['BW-1006', '护眼小台灯', 22, 590]]),
  stock('k3', '印尼百货店-库存.xlsx', 'tiktok', '印尼百货店', 'IDR', [['BW-1001', '不锈钢保温杯', 30, 99000], ['BW-1006', '护眼小台灯', 0, 129000], ['BW-1005', '加厚瑜伽垫', 8, 159000]]),
];
