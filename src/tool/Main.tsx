// 主界面：顶部一条导入栏（平台、店铺、表格类型、币种、汇率）；下面是每家店一张成交额卡，再下面是跨店 SKU 库存热力对照，导出 Excel。
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Download, FileUp, FolderOpen, PackageX, Trash2, TriangleAlert, X } from 'lucide-react';
import type { CustomTool } from '../kit/types';
import { defaultOutputDir, pickFiles, reveal } from '../kit/platform';
import { useDroppedFiles } from '../kit/parts';
import { PLATFORMS, platformName, skuMatrix, storeSummary, money, isLow, type Kind, type Platform, type Source } from './core';
import { errText } from './common';
import { exportReport, loadSource } from './flow';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from './store';
import { demoSources, isPreview } from './preview';
import './tool.css';

type Ctx = Parameters<CustomTool['Main']>[0]['ctx'];

export function Main({ ctx }: { ctx?: Ctx }) {
  const preview = isPreview();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [sources, setSources] = useState<Source[]>(() => (preview ? demoSources() : []));
  const [platform, setPlatform] = useState<Platform>('shopee');
  const [store, setStore] = useState('');
  const [kind, setKind] = useState<Kind>('orders');
  const [rate, setRate] = useState('');
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
  const cur = (c: string) => c || '—';
  return (
    <div className="ms-root">
      <section className="ms-add" aria-label="添加数据">
        <div className="ms-add-grid">
          <div className="k-field">
            <label className="k-label" htmlFor="ms-pf">平台</label>
            <select id="ms-pf" className="k-input" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
              {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="k-field ms-wide">
            <label className="k-label" htmlFor="ms-store">店铺名（同名自动合并）</label>
            <input id="ms-store" className="k-input" value={store} placeholder="例如：马来站旗舰店" onChange={(e) => setStore(e.target.value)} />
          </div>
          <div className="k-field">
            <span className="k-label">表格类型</span>
            <div className="k-seg" role="group" aria-label="表格类型">
              <button className={kind === 'orders' ? 'on' : ''} onClick={() => setKind('orders')}>订单表</button>
              <button className={kind === 'stock' ? 'on' : ''} onClick={() => setKind('stock')}>库存 / 商品表</button>
            </div>
          </div>
          <div className="k-field">
            <label className="k-label" htmlFor="ms-cur">币种</label>
            <input id="ms-cur" className="k-input" value={prefs.currency} placeholder="MYR" onChange={(e) => setP({ currency: e.target.value })} />
          </div>
          <div className="k-field">
            <label className="k-label" htmlFor="ms-rate">汇率（可不填）</label>
            <input id="ms-rate" className="k-input" inputMode="decimal" value={rate} placeholder="1 本币 = ?" onChange={(e) => setRate(e.target.value)} />
          </div>
          <button className="k-btn primary ms-import" disabled={!ctx} onClick={() => void pickFiles(['xlsx', 'csv'], '订单 / 库存表').then((p) => { if (p.length) void importFiles(p); })}><FileUp size={15} />导入文件{hover && ' · 松开即可导入'}</button>
        </div>
        <p className="ms-risk"><TriangleAlert size={14} /><span>只读卖家后台导出的表格，不登录、不调接口、不改店铺数据；汇率自己填，不填则各币种分开、不相加。表格可直接拖进窗口。</span></p>
      </section>

      {error && <div className="k-notice err" role="alert" style={{ whiteSpace: 'pre-line' }}>{error}</div>}
      {notice && !error && <div className="k-notice ok">{notice}</div>}

      {sources.length > 0 && (
        <div className="ms-chips">
          {stores.map((st) => {
            const mine = sources.filter((x) => `${x.platform}|${x.store}` === st.key);
            return (
              <span key={st.key} className="ms-chip" title={mine.map((x) => x.file).join('、')}>
                <b>{st.store}</b><span>{mine.map(detail).join(' · ')}</span>
                <button className="ms-x" aria-label={`移除 ${st.store}`} onClick={() => setSources((l) => l.filter((x) => `${x.platform}|${x.store}` !== st.key))}><X size={14} /></button>
              </span>);
          })}
          <button className="k-link ms-clear" onClick={() => { setSources([]); setOutPath(''); setNotice(''); }}><Trash2 size={14} />全部清空</button>
        </div>
      )}

      {!sources.length && !error && (
        <section className="ms-empty">
          <div className="ms-flow" aria-hidden="true">
            <div className="ms-flow-src">
              {['Shopee 马来店', 'Lazada 泰国店', 'TikTok Shop 印尼店'].map((n) => <div key={n} className="ms-tile"><b>{n}</b><span>订单表 + 库存表</span></div>)}
            </div>
            <ArrowRight size={28} className="ms-flow-arrow" />
            <div className="ms-board">
              <div className="ms-board-row"><i className="ok" /><i className="low" /><i className="ok" /></div>
              <div className="ms-board-row"><i className="out" /><i className="ok" /><i className="low" /></div>
              <div className="ms-board-row"><i className="ok" /><i className="ok" /><i className="out" /></div>
              <span>一张看板</span>
            </div>
          </div>
          <h2>多家店的表，合成一张看板</h2>
          <p>先在上面选平台、填店铺名，再导入该店的订单表或库存表。每家店得到一张成交额卡，同一个 SKU 在各店的库存摆成一行：哪家断货、哪家积压，颜色一眼看出。</p>
          <p className="k-muted">订单和库存可分开导入，多家店重复添加即可。样例文件在安装目录旁的样例文件夹里（见说明文档）。</p>
        </section>
      )}

      {sources.length > 0 && (
        <>
          <div className="ms-head">
            <div className="ms-kpis">
              <span><b className="k-num">{stores.length}</b>家店</span>
              <span><b className="k-num">{totalOrders}</b>有效订单</span>
              <span><b className="k-num">{matrix.rows.length}</b>个 SKU（去重）</span>
              <span className={alertSku ? 'hot' : ''}><b className="k-num">{alertSku}</b>个需关注</span>
            </div>
            <button className="k-btn" disabled={!ctx} onClick={() => void doExport()}><Download size={15} />导出 Excel</button>
          </div>
          {outPath && <div className="ms-file"><Download size={15} /><span className="k-ellipsis" title={outPath}>{outPath}</span>{!preview && <button className="k-link" onClick={() => void reveal(outPath)}><FolderOpen size={14} />在文件夹中显示</button>}</div>}
          {mixed && !hasConv && <p className="ms-warn"><TriangleAlert size={14} />各店币种不同且未填汇率，成交额不会相加。</p>}

          <div className="ms-cards">
            {stores.map((s) => {
              const okN = Math.max(0, s.skus - s.low - s.out);
              return (
                <article key={s.key} className="ms-card">
                  <header><b>{s.store}</b><span className="ms-pf">{platformName(s.platform)}</span></header>
                  <div className="ms-big"><span className="k-num">{money(s.gmv)}</span><em>{cur(s.currency)} 成交额{hasConv && <b className="ms-conv k-num">{s.gmvConverted == null ? '　未填汇率' : `　折算 ${money(s.gmvConverted)}`}</b>}</em></div>
                  <dl className="ms-facts">
                    <div><dt>有效订单</dt><dd className="k-num">{s.orders}</dd></div>
                    <div><dt>取消</dt><dd className="k-num">{s.cancelled}</dd></div>
                    <div><dt>客单价</dt><dd className="k-num">{money(s.aov)}</dd></div>
                  </dl>
                  {s.skus > 0 ? (
                    <div className="ms-health" role="img" aria-label={`库存：正常 ${okN}、低库存 ${s.low}、断货 ${s.out}`}>
                      <div className="ms-hbar"><i className="ok" style={{ flex: okN }} /><i className="low" style={{ flex: s.low }} /><i className="out" style={{ flex: s.out }} /></div>
                      <span className="k-num">共 {s.skus} 个 SKU：正常 {okN} · 低库存 {s.low} · 断货 {s.out}</span>
                    </div>
                  ) : <div className="ms-health"><span>还没导入库存表</span></div>}
                </article>
              );
            })}
          </div>

          <section className="ms-matrix">
            <div className="ms-mh">
              <h2>SKU 跨店库存对照</h2>
              <div className="ms-legend"><i className="ok" />正常<i className="low" />低库存<i className="out" />断货</div>
              <label className="ms-th"><span>低库存（件 ≤）</span><input className="k-input" type="number" min={0} value={prefs.lowStock} onChange={(e) => setP({ lowStock: Math.max(0, Number(e.target.value) || 0) })} /></label>
              <label className="ms-th"><span>价差提醒（%）</span><input className="k-input" type="number" min={0} value={prefs.spreadPct} onChange={(e) => setP({ spreadPct: Math.max(0, Number(e.target.value) || 0) })} /></label>
            </div>
            {matrix.stores.length === 0 ? <p className="k-muted ms-note">还没有导入库存 / 商品表。</p> : (
              <div className="k-table-wrap k-scroll ms-table">
                <table className="k-table">
                  <thead><tr><th>SKU</th><th>名称</th>{matrix.stores.map((s) => <th key={s.key}>{s.label}</th>)}<th>提示</th></tr></thead>
                  <tbody>{matrix.rows.slice(0, 200).map((r) => (
                    <tr key={r.sku}>
                      <td className="k-num">{r.sku}</td><td>{r.name}</td>
                      {matrix.stores.map((s) => {
                        const c = r.cells[s.key];
                        if (!c) return <td key={s.key} className="ms-cell none">—</td>;
                        const lv = c.stock <= 0 ? 'out' : isLow(c.stock, prefs) ? 'low' : 'ok';
                        return <td key={s.key} className={`ms-cell ${lv}`}><b className="k-num">{c.stock <= 0 ? <><PackageX size={13} />断货</> : c.stock}</b>{c.price != null && <span className="k-num">{c.currency} {c.price}</span>}</td>;
                      })}
                      <td className={r.flags.length ? 'ms-flag' : 'k-muted'}>{r.flags.join('；') || '—'}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            )}
            {preview && <p className="k-muted ms-note">当前是示例数据（虚构的店铺与商品）。格子里上面是库存件数，下面是售价。</p>}
          </section>
        </>
      )}
    </div>
  );
}
