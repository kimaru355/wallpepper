import { useEffect, useState } from 'react';
import { FIT_MODES, getDeviceSettings, updateDeviceSettings, type FitMode, type IconName } from '@wallpepper/core';
import { AuthForm } from '../AuthForm';
import { Icon } from '../components';
import { getCtx } from '../ctx';
import { useAppState } from '../hooks';
import { toast } from '../toast';

const SLIDES: { icon: IconName; title: string; body: string; points: string[] }[] = [
  {
    icon: 'wallpaper',
    title: 'Wallpapers you will actually love',
    body: 'Wallpepper brings wallpapers from many trusted sources into one app, so you do not have to hunt through websites.',
    points: ['Anime, movies & series, games, Linux, nature, space and more', 'No keys or setup: just browse and click', 'Set your desktop, lock screen or both'],
  },
  {
    icon: 'layers',
    title: 'Groups and sub-groups',
    body: 'Keep your favourites tidy: Anime › Naruto, Movies › Marvel. Use a whole group, or just one sub-group, as your wallpaper.',
    points: ['Pick “Anime” to see every anime wallpaper', 'Pick “Naruto” to see only Naruto', 'Let the wallpaper change by itself on a schedule'],
  },
  {
    icon: 'users',
    title: 'Synced and shared',
    body: 'Your account keeps your library on every device and lets you discover what the community built.',
    points: ['Your PC and phone always show your latest groups', 'Share your groups and browse other people’s', 'Saved images keep working when you are offline'],
  },
];

type Step = 'info' | 'auth' | 'engine' | 'fit';
const STEPS: Step[] = ['info', 'auth', 'engine', 'fit'];

export function Onboarding() {
  const state = useAppState();
  const [step, setStep] = useState<Step>(state.local.auth ? 'engine' : 'info');
  const idx = STEPS.indexOf(step);
  return (
    <div className="onboard">
      {step !== 'info' && (
        <div className="progress">{STEPS.slice(1).map((s, i) => <div key={s} className={i < idx ? 'on' : ''} />)}</div>
      )}
      {step === 'info' && <InfoSlides onDone={() => setStep(state.local.auth ? 'engine' : 'auth')} />}
      {step === 'auth' && (
        <div className="ob-page">
          <h1>Create your account</h1>
          <p className="muted">An account is needed for the best experience: it syncs your wallpapers and groups between your devices and gives you a username for the community.</p>
          <div className="source"><AuthForm onDone={() => setStep('engine')} /></div>
          <div className="row"><button onClick={() => setStep('info')}>Back</button></div>
        </div>
      )}
      {step === 'engine' && <EngineStep onBack={() => setStep(state.local.auth ? 'info' : 'auth')} onNext={() => setStep('fit')} />}
      {step === 'fit' && <FitStep onBack={() => setStep('engine')} />}
    </div>
  );
}

