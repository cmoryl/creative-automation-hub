import { useEffect, useState } from 'react';
import { Briefcase, Check, Copy, Edit2, Package, Plus, Star, Trash2, X, Zap } from 'lucide-react';
import { usePlatformStore } from '../state/usePlatformStore';
import { toast } from '../components/Toast';

const ENGINE_KEYS = ['illustrator', 'indesign', 'canva', 'figma', 'adobe_express'] as const;
const ENGINE_LABELS: Record<string, string> = {
  illustrator: 'Illustrator', indesign: 'InDesign', canva: 'Canva',
  figma: 'Figma', adobe_express: 'Adobe Express',
};
const ENGINE_COLORS: Record<string, { fg: string; bg: string; border: string }> = {
  illustrator:   { fg: 'var(--eng-illo)',  bg: 'var(--eng-illo-bg)',  border: 'var(--eng-illo-bd)'  },
  indesign:      { fg: 'var(--eng-indd)',  bg: 'var(--eng-indd-bg)',  border: 'var(--eng-indd-bd)'  },
  canva:         { fg: 'var(--eng-canva)', bg: 'var(--eng-canva-bg)', border: 'var(--eng-canva-bd)' },
  adobe_express: { fg: 'var(--eng-expr)',  bg: 'var(--eng-expr-bg)',  border: 'var(--eng-expr-bd)'  },
  figma:         { fg: 'var(--eng-figma)', bg: 'var(--eng-figma-bg)', border: 'var(--eng-figma-bd)' },
};
const PRESET_COLORS = ['#4f86f0','#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4'];

interface SubBrand { id: string; name: string; color: string; description: string }
interface Product  { id: string; name: string; description: string; category: string }
interface EditState {
  id?: string; name: string; color: string; description: string;
  templates: Record<string, string>; isMaster: boolean;
  subBrands: SubBrand[]; products: Product[];
}
const BLANK: EditState = { name:'', color:'#4f86f0', description:'', templates:{}, isMaster:false, subBrands:[], products:[] };

// hex → rgba helper
function rgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── glass icon button ─────────────────────────────────────────────────────────
function GlassBtn({ onClick, title, children, danger }: {
  onClick: (e: React.MouseEvent) => void; title: string;
  children: React.ReactNode; danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 32, height: 32, padding: 0, border: 'none',
        borderRadius: 8, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        background: hov
          ? danger ? 'rgba(201,60,60,.16)' : 'rgba(128,128,128,.14)'
          : 'rgba(128,128,128,.07)',
        outline: `1px solid ${hov
          ? danger ? 'rgba(201,60,60,.4)' : 'rgba(128,128,128,.3)'
          : 'rgba(128,128,128,.15)'}`,
        color: danger
          ? hov ? 'var(--red)' : 'rgba(201,60,60,.6)'
          : hov ? 'var(--text)' : 'var(--muted)',
        transition: 'background .12s, outline-color .12s, color .12s',
      }}
    >
      {children}
    </button>
  );
}

