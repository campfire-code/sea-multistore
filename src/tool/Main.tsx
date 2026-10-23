// 主界面：左侧选平台、填店铺信息、导入表格并设提醒线；右侧看店铺汇总和跨店 SKU 对照，导出 Excel。
import { useEffect, useMemo, useState } from 'react';
import { Download, FileUp, FolderOpen, Trash2, TriangleAlert, X } from 'lucide-react';
import type { CustomTool } from '../kit/types';
import { defaultOutputDir, pickFiles, reveal } from '../kit/platform';
import { useDroppedFiles } from '../kit/parts';
import { PLATFORMS, platformName, skuMatrix, storeSummary, money, type Kind, type Platform, type Source } from './core';
import { errText } from './common';
import { exportReport, loadSource } from './flow';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from './store';
import { demoSources, isPreview } from './preview';
import './tool.css';

type Ctx = Parameters<CustomTool['Main']>[0]['ctx'];
type Tab = 'store' | 'sku';

export function Main({ ctx }: { ctx?: Ctx }) {
  const preview = isPreview();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [sources, setSources] = useState<Source[]>(() => (preview ? demoSources() : []));
  const [platform, setPlatform] = useState<Platform>('shopee');
  const [store, setStore] = useState('');
  const [kind, setKind] = useState<Kind>('orders');
  const [rate, setRate] = useState('');
  const [tab, setTab] = useState<Tab>('store');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [outPath, setOutPath] = useState(preview ? '/示例/下载/东南亚多店调度/多店调度报表-2026-10-23.xlsx' : '');

  useEffect(() => { if (!preview) void loadPrefs().then(setPrefs); }, [preview]);
  const setP = (patch: Partial<Prefs>) => setPrefs((p) => { const n = { ...p, ...patch }; void savePrefs(n); return n; });

  const stores = useMemo(() => storeSummary(sources, prefs), [sources, prefs]);
  const matrix = useMemo(() => skuMatrix(sources, prefs), [sources, prefs]);
  const totalOrders = stores.reduce((a, s) => a + s.orders, 0);
  const alertSku = matrix.rows.filter((r) => r.flags.length).length;
  const mixed = new Set(stores.filter((s) => s.orders).map((s) => s.currency)).size > 1;
  const hasConv = stores.some((s) => s.gmvConverted != null);

  async function importFiles(paths: string[]) {
    if (!ctx) return;
    setError(''); setNotice(''); setOutPath('');
    const added: Source[] = [];
    const errs: string[] = [];
    for (const p of paths) {
      try {
        const bytes = await ctx.readFile(p);
        added.push(await loadSource(bytes, p, { platform, store, kind, currency: prefs.currency, rate: Number(rate) || 0 }));
      } catch (e) { errs.push(errText(e)); }
    }
    if (added.length) {
      setSources((s) => [...s, ...added]);
      setNotice(`已导入 ${added.length} 个文件：${added.map((a) => `${a.store} ${a.kind === 'orders' ? `${a.orders.length} 单` : `${a.stock.length} 个 SKU`}${a.skipped ? `（跳过 ${a.skipped} 行无效行）` : ''}`).join('；')}`);
    }
    if (errs.length) setError(errs.join('\n'));
  }
  const hover = useDroppedFiles((p) => void importFiles(p));

  async function doExport() {
    if (!ctx) return;
    setError('');
    try {
      const dir = await defaultOutputDir('东南亚多店调度');
      setOutPath(await exportReport(sources, prefs, ctx, dir, new Date()));
    } catch (e) { setError(errText(e)); }
  }

  const detail = (s: Source) => (s.kind === 'orders' ? `订单 ${s.orders.length}` : `SKU ${s.stock.length}`);
  return (
    <div className="ms-root">
      <section className="k-panel ms-side">
        <p className="ms-risk"><TriangleAlert size={13} /> 本工具<b>只读你从各平台卖家后台导出的表格</b>，不登录店铺、不调用平台接口，也不会改动店铺数据。表头靠关键词识别（订单号 / 订单金额 / SKU / 库存等），各平台导出格式可能不同，识别不了会明确报错。</p>
        <h3 className="k-section">1. 添加数据</h3>
        <div className="k-field">
          <label className="k-label" htmlFor="ms-pf">平台</label>
          <select id="ms-pf" className="k-input" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
            {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="k-field">
          <label className="k-label" htmlFor="ms-store">店铺名（同名同平台的订单表和库存表会合并成一行）</label>
          <input id="ms-store" className="k-input" value={store} placeholder="例如：马来站旗舰店" onChange={(e) => setStore(e.target.value)} />
        </div>
        <div className="k-field">
          <span className="k-label">表格类型</span>
          <div className="k-seg" role="group" aria-label="表格类型">
            <button className={kind === 'orders' ? 'on' : ''} onClick={() => setKind('orders')}>订单表</button>
            <button className={kind === 'stock' ? 'on' : ''} onClick={() => setKind('stock')}>库存 / 商品表</button>
          </div>
        </div>
        <div className="ms-two">
          <div className="k-field">
            <label className="k-label" htmlFor="ms-cur">币种</label>
            <input id="ms-cur" className="k-input" value={prefs.currency} placeholder="MYR" onChange={(e) => setP({ currency: e.target.value })} />
          </div>
          <div className="k-field">
            <label className="k-label" htmlFor="ms-rate">汇率（可不填）</label>
            <input id="ms-rate" className="k-input" inputMode="decimal" value={rate} placeholder="1 本币 = ?" onChange={(e) => setRate(e.target.value)} />
          </div>
        </div>
        <p className="k-muted ms-note">汇率由你自己填（工具不查汇率）；不填则各币种分开显示、不相加。</p>
        <button className="k-btn primary" disabled={!ctx} onClick={() => void pickFiles(['xlsx', 'csv'], '订单 / 库存表').then((p) => { if (p.length) void importFiles(p); })}><FileUp size={14} />导入文件{hover && ' · 松开即可导入'}</button>
        <p className="k-muted ms-note">也可把 .xlsx / .csv 直接拖进窗口，按上面选好的平台、店铺和类型识别。</p>

        {sources.length > 0 && (
          <>
            <h3 className="k-section">已导入（{sources.length}）</h3>
            <ul className="ms-list">
              {sources.map((s) => (
                <li key={s.id}>
                  <span className="k-ellipsis" title={s.file}><b>{s.store}</b> · {platformName(s.platform)} · {s.kind === 'orders' ? '订单' : '库存'} · {detail(s)}</span>
                  <button className="k-link" aria-label={`移除 ${s.file}`} onClick={() => setSources((l) => l.filter((x) => x.id !== s.id))}><X size={13} /></button>
                </li>))}
            </ul>
            <button className="k-link" onClick={() => { setSources([]); setOutPath(''); setNotice(''); }}><Trash2 size={13} />全部清空</button>
          </>
        )}

        <h3 className="k-section">2. 提醒线</h3>
        <div className="ms-two">
          <div className="k-field">
            <label className="k-label" htmlFor="ms-low">低库存（件 ≤）</label>
            <input id="ms-low" className="k-input" type="number" min={0} value={prefs.lowStock} onChange={(e) => setP({ lowStock: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div className="k-field">
            <label className="k-label" htmlFor="ms-spread">价差提醒（%）</label>
            <input id="ms-spread" className="k-input" type="number" min={0} value={prefs.spreadPct} onChange={(e) => setP({ spreadPct: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
        </div>
      </section>

      <section className="k-panel ms-main">
        {error && <div className="k-notice err" role="alert" style={{ whiteSpace: 'pre-line' }}>{error}</div>}
        {notice && !error && <div className="k-notice ok">{notice}</div>}
        {!sources.length && !error && <div className="k-empty"><p>先在左边选平台、填店铺名，再导入该店的订单表或库存表。</p><p className="k-muted">多家店重复添加即可；订单和库存可分开导入。样例文件在安装目录旁的 samples 文件夹（见 README）。</p></div>}
        {sources.length > 0 && (
          <>
            <div className="ms-sum">
              <div><b className="k-num">{stores.length}</b><span className="k-muted">店铺</span></div>
              <div><b className="k-num">{totalOrders}</b><span className="k-muted">有效订单</span></div>
              <div><b className="k-num">{matrix.rows.length}</b><span className="k-muted">SKU（去重）</span></div>
              <div><b className="k-num">{alertSku}</b><span className="k-muted">需关注 SKU</span></div>
            </div>
            {mixed && !hasConv && <p className="ms-warn"><TriangleAlert size={13} /> 各店币种不同且未填汇率，GMV 不会相加。</p>}
            <div className="ms-bar">
              <div className="k-seg" role="tablist">
                <button role="tab" aria-selected={tab === 'store'} className={tab === 'store' ? 'on' : ''} onClick={() => setTab('store')}>店铺汇总</button>
                <button role="tab" aria-selected={tab === 'sku'} className={tab === 'sku' ? 'on' : ''} onClick={() => setTab('sku')}>SKU 跨店对照</button>
              </div>
              <button className="k-btn" disabled={!ctx} onClick={() => void doExport()}><Download size={14} />导出 Excel</button>
            </div>
            {outPath && <div className="ms-file"><Download size={15} /><span className="k-ellipsis" title={outPath}>{outPath}</span>{!preview && <button className="k-link" onClick={() => void reveal(outPath)}><FolderOpen size={14} />在文件夹中显示</button>}</div>}
            {tab === 'store' && (
              <div className="k-table-wrap k-scroll ms-table">
                <table className="k-table">
                  <thead><tr><th>店铺</th><th>币种</th><th>订单</th><th>取消</th><th>GMV</th><th>客单价</th>{hasConv && <th>折算 GMV</th>}<th>SKU</th><th>低库存</th><th>断货</th></tr></thead>
                  <tbody>{stores.map((s) => (
                    <tr key={s.key}>
                      <td>{s.store}<div className="k-muted ms-note">{platformName(s.platform)}</div></td><td>{s.currency}</td>
                      <td className="k-num">{s.orders}</td><td className="k-num">{s.cancelled}</td><td className="k-num">{money(s.gmv)}</td><td className="k-num">{money(s.aov)}</td>
                      {hasConv && <td className="k-num">{s.gmvConverted == null ? '—' : money(s.gmvConverted)}</td>}
                      <td className="k-num">{s.skus}</td><td className="k-num">{s.low}</td><td className="k-num">{s.out}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            )}
            {tab === 'sku' && (
              <div className="k-table-wrap k-scroll ms-table">
                {matrix.stores.length === 0 ? <p className="k-muted ms-note">还没有导入库存 / 商品表。</p> : (
                  <table className="k-table">
                    <thead><tr><th>SKU</th><th>名称</th>{matrix.stores.map((s) => <th key={s.key}>{s.label}</th>)}<th>提示</th></tr></thead>
                    <tbody>{matrix.rows.slice(0, 200).map((r) => (
                      <tr key={r.sku}>
                        <td className="k-num">{r.sku}</td><td>{r.name}</td>
                        {matrix.stores.map((s) => { const c = r.cells[s.key]; return <td key={s.key} className="k-num">{c ? `${c.stock}${c.price != null ? ` · ${c.price}` : ''}` : '—'}</td>; })}
                        <td className={r.flags.length ? 'ms-flag' : 'k-muted'}>{r.flags.join('；') || '—'}</td>
                      </tr>))}</tbody>
                  </table>
                )}
              </div>
            )}
            {preview && <p className="k-muted ms-note">当前是示例数据（虚构的店铺与商品）。库存格式：库存 · 价格。</p>}
          </>
        )}
      </section>
    </div>
  );
}
