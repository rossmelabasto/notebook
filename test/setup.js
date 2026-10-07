// test/setup.js — se carga con --import antes de cada archivo de test: base temporal y IA falsa
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(os.tmpdir(), 'nb-test-'));
process.env.DATA_DIR = dir;
process.env.EMBED_PROVIDER = 'fake';
process.env.CHAT_PROVIDER = 'fake';
process.env.SETUP_TOKEN = 'setup-token';
process.env.DEMO_ENABLED = '1';
process.env.GROQ_API_KEY = '';
process.env.OPENAI_API_KEY = '';
process.env.DEEPSEEK_API_KEY = '';
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
