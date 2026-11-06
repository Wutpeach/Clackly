import React, { useEffect, useState } from 'react';

export default function SettingsDeveloperSkill({ api, t }) {
  const [state, setState] = useState(null);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState(null);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => api.getDeveloperSkill?.()).then(
      (value) => { if (active) setState(value || { available: false }); },
      () => { if (active) setState({ available: false }); }
    );
    return () => { active = false; };
  }, [api]);
  async function run(action, success, failure) {
    setWorking(true); setFeedback(null);
    try { await action(); setFeedback({ key: success }); }
    catch {
      setFeedback({ key: failure, error: true });
      try { setState(await api.getDeveloperSkill()); } catch { setState({ available: false }); }
    } finally { setWorking(false); }
  }
  return <section className="settings-section developer-skill-section" aria-labelledby="developer-skill-title" aria-busy={working}>
    <h2 id="developer-skill-title">Clackly Developer Skill</h2>
    <p className="inspector-description">{t('developerSkill.description')}</p>
    <div className="inspector-actions">
      <button type="button" className="primary-button" disabled={!state?.available || working}
        onClick={() => run(() => api.copyDeveloperSkillPrompt(), 'developerSkill.copied', 'developerSkill.copyFailed')}>{t('developerSkill.copy')}</button>
      <button type="button" className="secondary-button" disabled={!state?.available || working}
        onClick={() => run(() => api.openDeveloperSkillFolder(), 'developerSkill.opened', 'developerSkill.openFailed')}>{t('developerSkill.open')}</button>
    </div>
    <p className="settings-empty-copy">{t('developerSkill.updateHint')}</p>
    {!state || !state.available ? <p className="settings-feedback" role="status">
      {t(state ? 'developerSkill.unavailable' : 'developerSkill.loading')}</p> : null}
    {feedback && <p className={feedback.error ? 'settings-feedback error' : 'settings-feedback'} role={feedback.error ? 'alert' : 'status'}>{t(feedback.key)}</p>}
  </section>;
}
