import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bootstrap } from './ctx';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
bootstrap()
  .then(() => root.render(<StrictMode><App /></StrictMode>))
  .catch((e) => {
    root.render(<pre style={{ padding: 24, color: '#f88' }}>Failed to start: {String(e?.stack ?? e)}</pre>);
  });
