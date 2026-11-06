import React, { useEffect, useRef, useState } from 'react';
import SettingsDeveloperSkill from './SettingsDeveloperSkill';

export default function SettingsExtensions({ api, t, extensions, selected, busy, onBusyChange, onSelect, onOperation, onChanged, Confirmation, children }) {
  const [preview, setPreview] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [clearConfig, setClearConfig] = useState(false);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const token = useRef(null);
  useEffect(() => () => { if (token.current) api.cancelExtensionPreview(token.current).catch(() => {}); }, [api]);
  async function run(action, success) {
    setWorking(true); onBusyChange(true); setFeedback(null);
    try {
      await action();
      await onChanged();
      if (success) setFeedback({ message: success });
    } catch (error) { setFeedback({ error: true, message: t('extensions.failed') + ' ' + error.message }); }
    finally { setWorking(false); onBusyChange(false); }
  }
  const disabled = busy || working;
  async function cancelPreview() {
    await run(async () => { await api.cancelExtensionPreview(preview.token); token.current = null; setPreview(null); });
  }
  return <>
    <header className="settings-configuration-header extensions-heading">
      <h1 id="extensions-title">{selected ? selected.name : t('extensions.title')}</h1>
      <button type="button" className="secondary-button" disabled={disabled || !api.previewExtension} onClick={() => onOperation(() => run(async () => {
        const candidate = await api.previewExtension();
        if (candidate) { token.current = candidate.token; setPreview(candidate); }
      }))}>{t('extensions.install')}</button>
    </header>
    {selected ? <>
      <button type="button" className="secondary-button" disabled={disabled} onClick={() => onSelect(null)}>{t('extensions.back')}</button>
      <p className="inspector-description settings-introduction">{selected.description}</p>
      <dl className="inspector-metadata">
        <div><dt>{t('settings.version')}</dt><dd>{selected.version}</dd></div>
        <div><dt>{t('extensions.source')}</dt><dd>{selected.source || t('extensions.unknownSource')}</dd></div>
        <div><dt>{t('settings.status')}</dt><dd>{t('extensions.status.' + selected.status)}</dd></div>
      </dl>
      {selected.error && <p role="alert" className="settings-feedback error">{selected.error}</p>}
      {selected.runtimeStatus && selected.runtimeStatus !== 'ready' && <p className="settings-empty-copy" role="status">
        {t('extensions.runtime.' + selected.runtimeStatus)}{selected.runtimeError ? ' (' + selected.runtimeError + ')' : ''}</p>}
      {selected.missing.length > 0 && <p className="settings-empty-copy">{t('extensions.missing', { fields: selected.missing.join(', ') })}</p>}
      <div className="inspector-actions">
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => onOperation(() => run(
          () => api.setExtensionEnabled(selected.id, !selected.enabled), t('extensions.changed')))}>
          {t(selected.enabled ? 'settings.disable' : 'settings.enable')}</button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => onOperation(() => { setClearConfig(false); setConfirmRemove(true); })}>{t('extensions.uninstall')}</button>
      </div>
      <section className="settings-section"><h2>{t('settings.configuration')}</h2>{children}</section>
      <section className="settings-section"><h2>{t('extensions.commands')}</h2>
        <ul className="extension-commands">{selected.commands.map((command) => <li key={command.id}><strong>{command.name}</strong>
          {command.description && <p className="settings-empty-copy">{command.description}</p>}</li>)}</ul>
      </section>
    </> : extensions.length ? <div className="extension-list">
      {extensions.map((extension) => <button className="extension-row" type="button" key={extension.id} disabled={disabled} onClick={() => onSelect(extension.id)}>
        <span className="extension-row-title"><strong>{extension.name}</strong><span>{extension.version}</span></span>
        {extension.description && <span className="extension-row-description">{extension.description}</span>}
        <span className="extension-row-description">{t('extensions.count', { count: extension.commands.length })} · {t('extensions.status.' + extension.status)}</span>
      </button>)}
    </div> : <p className="settings-empty-copy">{t('extensions.empty')}</p>}
    {(working || feedback) && <p className={feedback?.error ? 'settings-feedback error' : 'settings-feedback'} role={feedback?.error ? 'alert' : 'status'}>
      {working ? t('extensions.working') : feedback.message}</p>}
    {!selected && <SettingsDeveloperSkill api={api} t={t} />}
    {preview && <Confirmation title={t('extensions.operation.' + preview.operation)}
      description={t('extensions.risk')} onCancel={() => { if (!working) cancelPreview(); }} busy={working} t={t}
      content={<div className="extension-confirmation-content">
        <p><strong>{preview.manifest.name}</strong> · {preview.previousVersion ? preview.previousVersion + ' → ' : ''}{preview.manifest.version}</p>
        <p>{t('extensions.source')}: {preview.manifest.source || t('extensions.unknownSource')}</p>
        <ul>{preview.manifest.commands.map((command) => <li key={command.id}>{command.name}</li>)}</ul>
      </div>}>
      <button type="button" className="primary-button" disabled={working} onClick={() => run(async () => {
        await api.installExtension(preview.token, preview.operation); token.current = null; setPreview(null);
      }, t('extensions.installed'))}>{t('extensions.operation.' + preview.operation)}</button>
      {feedback?.error && <p className="settings-feedback error" role="alert">{feedback.message}</p>}
    </Confirmation>}
    {confirmRemove && selected && <Confirmation title={t('extensions.uninstall')} description={t('extensions.removeDescription')}
      onCancel={() => { if (!working) setConfirmRemove(false); }} busy={working} t={t}
      content={<label className="extension-clear-config"><input type="checkbox" checked={clearConfig} disabled={working}
        onChange={(event) => setClearConfig(event.target.checked)} />{t('extensions.clearConfig')}</label>}>
      <button type="button" className="primary-button" disabled={working} onClick={() => run(async () => {
        await api.uninstallExtension(selected.id, clearConfig); setConfirmRemove(false);
      }, t('extensions.removed'))}>{t('extensions.uninstall')}</button>
      {feedback?.error && <p className="settings-feedback error" role="alert">{feedback.message}</p>}
    </Confirmation>}
  </>;
}
