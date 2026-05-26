import { useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  ExternalLink, Play, Plus, RefreshCw, ToggleLeft, ToggleRight, Trash2, Zap,
} from 'lucide-react';
import { Tooltip } from '../components/Tooltip';

const ENGINE_LABELS: Record<string, string> = {
  illustrator:   'Illustrator',
  indesign:      'InDesign',
  canva:         'Canva',
  adobe_express: 'Adobe Express',
};

const POLL_INTERVALS = [
  { value: 60_000,   label: '1 min' },
  { value: 120_000,  label: '2 min (default)' },
  { value: 300_000,  label: '5 min' },
  { value: 600_000,  label: '10 min' },
];

export function MondayScreen() {
  const [config, setConfig]       = useState<any>(null);
  const [apiKey, setApiKey]       = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string; user?: any } | null>(null);
  const [testing, setTesting]     = useState(false);

  // Board setup form
  const [showAddBoard, setShowAddBoard] = useState(false);
  const [boards, setBoards]       = useState<any[]>([]);
  const [columns, setColumns]     = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [loadingCols, setLoadingCols]     = useState(false);
  const [savingBoard, setSavingBoard]     = useState(false);

  const [form, setForm] = useState({
    boardId: '', boardName: '',
    triggerColumnId: '', triggerColumnTitle: '',
    triggerValue: 'Ready to Render',
    doneValue: 'Done',
    errorValue: 'Error',
    templateId: '', engine: '',
  });

  // Activity log
  const [activity, setActivity]   = useState<any[]>([]);
  const [polling, setPolling]     = useState(false);
  const [pollResult, setPollResult] = useState<any>(null);
  const [showLog, setShowLog]     = useState(true);

  async function refreshConfig() {
    const r = await window.creativePlatform.getMondayConfig();
    setConfig(r);
  }

  async function refreshActivity() {
    const r = await window.creativePlatform.getMondayActivity();
    if (r?.ok) setActivity(r.log || []);
  }

  useEffect(() => {
    refreshConfig();
    refreshActivity();
    window.creativePlatform.listTemplates().then((all: any[]) => {
      setTemplates((all || []).filter((t: any) => ['illustrator', 'indesign', 'canva'].includes(t.engine || (t.isCanva ? 'canva' : 'illustrator'))));
    });
  }, []);

  async function saveKey() {
    if (!apiKey.trim()) return;
    setSavingKey(true); setTestResult(null);
    try {
      await window.creativePlatform.setMondayApiKey(apiKey.trim(), true);
      setApiKey('');
      await refreshConfig();
    } finally { setSavingKey(false); }
  }

  async function testConnection() {
    setTesting(true); setTestResult(null);
    try {
      const r = await window.creativePlatform.testMondayConnection();
      setTestResult(r);
    } finally { setTesting(false); }
  }

  async function toggleEnabled() {
    if (!config) return;
    await window.creativePlatform.setMondayEnabled(!config.enabled);
    await refreshConfig();
  }

  async function fetchBoards() {
    setLoadingBoards(true);
    try {
      const r = await window.creativePlatform.listMondayBoards();
      if (r.ok) {
        setBoards(r.boards || []);
        if (r.boards?.length) setForm(f => ({ ...f, boardId: r.boards[0].id, boardName: r.boards[0].name }));
      }
    } finally { setLoadingBoards(false); }
  }

  async function fetchColumns(boardId: string) {
    if (!boardId) return;
    setLoadingCols(true); setColumns([]);
    try {
      const r = await window.creativePlatform.listMondayColumns(boardId);
      if (r.ok) {
        const statusCols = (r.columns || []).filter((c: any) => c.type === 'color' || c.type === 'status');
        setColumns(statusCols);
        if (statusCols.length) setForm(f => ({ ...f, triggerColumnId: statusCols[0].id, triggerColumnTitle: statusCols[0].title }));
      }
    } finally { setLoadingCols(false); }
  }

  async function addBoard() {
    if (!form.boardId || !form.triggerColumnId || !form.templateId) return;
    setSavingBoard(true);
    try {
      await window.creativePlatform.addMondayBoardConfig({
        boardId: form.boardId,
        boardName: form.boardName || form.boardId,
        triggerColumnId: form.triggerColumnId,
        triggerColumnTitle: form.triggerColumnTitle,
        triggerValue: form.triggerValue,
        doneValue: form.doneValue,
        errorValue: form.errorValue,
        templateId: form.templateId,
        engine: form.engine,
        enabled: true,
      });
      setShowAddBoard(false);
      setForm({ boardId: '', boardName: '', triggerColumnId: '', triggerColumnTitle: '', triggerValue: 'Ready to Render', doneValue: 'Done', errorValue: 'Error', templateId: '', engine: '' });
      await refreshConfig();
    } finally { setSavingBoard(false); }
  }

  async function removeBoard(id: string) {
    await window.creativePlatform.removeMondayBoardConfig(id);
    await refreshConfig();
  }

  async function toggleBoard(id: string, enabled: boolean) {
    await window.creativePlatform.toggleMondayBoard(id, !enabled);
    await refreshConfig();
  }

  async function pollNow() {
    setPolling(true); setPollResult(null);
    try {
      const r = await window.creativePlatform.triggerMondayPoll();
      setPollResult(r);
      await refreshConfig();
      await refreshActivity();
    } finally { setPolling(false); }
  }

  function templateEngineOf(t: any) {
    if (t.isCanva) return 'canva';
    if (t.isAdobeExpress) return 'adobe_express';
    return t.engine || 'illustrator';
  }

  const connected = config?.hasApiKey;
  const boardsConfigured = config?.boards?.length > 0;

  return (
    <div className="dashboard">

      {/* ── Connection panel ── */}
      <section className="panel" style={{ padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <Zap size={18} style={{ color: '#FF6B35', flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Monday.com Integration</span>
          {connected && (
            <button
              onClick={toggleEnabled}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: config.enabled ? 'var(--green)' : 'var(--muted)' }}
              title={config.enabled ? 'Disable polling' : 'Enable polling'}
            >
              {config.enabled
                ? <><ToggleRight size={22} /> <span style={{ fontSize: 12, fontWeight: 600 }}>Polling active</span></>
                : <><ToggleLeft size={22} /> <span style={{ fontSize: 12 }}>Polling paused</span></>
              }
            </button>
          )}
        </div>

        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          When a Monday.com item's status column changes to your trigger value (e.g. <em>"Ready to Render"</em>), the platform reads the row's columns, maps them to template fields, and fires the render job automatically. Results are posted back as an item update.
        </p>

        {/* API key */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="field-input"
            type="password"
            style={{ flex: 1, minWidth: 200, fontSize: 13 }}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={connected ? 'Paste new API key to replace…' : 'Paste Monday.com API key…'}
            onKeyDown={e => e.key === 'Enter' && saveKey()}
          />
          <button onClick={saveKey} disabled={savingKey || !apiKey.trim()} style={{ flexShrink: 0 }}>
            {savingKey ? <RefreshCw size={13} className="spin" /> : 'Save Key'}
          </button>
          {connected && (
            <Tooltip text="Verify the saved API key connects to Monday.com">
              <button className="secondary" onClick={testConnection} disabled={testing} style={{ flexShrink: 0, fontSize: 12 }}>
                {testing ? <><RefreshCw size={12} className="spin" /> Testing…</> : 'Test Connection'}
              </button>
            </Tooltip>
          )}
        </div>

        {connected && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)' }}>
            Key saved: <code>{config.maskedKey}</code>
            {config.lastPolledAt && <> · Last polled: {new Date(config.lastPolledAt).toLocaleTimeString()}</>}
          </p>
        )}

        {testResult && (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12,
            background: testResult.ok ? 'rgba(117,245,174,.08)' : 'rgba(255,116,116,.08)',
            border: `1px solid ${testResult.ok ? 'rgba(117,245,174,.25)' : 'rgba(255,116,116,.25)'}`,
            color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
            {testResult.ok
              ? <><CheckCircle2 size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />Connected as <strong>{testResult.user?.name}</strong> ({testResult.user?.email})</>
              : <><AlertTriangle size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />{testResult.message}</>
            }
          </div>
        )}

        {!connected && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            Get your API key: Monday.com → Avatar → Developers → <strong>My access tokens</strong>
            <a href="#" style={{ color: 'var(--accent)', marginLeft: 6 }}
              onClick={e => { e.preventDefault(); window.creativePlatform.openUrl('https://developer.monday.com/apps/manage/tokens'); }}>
              <ExternalLink size={11} style={{ verticalAlign: 'middle' }} /> Open tokens page
            </a>
          </p>
        )}
      </section>

      {/* ── Poll interval + manual trigger ── */}
      {connected && (
        <section className="panel" style={{ padding: '14px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Poll interval</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {POLL_INTERVALS.map(p => (
                <button
                  key={p.value}
                  className={(config?.pollIntervalMs ?? 120_000) === p.value ? '' : 'secondary'}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => window.creativePlatform.setMondayPollInterval(p.value).then(refreshConfig)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Tooltip text="Check all configured boards right now, regardless of the interval timer">
              <button className="secondary" style={{ fontSize: 12, marginLeft: 'auto' }} onClick={pollNow} disabled={polling || !boardsConfigured}>
                {polling ? <><RefreshCw size={12} className="spin" /> Polling…</> : <><Play size={12} /> Poll Now</>}
              </button>
            </Tooltip>
          </div>
          {pollResult && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: pollResult.ok ? 'var(--green)' : 'var(--muted)' }}>
              {pollResult.ok
                ? `Poll complete — ${pollResult.processed} rendered, ${pollResult.errors} errors, ${pollResult.skipped} skipped`
                : pollResult.message}
            </p>
          )}
        </section>
      )}

      {/* ── Configured boards ── */}
      {connected && (
        <section className="panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Configured Boards</h2>
            <button
              style={{ fontSize: 12, padding: '5px 12px', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={async () => { setShowAddBoard(v => !v); if (!showAddBoard) await fetchBoards(); }}
            >
              <Plus size={12} /> Add Board
            </button>
          </div>

          {/* Add-board form */}
          {showAddBoard && (
            <div style={{ marginBottom: 18, padding: '14px 16px', borderRadius: 8, background: 'rgba(255,200,80,.04)', border: '1px solid rgba(255,200,80,.18)' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 13 }}>Configure Board Trigger</h3>

              {/* Board picker */}
              <div className="field-group">
                <label>Board</label>
                {loadingBoards
                  ? <span style={{ fontSize: 12, color: 'var(--muted)' }}><RefreshCw size={11} className="spin" style={{ marginRight: 4 }} />Loading boards…</span>
                  : (
                    <select className="field-input" value={form.boardId}
                      onChange={e => {
                        const b = boards.find(b => b.id === e.target.value);
                        setForm(f => ({ ...f, boardId: e.target.value, boardName: b?.name || '' }));
                        if (e.target.value) fetchColumns(e.target.value);
                      }}>
                      <option value="">Select board…</option>
                      {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  )
                }
              </div>

              {/* Status column */}
              <div className="field-group">
                <label>Status Column <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(must be a Status column type)</span></label>
                {loadingCols
                  ? <span style={{ fontSize: 12, color: 'var(--muted)' }}><RefreshCw size={11} className="spin" style={{ marginRight: 4 }} />Loading columns…</span>
                  : columns.length > 0 ? (
                    <select className="field-input" value={form.triggerColumnId}
                      onChange={e => {
                        const c = columns.find(c => c.id === e.target.value);
                        setForm(f => ({ ...f, triggerColumnId: e.target.value, triggerColumnTitle: c?.title || '' }));
                      }}>
                      {columns.map(c => <option key={c.id} value={c.id}>{c.title} ({c.type})</option>)}
                    </select>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {form.boardId ? 'No status columns found on this board' : 'Select a board first'}
                    </span>
                  )
                }
              </div>

              {/* Trigger / Done / Error values */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div className="field-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11 }}>Trigger Value</label>
                  <input className="field-input" style={{ fontSize: 12 }} value={form.triggerValue}
                    onChange={e => setForm(f => ({ ...f, triggerValue: e.target.value }))}
                    placeholder="Ready to Render" />
                </div>
                <div className="field-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11 }}>Done Value</label>
                  <input className="field-input" style={{ fontSize: 12 }} value={form.doneValue}
                    onChange={e => setForm(f => ({ ...f, doneValue: e.target.value }))}
                    placeholder="Done" />
                </div>
                <div className="field-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11 }}>Error Value</label>
                  <input className="field-input" style={{ fontSize: 12 }} value={form.errorValue}
                    onChange={e => setForm(f => ({ ...f, errorValue: e.target.value }))}
                    placeholder="Error" />
                </div>
              </div>

              {/* Template picker */}
              <div className="field-group" style={{ marginTop: 10 }}>
                <label>Template</label>
                <select className="field-input" value={form.templateId}
                  onChange={e => {
                    const t = templates.find(t => t.id === e.target.value);
                    setForm(f => ({ ...f, templateId: e.target.value, engine: t ? templateEngineOf(t) : '' }));
                  }}>
                  <option value="">Select template…</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      [{ENGINE_LABELS[templateEngineOf(t)] || templateEngineOf(t)}] {t.name || t.id}
                    </option>
                  ))}
                </select>
                {form.engine && (
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'block' }}>
                    Engine: {ENGINE_LABELS[form.engine] || form.engine}
                  </span>
                )}
              </div>

              {/* Field mapping note */}
              <div style={{ margin: '10px 0', padding: '8px 12px', borderRadius: 6, background: 'rgba(103,216,255,.06)', border: '1px solid rgba(103,216,255,.18)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--accent)' }}>Auto field mapping:</strong> Monday column titles are normalized to UPPER_SNAKE_CASE and matched to template field keys.
                For example, a column titled <em>"Challenge Text"</em> maps to <code>CHALLENGE_TEXT</code> and also <code>TEXT_CHALLENGE_TEXT</code>.
                Name your Monday columns to match your template's editable field keys for zero-config mapping.
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={addBoard} disabled={savingBoard || !form.boardId || !form.triggerColumnId || !form.templateId}
                  style={{ fontSize: 12 }}>
                  {savingBoard ? <><RefreshCw size={12} className="spin" /> Saving…</> : 'Add Board Config'}
                </button>
                <button className="secondary" style={{ fontSize: 12 }} onClick={() => setShowAddBoard(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Board list */}
          {config?.boards?.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              No boards configured yet. Click <strong>Add Board</strong> to set up your first trigger.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {config.boards.map((b: any) => (
                <div key={b.id} style={{
                  padding: '12px 14px', borderRadius: 8,
                  background: 'var(--surface-dim)', border: '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  opacity: b.enabled ? 1 : 0.55,
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{b.boardName}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {b.triggerColumnTitle} = <strong>"{b.triggerValue}"</strong>
                      {' → '}<code style={{ fontSize: 10 }}>{b.templateId}</code>
                      {' · '}{ENGINE_LABELS[b.engine] || b.engine}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <Tooltip text={b.enabled ? 'Pause this board' : 'Enable this board'}>
                      <button className="secondary" style={{ fontSize: 11, padding: '4px 9px', display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => toggleBoard(b.id, b.enabled)}>
                        {b.enabled ? <><ToggleRight size={13} style={{ color: 'var(--green)' }} /> Active</> : <><ToggleLeft size={13} /> Paused</>}
                      </button>
                    </Tooltip>
                    <Tooltip text="Remove this board config">
                      <button className="secondary" style={{ fontSize: 11, padding: '4px 8px', color: 'var(--red)' }}
                        onClick={() => removeBoard(b.id)}>
                        <Trash2 size={12} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Activity log ── */}
      {connected && (
        <section className="panel">
          <button
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)', marginBottom: showLog ? 14 : 0 }}
            onClick={() => setShowLog(v => !v)}
          >
            <h2 style={{ margin: 0, fontSize: 16, flex: 1, textAlign: 'left' }}>Activity Log</h2>
            <button className="secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={e => { e.stopPropagation(); refreshActivity(); }}>
              <RefreshCw size={10} /> Refresh
            </button>
            {showLog ? <ChevronDown size={14} style={{ color: 'var(--muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--muted)' }} />}
          </button>

          {showLog && (
            activity.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No render activity yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activity.slice(0, 30).map((entry: any, i: number) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '8px 10px', borderRadius: 6, fontSize: 12,
                    background: entry.status === 'success' ? 'rgba(117,245,174,.05)' : entry.status === 'error' ? 'rgba(255,116,116,.05)' : 'var(--surface-dim)',
                    border: `1px solid ${entry.status === 'success' ? 'rgba(117,245,174,.15)' : entry.status === 'error' ? 'rgba(255,116,116,.15)' : 'var(--border-dim)'}`,
                  }}>
                    <span style={{ flexShrink: 0, marginTop: 1 }}>
                      {entry.status === 'success'
                        ? <CheckCircle2 size={13} style={{ color: 'var(--green)' }} />
                        : <AlertTriangle size={13} style={{ color: 'var(--red)' }} />
                      }
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.itemName || entry.itemId}
                        <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>— {entry.boardName}</span>
                      </div>
                      <div style={{ color: 'var(--muted)', marginTop: 2 }}>{entry.message}</div>
                      {entry.outputPath && (
                        <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.outputPath}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </section>
      )}
    </div>
  );
}
