import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Copy, FileText, Flag, LoaderCircle, Maximize2, Minus, MoreHorizontal, RefreshCw, Search, TriangleAlert, X } from 'lucide-react';
import { useLocalization } from './LocalizationContext.jsx';
import SettingsRenderer from './SettingsRenderer.jsx';
import './extension-view.css';

export default function ExtensionViewApp() {
  const api = window.resolveExtensionView;
  const { t } = useLocalization();
  const [state, setState] = useState(null), [error, setError] = useState(''), [panel, setPanel] = useState(false), [values, setValues] = useState({});
  const shell = useRef(null), search = useRef(null), menu = useRef(null), actionButton = useRef(null), saveButton = useRef(null);
  const sending = useRef(false), pending = useRef(null), formVersion = useRef(null), draftRequest = useRef(Promise.resolve());
  const view = state?.view, busy = !state || ['loading', 'running'].includes(state.phase), isForm = view?.type === 'form';
  const ready = state?.phase === 'ready', confirmation = state?.confirmation, discarding = confirmation?.kind === 'discard';
  const items = (view?.items || []).filter((item) => (!state.filter || item.tag === state.filter)
    && (!state.query.trim() || [item.title, item.subtitle, item.tag].filter(Boolean).join(' ').toLocaleLowerCase().includes(state.query.trim().toLocaleLowerCase())));
  const selected = items.find((item) => item.id === state?.selectedId), selectedIds = state?.selectedIds || [], multi = state?.multiSelect;
  const actions = [...(multi ? selectedIds.length ? (view?.batchActions || []).map((a) => ({ ...a, scope: 'batch' })) : []
    : (selected?.actions || []).map((a) => ({ ...a, scope: 'item' }))), ...(view?.actions || []).map((a) => ({ ...a, scope: 'view' }))];
  const tags = [...new Set((view?.items || []).map((item) => item.tag).filter(Boolean))];
  async function call(fn) { try { setError(''); return await fn(); } catch (failure) { setError(failure.message); } }
  useEffect(() => {
    if (!api) return;
    let active = true;
    const update = (next) => { if (active && next) setState((old) => old?.serial > next.serial ? old : next); };
    const off = api.onChanged(update); api.get().then(update).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; off(); };
  }, [api]);
  useEffect(() => {
    if (isForm && formVersion.current !== state.version) { formVersion.current = state.version; setValues(state.values || {}); draftRequest.current = Promise.resolve(); }
  }, [isForm, state?.version]);
  useEffect(() => {
    setPanel(false);
    const frame = requestAnimationFrame(() => (view?.type === 'list' ? search.current : isForm
      ? shell.current?.querySelector('main input, main textarea, main select') : shell.current?.querySelector('main'))?.focus());
    return () => cancelAnimationFrame(frame);
  }, [view?.type, state?.depth, ready, state?.version]);
  useEffect(() => { if (panel) menu.current?.querySelector('button')?.focus(); }, [panel]);
  useEffect(() => { shell.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [state?.selectedId]);
  useEffect(() => {
    if (confirmation) shell.current?.querySelector(discarding ? '.view-confirmation .primary-button' : '.view-confirmation button')?.focus();
    else if (pending.current) (isForm ? saveButton.current : actionButton.current)?.focus();
    else if (isForm) shell.current?.querySelector('main input, main textarea, main select')?.focus();
  }, [confirmation]);
  function closePanel() { setPanel(false); actionButton.current?.focus(); }
  function select(query = state.query, filter = state.filter, selectedId = state.selectedId, extras = {}) {
    return call(() => api.select({ query, filter, selectedId, version: state.version, ...extras }));
  }
  function toggle(id) { void select(state.query, state.filter, id, { selectedIds: selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id] }); }
  function change(key, value) {
    const next = { ...values }; if (value === undefined) delete next[key]; else next[key] = value;
    setValues(next); setError('');
    draftRequest.current = api.draft({ version: state.version, values: next });
    draftRequest.current.catch((failure) => setError(failure.message));
  }
  async function act(action, confirmed = false) {
    if (!ready || sending.current || !action) return;
    sending.current = true; setPanel(false);
    try { await call(() => api.action({ id: action.id, scope: action.scope, itemId: action.scope === 'item' ? selected?.id : null,
      ...(action.scope === 'batch' ? { itemIds: selectedIds } : {}), version: state.version, confirmed })); }
    finally { sending.current = false; if (action.type === 'copy' || action.type === 'extension') actionButton.current?.focus(); }
  }
  async function submit(event, confirmed = false) {
    event?.preventDefault();
    if (!ready || sending.current) return;
    sending.current = true; pending.current = { submit: true, title: view.submit.title };
    try { await call(async () => { await draftRequest.current; await api.submit({ version: state.version, confirmed }); }); }
    finally { sending.current = false; }
  }
  function run(action) { pending.current = action; void act(action); }
  const icons = { copy: Copy, detail: FileText, refresh: RefreshCw, back: ArrowLeft, extension: ChevronRight };
  return <div className="settings-shell extension-view-shell" ref={shell} onKeyDown={(event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (panel) closePanel();
      else if (confirmation) void call(() => api.cancelConfirmation());
      else if (!busy && state?.depth > 1) void call(() => api.back());
      return;
    }
    if (confirmation) {
      if (event.key === 'Tab') {
        event.preventDefault(); const buttons = [...shell.current.querySelectorAll('.view-confirmation button')];
        const index = buttons.indexOf(document.activeElement); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
      return;
    }
    if (event.ctrlKey && event.key === '.') { event.preventDefault(); if (ready && actions.length) { if (panel) closePanel(); else setPanel(true); } return; }
    if (panel || !ready || isForm) return;
    if (view?.type === 'list' && multi && event.key === ' ' && !['INPUT', 'BUTTON', 'SELECT'].includes(event.target.tagName)) { event.preventDefault(); if (selected) toggle(selected.id); return; }
    if (view?.type === 'list' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && event.target.tagName !== 'SELECT'
      && (!['Home', 'End'].includes(event.key) || event.target !== search.current)) {
      event.preventDefault();
      const index = items.findIndex((item) => item.id === state.selectedId);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
      void select(state.query, state.filter, items[next]?.id || null);
    } else if (event.key === 'Enter' && !['BUTTON', 'SELECT', 'INPUT'].includes(event.target.tagName) && actions[0]
      || event.key === 'Enter' && event.target === search.current && actions[0]) { event.preventDefault(); run(actions[0]); }
  }}>
    <header className="settings-titlebar">
      <div className="settings-titlebar-drag"><span className="settings-titlebar-label">{state?.extensionName || t('view.title')}</span></div>
      <button type="button" className="settings-titlebar-close" aria-label={t('view.minimize')} onClick={() => api.window('minimize')}><Minus size={16} /></button>
      <button type="button" className="settings-titlebar-close" aria-label={t('view.maximize')} onClick={() => api.window('maximize')}><Maximize2 size={14} /></button>
      <button type="button" className="settings-titlebar-close" aria-label={t('commandUi.close')} onClick={() => api.window('close')}><X size={18} /></button>
    </header>
    <div className="view-heading">
      {state?.depth > 1 && <button className="secondary-button" disabled={busy || !!confirmation} type="button" aria-label={t('view.back')} onClick={() => call(() => api.back())}><ArrowLeft size={16} /></button>}
      <div><h1>{view?.title || t('view.title')}</h1>{view?.subtitle && <p>{view.subtitle}</p>}{isForm && state.dirty && <span className="view-draft-state">{t('view.unsaved')}</span>}</div>
      <button className="secondary-button" type="button" disabled={busy || !!confirmation} aria-label={t('commandUi.prepare.refresh')} onClick={() => call(() => api.refresh())}><RefreshCw size={16} /></button>
    </div>
    {view?.type === 'list' && <>
      <div className="view-search"><Search size={16} /><input ref={search} aria-label={t('view.search')} placeholder={t('view.search')} value={state.query} disabled={!ready || !!confirmation} onChange={(event) => select(event.target.value)}
        role="combobox" aria-autocomplete="list" aria-controls="extension-items" aria-expanded="true" aria-activedescendant={selected ? 'view-item-' + items.indexOf(selected) : undefined} />
        {tags.length > 0 && <select aria-label={t('view.filter')} value={state.filter} disabled={!ready || !!confirmation} onChange={(event) => select(state.query, event.target.value)}><option value="">{t('view.all')}</option>{tags.map((tag) => <option key={tag}>{tag}</option>)}</select>}
      </div>
      {view.batchActions?.length > 0 && <div className="view-selection-toolbar">
        <button className="secondary-button" type="button" disabled={!ready || !!confirmation} aria-pressed={multi} onClick={() => select(state.query, state.filter, state.selectedId, { multiSelect: !multi })}>{t(multi ? 'view.singleSelect' : 'view.multiSelect')}</button>
        {multi && <><span>{t('view.selectedCount', { count: selectedIds.length })}</span><button className="secondary-button" type="button" disabled={!ready || !!confirmation || items.length > 100} onClick={() => select(state.query, state.filter, state.selectedId, { selectedIds: items.map((item) => item.id) })}>{t('view.selectVisible')}</button><button className="secondary-button" type="button" disabled={!ready || !!confirmation || !selectedIds.length} onClick={() => select(state.query, state.filter, state.selectedId, { selectedIds: [] })}>{t('view.clearSelection')}</button></>}
      </div>}
    </>}
    {state?.summary && <section className="view-result" role="status"><p>{t('view.resultCounts', state.summary)}</p>{state.summary.errors.length > 0 && <ul>{state.summary.errors.map((failure) => <li key={failure.id}>{failure.message}</li>)}</ul>}</section>}
    <main className="view-content" tabIndex={-1} aria-busy={busy} inert={confirmation ? '' : undefined}>
      {isForm ? <form id="extension-form" className="view-form" onSubmit={submit}>
        <SettingsRenderer schema={view.inputs} values={values} runtime t={t} disabled={busy || !!confirmation} onChange={change}
          onPick={async (_type, key) => (await call(() => api.pick({ key, version: state.version }))) ?? null} />
        {busy && <p role="status">{t('view.saving')}</p>}
        {state.error && <p role="alert" className="command-failure">{state.error.message} {t('view.saveFailedHint')}</p>}
      </form> : busy ? <div className="view-state" role="status"><LoaderCircle size={24} /><h2>{t(state?.phase === 'running' ? 'view.running' : 'view.loading')}</h2><p>{t('view.wait')}</p></div>
        : state?.phase === 'error' ? <div className="view-state" role="alert"><TriangleAlert size={24} /><h2>{t(state.error?.timeout ? 'commandUi.timeout' : 'view.failed')}</h2><p>{state.error?.message}</p><p>{t('view.retryHint')}</p><button className="secondary-button" type="button" onClick={() => call(() => api.refresh())}>{t('commandUi.prepare.retry')}</button></div>
        : view?.type === 'list' ? <div id="extension-items" role="listbox" aria-label={view.title} aria-multiselectable={multi || undefined}>
          {items.length ? items.map((item, index) => <div key={item.id} id={'view-item-' + index} role="option" aria-selected={multi ? selectedIds.includes(item.id) : item.id === state.selectedId} data-active={item.id === state.selectedId} tabIndex={item.id === state.selectedId ? 0 : -1}
            className="view-list-row" onClick={() => select(state.query, state.filter, item.id)} onDoubleClick={() => { if (!multi && item.id === state.selectedId && actions[0]) run(actions[0]); }}>
            {multi ? <input type="checkbox" aria-label={t('view.selectItem', { title: item.title })} checked={selectedIds.includes(item.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggle(item.id)} /> : <Flag size={16} />}
            <div><span className="view-item-title">{item.title}</span>{item.subtitle && <span className="view-item-subtitle">{item.subtitle}</span>}</div>
            {item.tag && <span className="view-item-tag">{item.tag}</span>}{!multi && <ChevronRight size={14} />}
          </div>) : <div className="view-state"><Flag size={24} /><h2>{t(state.query || state.filter ? 'view.noMatches' : 'view.empty')}</h2><p>{state.query || state.filter ? t('view.adjustSearch') : view.emptyMessage || t('view.emptyHint')}</p></div>}
        </div> : view && <article className="view-detail">{view.text && <p className="view-detail-text">{view.text}</p>}{view.fields?.length > 0 && <dl>{view.fields.map((field, index) => <React.Fragment key={index}><dt>{field.label}</dt><dd>{field.value}</dd></React.Fragment>)}</dl>}</article>}
    </main>
    {confirmation && <section className="view-confirmation" role="alertdialog" aria-modal="true" aria-label={t(discarding ? 'view.unsaved' : 'commandUi.confirm')}>
      <TriangleAlert size={18} /><p>{discarding ? t('view.discardHint') : confirmation.message}</p><div>
        <button className="secondary-button" type="button" onClick={() => call(() => discarding ? api.discard() : api.cancelConfirmation())}>{t(discarding ? 'view.discard' : 'settings.cancel')}</button>
        <button className="primary-button" type="button" onClick={() => discarding ? call(() => api.cancelConfirmation()) : confirmation.kind === 'submit' ? submit(null, true) : act(pending.current, true)}>{discarding ? t('view.keepEditing') : confirmation.kind === 'submit' ? view.submit.title : pending.current?.title || t('commandUi.confirm')}</button>
      </div>
    </section>}
    {panel && <><button type="button" className="view-menu-dismiss" aria-label={t('view.closeActions')} onClick={closePanel} tabIndex={-1} /><div ref={menu} className="view-action-panel" role="menu" aria-label={t('view.actions')} onKeyDown={(event) => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const buttons = [...menu.current.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
      if (event.key === 'Tab') closePanel();
    }}>{actions.map((action) => { const Icon = icons[action.type]; return <button type="button" role="menuitem" key={action.scope + action.id} onClick={() => run(action)}><Icon size={16} /><span>{action.title}</span>{action.confirm && <TriangleAlert size={14} />}</button>; })}</div></>}
    <footer className="settings-actions view-footer">
      <span role={error ? 'alert' : 'status'}>{error || (state?.message === 'copied' ? t('commandUi.copied') : state?.message === 'selectionCleared' ? t('view.selectionCleared') : state?.message) || (view?.type === 'list' ? t('view.count', { count: items.length }) : state?.extensionName)}</span>
      {isForm ? <><button type="button" className="secondary-button" disabled={!ready || !!confirmation} onClick={() => call(() => api.back())}>{t('settings.cancel')}</button><button ref={saveButton} type="submit" form="extension-form" className="primary-button" disabled={!ready || !!confirmation}>{view.submit.title}</button></>
        : actions[0] && <button type="button" className="primary-button" disabled={!ready || !!confirmation} onClick={() => run(actions[0])}>{actions[0].title}</button>}
      {actions.length > 0 && <button ref={actionButton} type="button" className="secondary-button" aria-haspopup="menu" aria-expanded={panel} disabled={!ready || !!confirmation} onClick={() => setPanel((open) => !open)}><MoreHorizontal size={16} />{t('view.actions')}<kbd>Ctrl .</kbd></button>}
    </footer>
  </div>;
}