function InfoSlides({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((n) => Math.min(SLIDES.length - 1, n + 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="ob-page center">
      <div className="brand big">Wallpepper</div>
      <div className="slides-clip">
        <div className="slides" style={{ transform: `translateX(${-i * 100}%)` }}>
          {SLIDES.map((s) => (
            <div className="slide" key={s.title}>
              <div className="hero"><Icon name={s.icon} size={52} /></div>
              <h1>{s.title}</h1>
              <p className="muted lead">{s.body}</p>
              <ul>{s.points.map((p) => <li key={p}><Icon name="check" size={16} />{p}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>
      <div className="dots">{SLIDES.map((s, n) => <button key={s.title} aria-label={`Slide ${n + 1}`} className={n === i ? 'on' : ''} onClick={() => setI(n)} />)}</div>
      <div className="row">
        {i > 0 && <button onClick={() => setI(i - 1)}>Back</button>}
        {last ? <button className="primary" onClick={onDone}>Get Started</button> : <button className="primary" onClick={() => setI(i + 1)}>Next</button>}
      </div>
    </div>
  );
}

const INTERVALS = [15, 60, 180, 360, 720, 1440];

function EngineStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { store, info } = getCtx();
  const s = getDeviceSettings(useAppState());
  const [mode, setMode] = useState<'apply' | 'folder'>(s?.mode ?? 'apply');
  const [minutes, setMinutes] = useState(s && INTERVALS.includes(s.rotationMinutes) ? s.rotationMinutes : 360);
  const [autostart, setAutostart] = useState(true);

  const save = async () => {
    updateDeviceSettings(store, store.state.local.deviceId, { mode, rotationEnabled: mode === 'apply', rotationMinutes: minutes });
    // The app can only change wallpapers while it is running, so it should start with the computer (minimised to the tray).
    if (mode === 'apply') {
      await window.api.setAutostart(autostart);
      await window.api.setCloseToTray(true);
    }
    onNext();
  };
  const option = (value: 'apply' | 'folder', title: string, badge: string | null, lines: string[]) => (
    <button type="button" className={'option' + (mode === value ? ' on' : '')} onClick={() => setMode(value)}>
      <div className="row"><span className="radio" /><strong className="grow">{title}</strong>{badge && <span className="badge">{badge}</span>}</div>
      <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </button>
  );
  return (
    <div className="ob-page">
      <h1>Who changes your wallpaper?</h1>
      <p className="muted">You can change this any time in Settings.</p>
      {option('apply', 'Wallpepper', 'Recommended', [
        'Changes your wallpaper on the schedule you choose',
        'Uses your fit setting and your groups and sub-groups',
        'Light on resources: it only does work when a change is due and keeps images cached',
      ])}
      {option('folder', `My ${info.platform === 'mac' ? 'Mac' : info.platform === 'windows' ? 'Windows' : 'desktop'}`, null, [
        `Wallpepper only saves images into ${info.defaultFolder}, in folders per group (Anime/Naruto)`,
        info.platform === 'windows' ? 'Point Windows Personalization › Background › Slideshow at the folder you want' : 'Point your system wallpaper slideshow at the folder you want',
        'Wallpepper does not need to keep running',
      ])}
      {mode === 'apply' && (
        <div className="source form">
          <label>Change the wallpaper every
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {INTERVALS.map((m) => <option key={m} value={m}>{m >= 1440 ? 'day' : m >= 60 ? `${m / 60} ${m === 60 ? 'hour' : 'hours'}` : `${m} minutes`}</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={autostart} onChange={(e) => setAutostart(e.target.checked)} />
            Start with {info.platform === 'windows' ? 'Windows' : 'my computer'}, minimised to the tray (needed so changes keep happening)
          </label>
        </div>
      )}
      <div className="row"><button onClick={onBack}>Back</button><button className="primary" onClick={() => void save()}>Continue</button></div>
    </div>
  );
}

/** A landscape picture on a screen, drawn the way each fit mode shows it. */
function FitPreview({ fit }: { fit: FitMode }) {
  return (
    <div className={'fitprev ' + fit}>
      <div className="pic"><i /></div>
    </div>
  );
}

function FitStep({ onBack }: { onBack: () => void }) {
  const { store } = getCtx();
  const s = getDeviceSettings(useAppState());
  const [fit, setFit] = useState<FitMode>(s?.fit ?? 'fill');
  const finish = () => {
    updateDeviceSettings(store, store.state.local.deviceId, { fit });
    store.setLocal({ onboarded: true });
    toast('You are all set.', 'ok');
  };
  return (
    <div className="ob-page wide">
      <h1>How should images fit?</h1>
      <p className="muted">Most wallpapers are not exactly your screen’s shape. Pick what happens with the difference.</p>
      <div className="fitgrid">
        {FIT_MODES.map((f) => (
          <button type="button" key={f.id} className={'option fit' + (fit === f.id ? ' on' : '')} onClick={() => setFit(f.id)}>
            <FitPreview fit={f.id} />
            <strong>{f.label}{f.id === 'fill' ? ' (recommended)' : ''}</strong>
            <span className="muted small">{f.hint}</span>
          </button>
        ))}
      </div>
      <div className="row"><button onClick={onBack}>Back</button><button className="primary" onClick={finish}>Finish</button></div>
    </div>
  );
}
