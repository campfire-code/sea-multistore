// 工具声明：东南亚多店调度（自定义界面；纯本地汇总各平台后台导出的订单表和库存表，不调用平台接口）。
import { Store } from 'lucide-react';
import { createElement } from 'react';
import type { CustomTool } from '../kit/types';
import { Main } from './Main';

const tool: CustomTool = {
  id: 'e16',
  name: '东南亚多店调度',
  tagline: 'Lazada / Shopee / TikTok 多店统一管理：导入各店后台导出的订单和库存表，合并看业绩、库存与跨店差异。',
  icon: Store,
  category: '电商运营',
  type: 'data',
  mode: 'custom',
  mainLabel: '多店看板',
  params: [],
  Main: ({ ctx }) => createElement(Main, { ctx }),
};

export default tool;