// ── brand card ────────────────────────────────────────────────────────────────
function BrandCard({ brand, isActive, onActivate, onEdit, onDuplicate, onDelete, confirmDeleteId, onNavigate }: any) {
  const assigned     = Object.values(brand.templates || {}).filter(Boolean).length;
  const color        = brand.color || '#4f86f0';
  const initial      = (brand.name || '?').charAt(0).toUpperCase();
  const refreshBrand = usePlatformStore(s => s.refreshBrand);

  return (
    <div
      onClick={() => onActivate(brand.id)}
      style={{
        position: 'relative', cursor: 'pointer',
        borderRadius: 22,
        padding: '22px 22px 18px',
        /* glass surface */
        background: isActive
          ? `linear-gradient(145deg, ${rgba(color,.09)} 0%, ${rgba(color,.04)} 100%)`
          : 'var(--surface-dim)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        /* gradient border */
        border: '1px solid transparent',
        backgroundClip: 'padding-box',
        boxShadow: isActive
          ? `0 0 0 1.5px ${rgba(color,.8)}, 0 12px 40px ${rgba(color,.18)}`
          : `0 4px 24px rgba(0,0,0,.1), 0 0 0 1px var(--border-subtle)`,
        transition: 'box-shadow .2s, background .2s',
      }}
    >
      {/* ambient glass highlight */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 22, pointerEvents: 'none',
        background: 'linear-gradient(135deg, var(--surface-mid) 0%, transparent 50%)',
      }} />

      {/* top-right badges */}
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 6, zIndex: 1 }}>
        {brand.isMaster && (
          <span style={{
            display:'inline-flex', alignItems:'center', gap:4,
            fontSize:10, fontWeight:700, letterSpacing:'.06em',
            padding:'4px 10px', borderRadius:99,
            background:'rgba(79,134,240,.08)',
            outline:'1.5px solid rgba(79,134,240,.4)',
            color:'var(--accent)',
          }}>
            <Star size={8} strokeWidth={2.5}/> MASTER
          </span>
        )}
        {isActive && (
          <span style={{
            display:'inline-flex', alignItems:'center', gap:4,
            fontSize:10, fontWeight:700, letterSpacing:'.06em',
            padding:'4px 10px', borderRadius:99,
            background: rgba(color,.15),
            outline: `1.5px solid ${rgba(color,.7)}`,
            color,
          }}>
            <Check size={9} strokeWidth={3}/> ACTIVE
          </span>
        )}
      </div>

      {/* brand identity */}
      <div style={{ display:'flex', alignItems:'center', gap:13, marginBottom:16, paddingRight:80 }}>
        {/* monogram avatar */}
        <div style={{
          width:50, height:50, borderRadius:'50%', flexShrink:0,
          background:`linear-gradient(145deg, ${rgba(color,.22)}, ${rgba(color,.08)})`,
          boxShadow: `0 0 0 1.5px ${rgba(color,.55)}, 0 4px 18px ${rgba(color,.25)}, inset 0 1px 0 rgba(255,255,255,.25)`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:17, fontWeight:900, color, letterSpacing:'-.01em',
          backdropFilter:'blur(10px)',
        }}>
          {initial}
        </div>
        <div style={{ minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:15, lineHeight:1.25, letterSpacing:'-.01em' }}>{brand.name}</div>
          {brand.description && (
            <div style={{ fontSize:12, color:'var(--muted)', marginTop:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {brand.description}
            </div>
          )}
        </div>
      </div>

      {/* engine tags — outline pills */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
        {ENGINE_KEYS.map(eng => {
          const tid = brand.templates?.[eng];
          const ec  = ENGINE_COLORS[eng];
          return (
            <span key={eng} style={{
              display:'inline-flex', alignItems:'center', gap:4,
              fontSize:11, fontWeight: tid ? 600 : 400,
              padding:'4px 10px', borderRadius:99,
              background: tid ? ec.bg : 'var(--surface-dim)',
              outline: `1.5px solid ${tid ? ec.border : 'var(--border-dim)'}`,
              color: tid ? ec.fg : 'var(--muted)',
              opacity: tid ? 1 : .55,
              transition:'opacity .15s',
            }}>
              {tid && <Check size={9} strokeWidth={3}/>}
              {ENGINE_LABELS[eng]}
            </span>
          );
        })}
      </div>

      {/* sub-brand / product chips */}
      {((brand.subBrands?.length > 0) || (brand.products?.length > 0)) && (
        <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
          {brand.subBrands?.length > 0 && (
            <span style={{
              display:'inline-flex', alignItems:'center', gap:4, fontSize:11,
              padding:'4px 10px', borderRadius:99,
              background:'rgba(79,134,240,.07)', outline:'1px solid rgba(79,134,240,.28)', color:'var(--accent)',
            }}>
              <Briefcase size={9}/> {brand.subBrands.length} sub-brand{brand.subBrands.length !== 1 ? 's' : ''}
            </span>
          )}
          {brand.products?.length > 0 && (
            <span style={{
              display:'inline-flex', alignItems:'center', gap:4, fontSize:11,
              padding:'4px 10px', borderRadius:99,
              background:'var(--surface-dim)', outline:'1px solid var(--border-subtle)', color:'var(--muted)',
            }}>
              <Package size={9}/> {brand.products.length} product{brand.products.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* footer */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        paddingTop:14,
        borderTop:'1px solid rgba(128,128,128,.12)',
      }}>
        <span style={{ fontSize:12, color:'var(--muted)', fontWeight:500 }}>
          {assigned} / {ENGINE_KEYS.length} engines
        </span>
        <div style={{ display:'flex', gap:5, alignItems:'center' }}>
          {onNavigate && assigned > 0 && (
            <button
              onClick={async e => { e.stopPropagation(); await window.creativePlatform.setActiveBrand(brand.id); refreshBrand(); onNavigate('Generate'); }}
              style={{
                display:'inline-flex', alignItems:'center', gap:5,
                fontSize:12, fontWeight:700, padding:'6px 14px', borderRadius:8,
                cursor:'pointer', border:'none',
                background: rgba(color,.15),
                outline: `1.5px solid ${rgba(color,.55)}`,
                color,
                boxShadow: `0 2px 12px ${rgba(color,.2)}`,
              }}
            >
              <Zap size={11}/> Generate
            </button>
          )}
          <GlassBtn onClick={e => { e.stopPropagation(); onEdit(brand, e); }} title="Edit"><Edit2 size={13}/></GlassBtn>
          <GlassBtn onClick={e => { e.stopPropagation(); onDuplicate(brand, e); }} title="Duplicate"><Copy size={13}/></GlassBtn>
          {confirmDeleteId === brand.id ? (
            <button
              onClick={e => { e.stopPropagation(); onDelete(brand.id, e); }}
              style={{
                fontSize:11, fontWeight:700, padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer',
                background:'rgba(201,60,60,.12)', outline:'1.5px solid rgba(201,60,60,.4)', color:'var(--red)',
              }}
            >Confirm?</button>
          ) : (
            <GlassBtn onClick={e => { e.stopPropagation(); onDelete(brand.id, e); }} title="Delete" danger><Trash2 size={13}/></GlassBtn>
          )}
        </div>
      </div>
    </div>
  );
}

// ── main screen ───────────────────────────────────────────────────────────────
export function BrandsScreen({ onNavigate }: { onNavigate?: (s: string) => void }) {
  const [brands, setBrands]     = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [allTemplates, setAllTemplates] = useState<any[]>([]);
  const [editing, setEditing]   = useState<EditState | null>(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const refreshBrand = usePlatformStore(s => s.refreshBrand);

  function load() {
    Promise.all([window.creativePlatform.listBrands(), window.creativePlatform.listTemplates()])
      .then(([br, tmpl]) => { setBrands(br.brands||[]); setActiveId(br.activeId||null); setAllTemplates(tmpl||[]); });
  }
  useEffect(() => { load(); }, []);

  function allTemplatesForEngine(engine: string) { return allTemplates.filter((t:any) => t.engine===engine); }

  async function handleSetActive(id: string) {
    const newId = activeId===id ? null : id;
    await window.creativePlatform.setActiveBrand(newId); setActiveId(newId); refreshBrand();
  }
  async function handleSave() {
    if (!editing) return; setError(null); setSaving(true);
    try {
      const res = editing.id ? await window.creativePlatform.updateBrand(editing) : await window.creativePlatform.createBrand(editing);
      if (!res.ok) { setError(res.message||'Save failed'); return; }
      toast(editing.id ? 'Brand updated.' : 'Brand created.'); setEditing(null); load();
    } finally { setSaving(false); }
  }
  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (confirmDeleteId!==id) { setConfirmDeleteId(id); return; }
    setConfirmDeleteId(null); await window.creativePlatform.deleteBrand(id);
    if (activeId===id) { setActiveId(null); refreshBrand(); } toast('Brand deleted.','error'); load();
  }
  function openEdit(brand: any, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing({ id:brand.id, name:brand.name, color:brand.color||'#4f86f0', description:brand.description||'',
      templates:{...brand.templates}, isMaster:brand.isMaster||false,
      subBrands: brand.subBrands?.map((s:any)=>({...s}))||[], products: brand.products?.map((p:any)=>({...p}))||[] });
    setError(null);
  }
  function openDuplicate(brand: any, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing({ name:'Copy of '+brand.name, color:brand.color||'#4f86f0', description:brand.description||'',
      templates:{...brand.templates}, isMaster:false,
      subBrands: brand.subBrands?.map((s:any)=>({...s, id:`sub_${Date.now()}_${Math.random().toString(36).slice(2,6)}`}))||[],
      products:  brand.products?.map((p:any)=>({...p, id:`prod_${Date.now()}_${Math.random().toString(36).slice(2,6)}`}))||[] });
    setError(null);
  }

  return (
    <div style={{ position:'relative', minHeight:'100%', padding:'36px 40px', boxSizing:'border-box', overflowY:'auto' }}>
      {/* ambient blobs — give glass something to blur */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0, overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'-10%', left:'20%', width:420, height:420, borderRadius:'50%', background:'radial-gradient(circle, rgba(79,134,240,.12) 0%, transparent 70%)', filter:'blur(40px)' }}/>
        <div style={{ position:'absolute', bottom:'10%', right:'15%', width:360, height:360, borderRadius:'50%', background:'radial-gradient(circle, rgba(139,70,232,.1) 0%, transparent 70%)', filter:'blur(40px)' }}/>
        <div style={{ position:'absolute', top:'40%', left:'5%', width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle, rgba(14,165,201,.08) 0%, transparent 70%)', filter:'blur(40px)' }}/>
      </div>

      <div style={{ position:'relative', zIndex:1, maxWidth:980 }}>
        {/* header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:36 }}>
          <div>
            <h1 style={{ margin:0, fontSize:22, fontWeight:700, letterSpacing:'-.03em' }}>Brand Profiles</h1>
            <p style={{ margin:'5px 0 0', fontSize:13, color:'var(--muted)', lineHeight:1.5 }}>
              Each profile maps a company or client to a specific template set across all engines.
            </p>
          </div>
          <button
            onClick={() => { setEditing({...BLANK}); setError(null); }}
            style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'9px 18px', fontSize:13, fontWeight:600, borderRadius:10, flexShrink:0, marginTop:2 }}
          >
            <Plus size={14}/> New Brand
          </button>
        </div>

        {/* empty state */}
        {brands.length===0 && (
          <div className="empty-state">
            <Briefcase size={40} className="empty-state-icon"/>
            <h3>No brand profiles yet</h3>
            <p>Create one to associate a company or client with its template set across all engines.</p>
            <div className="button-row">
              <button onClick={() => { setEditing({...BLANK}); setError(null); }} style={{ fontSize:13, padding:'8px 16px' }}>
                <Plus size={14}/> New Brand
              </button>
            </div>
          </div>
        )}

        {/* cards grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:18 }}>
          {brands.map(brand => (
            <BrandCard key={brand.id} brand={brand} isActive={activeId===brand.id}
              confirmDeleteId={confirmDeleteId} onActivate={handleSetActive}
              onEdit={openEdit} onDuplicate={openDuplicate} onDelete={handleDelete} onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>

      {/* edit / create modal */}
      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, backdropFilter:'blur(6px)' }}
          onClick={() => setEditing(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            width:560, maxHeight:'88vh', overflowY:'auto',
            background:'var(--panel)', backdropFilter:'blur(32px)',
            border:'1px solid var(--border-subtle)',
            borderRadius:20, padding:32,
            boxShadow:'0 32px 80px rgba(0,0,0,.4)',
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:26 }}>
              <h2 style={{ margin:0, fontSize:17, fontWeight:700, letterSpacing:'-.02em' }}>{editing.id ? 'Edit Brand' : 'New Brand'}</h2>
              <button onClick={() => setEditing(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4 }}><X size={16}/></button>
            </div>

            <MF label="Company / Brand Name *">
              <input value={editing.name} onChange={e => setEditing(v => v&&({...v, name:e.target.value}))}
                placeholder="e.g. Acme Corp" className="field-input"/>
            </MF>
            <MF label="Description (optional)">
              <input value={editing.description} onChange={e => setEditing(v => v&&({...v, description:e.target.value}))}
                placeholder="e.g. Healthcare client — dark theme" className="field-input"/>
            </MF>

            {/* master toggle */}
            <div onClick={() => setEditing(v => v&&({...v, isMaster:!v.isMaster}))}
              style={{
                display:'flex', alignItems:'center', gap:12, marginBottom:20, padding:'12px 14px',
                borderRadius:12, cursor:'pointer',
                background: editing.isMaster ? 'rgba(79,134,240,.07)' : 'rgba(128,128,128,.05)',
                outline: `1px solid ${editing.isMaster ? 'rgba(79,134,240,.3)' : 'rgba(128,128,128,.14)'}`,
                transition:'background .15s, outline-color .15s',
              }}>
              <Star size={14} style={{ color: editing.isMaster ? 'var(--accent)' : 'var(--muted)', flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color: editing.isMaster ? 'var(--accent)' : 'var(--text)' }}>Master Brand</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:1, lineHeight:1.4 }}>Designates this as the parent brand — sub-brands and products will be grouped under it</div>
              </div>
              <div style={{ width:34, height:20, borderRadius:99, background: editing.isMaster ? 'var(--accent)' : 'rgba(128,128,128,.2)', position:'relative', flexShrink:0, transition:'background .2s' }}>
                <div style={{ position:'absolute', top:3, left: editing.isMaster ? 17 : 3, width:14, height:14, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,.25)' }}/>
              </div>
            </div>

            <MF label="Brand Color">
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setEditing(v => v&&({...v, color:c}))}
                    style={{ width:28, height:28, borderRadius:'50%', background:c, padding:0, cursor:'pointer', border: editing.color===c ? '2.5px solid var(--panel)' : '2px solid transparent', outline: editing.color===c ? `2.5px solid ${c}` : 'none', flexShrink:0 }}/>
                ))}
              </div>
            </MF>

            <MF label="Template Assignments">
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {ENGINE_KEYS.map(eng => {
                  const ec  = ENGINE_COLORS[eng];
                  const val = editing.templates[eng] || '';
                  const opts = allTemplatesForEngine(eng);
                  return (
                    <div key={eng} style={{
                      display:'flex', alignItems:'center', gap:0,
                      borderRadius:9, overflow:'hidden',
                      border:'1px solid var(--line)',
                      background:'var(--surface-dim)',
                    }}>
                      {/* Engine label strip */}
                      <div style={{
                        display:'flex', alignItems:'center', gap:6,
                        padding:'7px 12px', flexShrink:0, width:130,
                        background: val ? ec.bg : 'transparent',
                        borderRight:'1px solid var(--line)',
                      }}>
                        <div style={{
                          width:7, height:7, borderRadius:'50%', flexShrink:0,
                          background: val ? ec.fg : 'var(--border-mid)',
                        }}/>
                        <span style={{ fontSize:12, fontWeight:600, color: val ? ec.fg : 'var(--muted)', whiteSpace:'nowrap' }}>
                          {ENGINE_LABELS[eng]}
                        </span>
                      </div>
                      {/* Select — wrapper keeps the chevron in the right place */}
                      <div style={{ flex:1, position:'relative', display:'flex', alignItems:'center' }}>
                        <select
                          value={val}
                          onChange={e => setEditing(v => v && ({ ...v, templates:{ ...v.templates, [eng]:e.target.value } }))}
                          style={{
                            width:'100%', appearance:'none', border:'none', outline:'none',
                            background:'transparent', color: val ? 'var(--text)' : 'var(--muted)',
                            fontSize:12, fontWeight: val ? 500 : 400, fontFamily:'inherit',
                            padding:'8px 32px 8px 12px', cursor:'pointer',
                          }}
                        >
                          <option value="">— None —</option>
                          {opts.map((t:any) => <option key={t.id} value={t.id}>{t.name||t.id}</option>)}
                        </select>
                        {/* Single SVG chevron — rendered in JSX, no CSS background tricks */}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          style={{ position:'absolute', right:10, pointerEvents:'none', color:'var(--muted)', flexShrink:0 }}>
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </div>
                    </div>
                  );
                })}
              </div>
            </MF>

            <SubSec label="Sub-brands"
              onAdd={() => setEditing(v => v&&({...v, subBrands:[...v.subBrands, {id:`sub_${Date.now()}`, name:'', color:'#6366f1', description:''}]}))}
              empty="No sub-brands yet.">
              {editing.subBrands.map((sb, i) => (
                <div key={sb.id} style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'10px 12px', borderRadius:10, background:'rgba(128,128,128,.05)', outline:'1px solid rgba(128,128,128,.12)' }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:sb.color, flexShrink:0, marginTop:4, boxShadow:`0 0 8px ${sb.color}55` }}/>
                  <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
                    <input value={sb.name} onChange={e => setEditing(v => { if(!v) return v; const s=[...v.subBrands]; s[i]={...s[i],name:e.target.value}; return {...v,subBrands:s}; })} placeholder="Sub-brand name" className="field-input" style={{ fontSize:12, padding:'5px 9px' }}/>
                    <input value={sb.description} onChange={e => setEditing(v => { if(!v) return v; const s=[...v.subBrands]; s[i]={...s[i],description:e.target.value}; return {...v,subBrands:s}; })} placeholder="Description" className="field-input" style={{ fontSize:12, padding:'5px 9px' }}/>
                    <div style={{ display:'flex', gap:5 }}>{PRESET_COLORS.slice(0,7).map(c => <button key={c} onClick={() => setEditing(v => { if(!v) return v; const s=[...v.subBrands]; s[i]={...s[i],color:c}; return {...v,subBrands:s}; })} style={{ width:16, height:16, borderRadius:'50%', background:c, padding:0, cursor:'pointer', border: sb.color===c ? '2px solid #fff':'1px solid transparent', outline: sb.color===c ? `2px solid ${c}`:'none' }}/>)}</div>
                  </div>
                  <button onClick={() => setEditing(v => v&&({...v, subBrands:v.subBrands.filter((_,j)=>j!==i)}))} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:2, flexShrink:0 }}><X size={12}/></button>
                </div>
              ))}
            </SubSec>

            <SubSec label="Products"
              onAdd={() => setEditing(v => v&&({...v, products:[...v.products, {id:`prod_${Date.now()}`, name:'', description:'', category:''}]}))}
              empty="No products yet.">
              {editing.products.map((prod, i) => (
                <div key={prod.id} style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'10px 12px', borderRadius:10, background:'rgba(128,128,128,.05)', outline:'1px solid rgba(128,128,128,.12)' }}>
                  <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
                    <div style={{ display:'flex', gap:6 }}>
                      <input value={prod.name} onChange={e => setEditing(v => { if(!v) return v; const p=[...v.products]; p[i]={...p[i],name:e.target.value}; return {...v,products:p}; })} placeholder="Product name" className="field-input" style={{ flex:1, fontSize:12, padding:'5px 9px' }}/>
                      <input value={prod.category} onChange={e => setEditing(v => { if(!v) return v; const p=[...v.products]; p[i]={...p[i],category:e.target.value}; return {...v,products:p}; })} placeholder="Category" className="field-input" style={{ width:100, fontSize:12, padding:'5px 9px' }}/>
                    </div>
                    <input value={prod.description} onChange={e => setEditing(v => { if(!v) return v; const p=[...v.products]; p[i]={...p[i],description:e.target.value}; return {...v,products:p}; })} placeholder="Description" className="field-input" style={{ fontSize:12, padding:'5px 9px' }}/>
                  </div>
                  <button onClick={() => setEditing(v => v&&({...v, products:v.products.filter((_,j)=>j!==i)}))} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:2, flexShrink:0 }}><X size={12}/></button>
                </div>
              ))}
            </SubSec>

            {error && <p style={{ fontSize:12, color:'var(--red)', margin:'0 0 14px' }}>{error}</p>}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:4 }}>
              <button onClick={() => setEditing(null)} className="secondary" style={{ padding:'8px 18px', fontSize:13 }}>Cancel</button>
              <button onClick={handleSave} disabled={saving||!editing.name.trim()} style={{ padding:'8px 20px', fontSize:13 }}>
                {saving ? 'Saving…' : editing.id ? 'Save Changes' : 'Create Brand'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── tiny helpers ──────────────────────────────────────────────────────────────
function MF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:18 }}>
      <label style={{ display:'block', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', marginBottom:7 }}>{label}</label>
      {children}
    </div>
  );
}
function SubSec({ label, onAdd, empty, children }: { label:string; onAdd:()=>void; empty:string; children:React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const items = arr.filter(Boolean);
  return (
    <div style={{ marginBottom:22 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)' }}>{label}</label>
        <button onClick={onAdd} style={{ background:'rgba(128,128,128,.08)', border:'none', outline:'1px solid rgba(128,128,128,.18)', borderRadius:6, padding:'4px 10px', fontSize:11, color:'var(--muted)', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4, fontWeight:600 }}>
          <Plus size={11}/> Add
        </button>
      </div>
      {items.length===0 && <p style={{ fontSize:12, color:'var(--muted)', margin:0, opacity:.5, fontStyle:'italic' }}>{empty}</p>}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>{children}</div>
    </div>
  );
}
