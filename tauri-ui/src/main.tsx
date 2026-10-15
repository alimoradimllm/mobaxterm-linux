import React from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './react-ui.css';
import App from './App';

const root = document.getElementById('app');
if (!root) throw new Error('Moraxterm root element is missing');
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
