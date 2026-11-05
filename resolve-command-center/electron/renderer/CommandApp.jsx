import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, LoaderCircle, TriangleAlert, X } from 'lucide-react';
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
  const phase = state?.phase;
  const running = phase === 'running';
  const command = state?.command;
  const result = state?.result;
  const failed = phase === 'error';
  const notification = phase === 'notification';
  useEffect(() => {
    if (!api) return;
    let active = true;
    const update = (next) => { if (active && next) setState(next); };
    const unsubscribe = api.onChanged(update);
    api.get().then(update).catch(() => { if (active) setError(t('commandUi.unavailable')); });
    return () => { active = false; unsubscribe(); };
  }, [api, t]);
  useEffect(() => {
    if (command && !initialized.current) {
      initialized.current = true;
      setValues(Object.fromEntries(Object.entries(command.ui?.inputs || {}).filter(([, field]) => field.default !== undefined || ['boolean', 'color'].includes(field.type))
        .map(([key, field]) => [key, field.default ?? (field.type === 'color' ? '#101216' : false)])));
    }
  }, [command]);
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
  if (notification) return <div className="command-notification" role="status"><Check size={18} /><p>{result.message === 'Command completed.' ? t('commandUi.completed') : result.message}</p></div>;
  return <form className="settings-shell command-shell" aria-label={command?.name || t('commandUi.title')}
    ref={shell} tabIndex={-1} onSubmit={submit} onKeyDown={(event) => {
      if (event.key === 'Escape' && !running) { event.preventDefault(); api.close(); }
    }}>
    <header className="settings-titlebar">
      <div className="settings-titlebar-drag"><span className="settings-titlebar-label">{t('commandUi.title')}</span></div>
      <button className="settings-titlebar-close" type="button" disabled={running} aria-label={t('commandUi.close')} onClick={() => api.close()}><X size={18} /></button>
    </header>
    <main className="command-content" tabIndex={-1} aria-busy={running}>
      <h1>{command?.name || t('commandUi.title')}</h1>
      {command?.description && <p className="command-description">{command.description}</p>}
      {phase === 'input' && <>
        {Object.keys(command.ui.inputs).length > 0 && <SettingsRenderer schema={command.ui.inputs} values={values} runtime t={t}
          onChange={(key, value) => setValues((current) => { const next = { ...current }; if (value === undefined) delete next[key]; else next[key] = value; return next; })}
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
      {phase === 'input' ? <>
        <button type="button" className="secondary-button" onClick={() => api.close()}>{t('settings.cancel')}</button>
        <button type="submit" className="primary-button">{t('commandUi.run')}</button>
      </> : !running && <>
        <button type="button" className="secondary-button" onClick={copy}><Copy size={14} />{t('commandUi.copy')}</button>
        <button type="button" className="primary-button" onClick={() => api.close()}>{t('commandUi.close')}</button>
      </>}
    </footer>
  </form>;
}
