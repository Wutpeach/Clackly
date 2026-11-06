import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, LoaderCircle, RefreshCw, TriangleAlert, X } from 'lucide-react';
import SettingsRenderer from './SettingsRenderer.jsx';
import { useLocalization } from './LocalizationContext.jsx';

export default function CommandApp() {
  const api = window.resolveCommandUi;
  const { t } = useLocalization();
  const [state, setState] = useState(null);
  const [values, setValues] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [copyState, setCopyState] = useState('');
  const shell = useRef(null);
  const initialized = useRef(false);
  const submitting = useRef(false);
  const edited = useRef(new Set());
  const inputVersion = useRef(null);
  const phase = state?.phase;
  const running = phase === 'running';
  const preparing = phase === 'preparing';
  const prepareFailed = phase === 'prepare-error';
  const command = state?.command;
  const result = state?.result;
  const failed = phase === 'error';
  const notification = phase === 'notification';
  useEffect(() => {
    if (!api) return;
    let active = true;
    const update = (next) => { if (active && next) setState((old) => old?.serial > next.serial ? old : next); };
    const unsubscribe = api.onChanged(update);
    api.get().then(update).catch(() => { if (active) setError(t('commandUi.unavailable')); });
    return () => { active = false; unsubscribe(); };
  }, [api, t]);
  useEffect(() => {
    if (state?.inputVersion && state.inputVersion !== inputVersion.current) {
      inputVersion.current = state.inputVersion; initialized.current = true;
      setValues(state.values || {}); setConfirmed(false); setError('');
      return;
    }
    if (command?.ui?.prepare) return;
    if (command && !initialized.current) {
      initialized.current = true;
      setValues(Object.fromEntries(Object.entries(command.ui?.inputs || {}).filter(([, field]) => field.default !== undefined || ['boolean', 'color'].includes(field.type))
        .map(([key, field]) => [key, field.default ?? (field.type === 'color' ? '#101216' : false)])));
    }
  }, [command, state?.inputVersion, state?.values]);
  useEffect(() => {
    if (!notification) {
      const frame = requestAnimationFrame(() => {
        const target = phase === 'input'
          ? shell.current?.querySelector('main input, main textarea, main select, main button')
          : shell.current?.querySelector('main');
        (target || shell.current)?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [phase, notification]);
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || phase !== 'input') return;
    submitting.current = true; setError('');
    try { await api.submit(values, confirmed); }
    catch (failure) { setError(failure.message); }
    finally { submitting.current = false; }
  }
  async function copy() {
    try { await api.copy(); setCopyState(t('commandUi.copied')); }
    catch { setCopyState(t('commandUi.copyFailed')); }
  }
  async function refresh() {
    setError(''); setConfirmed(false);
    try { await api.refresh(values, [...edited.current]); }
    catch (failure) { setError(failure.message); }
  }
  function change(key, value) {
    edited.current.add(key);
    setValues((current) => { const next = { ...current }; if (value === undefined) delete next[key]; else next[key] = value; return next; });
  }
  if (notification) return <div className="command-notification" role="status"><Check size={18} /><p>{result.message === 'Command completed.' ? t('commandUi.completed') : result.message}</p></div>;
  return <form className="settings-shell command-shell" aria-label={command?.name || t('commandUi.title')}
    ref={shell} tabIndex={-1} onSubmit={submit} onKeyDown={(event) => {
      if (event.key === 'Escape' && !running) { event.preventDefault(); api.close(); }
    }}>
    <header className="settings-titlebar">
      <div className="settings-titlebar-drag"><span className="settings-titlebar-label">{t('commandUi.title')}</span></div>
      <button className="settings-titlebar-close" type="button" disabled={running} aria-label={t('commandUi.close')} onClick={() => api.close()}><X size={18} /></button>
    </header>
    <main className="command-content" tabIndex={-1} aria-busy={running || preparing}>
      <h1>{command?.name || t('commandUi.title')}</h1>
      {command?.description && <p className="command-description">{command.description}</p>}
      {command?.ui?.prepare && !running && !['result', 'error'].includes(phase) && <section className="command-prepare" aria-live="polite" aria-atomic="true">
        <h2>{preparing ? <LoaderCircle size={16} /> : prepareFailed ? <TriangleAlert size={16} /> : <Check size={16} />}{t('commandUi.prepare.' + (state.prepareState || 'loading'))}</h2>
        <p>{preparing ? t('commandUi.prepare.wait') : prepareFailed ? t('commandUi.prepare.retryHint')
          : state.prepareMessage || (state.prepareState === 'empty' ? t('commandUi.prepare.emptyHint') : t('commandUi.prepare.readyHint'))}</p>
        {prepareFailed && state.error?.reason && <p>{state.error.reason}</p>}
        {state.cleared?.length > 0 && !preparing && <p role="alert">{t('commandUi.prepare.cleared')} {state.cleared.join(', ')}</p>}
        {prepareFailed && state.error?.diagnostic && <details><summary>{t('commandUi.diagnostic')}</summary><pre>{state.error.diagnostic}</pre></details>}
      </section>}
      {phase === 'input' && <>
        {Object.keys(command.ui.inputs).length > 0 && <SettingsRenderer schema={command.ui.inputs} values={values} runtime t={t}
          onChange={change}
          onPick={async (_type, key) => { try { return await api.pick(key); } catch (failure) { setError(failure.message); return null; } }} />}
        {command.ui.confirm && <div className="command-confirm">
          <p><TriangleAlert size={16} />{command.ui.confirm.message}</p>
          <label><input type="checkbox" checked={confirmed} required onChange={(event) => setConfirmed(event.target.checked)} />{t('commandUi.confirm')}</label>
        </div>}
        <p className="command-field-description">{t('commandUi.once')}</p>
      </>}
      {running && <div className="command-running" role="status"><LoaderCircle size={20} /><h2>{t('commandUi.running')}</h2><p>{t('commandUi.runningHint')}</p></div>}
      {(phase === 'result' || failed) && <section className="command-result">
        <h2 className={failed ? 'command-failure' : ''}>{failed && <TriangleAlert size={16} />}{result?.message || t(state?.error?.timeout ? 'commandUi.timeout' : 'commandUi.' + (state?.error?.kind || 'failed'))}</h2>
        {state?.error?.reason && <p>{state.error.reason}</p>}
        {result?.text && <pre>{result.text}</pre>}
        {result?.fields?.length > 0 && <dl>{result.fields.map((field, index) => <React.Fragment key={index}><dt>{field.label}</dt><dd>{field.value}</dd></React.Fragment>)}</dl>}
        {result?.items?.length > 0 && <ul>{result.items.map((item, index) => <li key={index}>{item}</li>)}</ul>}
        {(result?.diagnostic || state?.error?.diagnostic) && <details><summary>{t('commandUi.diagnostic')}</summary><pre>{result?.diagnostic || state.error.diagnostic}</pre></details>}
      </section>}
      {error && <p className="command-failure" role="alert">{error}</p>}
    </main>
    <footer className="settings-actions command-actions">
      <span role="status">{copyState || command?.extensionName}</span>
      {['input', 'preparing', 'prepare-error'].includes(phase) ? <>
        <button type="button" className="secondary-button" onClick={() => api.close()}>{t('settings.cancel')}</button>
        {command?.ui?.prepare && <button type="button" className="secondary-button" disabled={preparing} onClick={refresh}><RefreshCw size={14} />{t(prepareFailed ? 'commandUi.prepare.retry' : 'commandUi.prepare.refresh')}</button>}
        {phase === 'input' && <button type="submit" className="primary-button" disabled={state.prepareBlocked}>{t('commandUi.run')}</button>}
      </> : !running && <>
        <button type="button" className="secondary-button" onClick={copy}><Copy size={14} />{t('commandUi.copy')}</button>
        <button type="button" className="primary-button" onClick={() => api.close()}>{t('commandUi.close')}</button>
      </>}
    </footer>
  </form>;
}
