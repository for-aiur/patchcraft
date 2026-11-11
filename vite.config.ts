import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = process.env.PATCHCRAFT_BUILD_SHA ?? '';
if (!commit) {
  try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { stdio: ['ignore','pipe','ignore'] }).toString().trim(); }
  catch { commit = ''; }
}
if (commit && !/^[a-f0-9]{40}$/.test(commit)) throw new Error('PATCHCRAFT_BUILD_SHA must be a full commit SHA.');
const release = process.env.PATCHCRAFT_RELEASE_TAG || null;
if (release && release !== `v${version}`) throw new Error('Release tag must match v + package.json version.');
const buildInfo = { version, commit, release };
export default defineConfig({
  define: { __PATCHCRAFT_BUILD__: JSON.stringify(buildInfo) },
  plugins: [{ name: 'patchcraft-build-info', generateBundle() { this.emitFile({ type:'asset', fileName:'build-info.json', source:JSON.stringify(buildInfo) }); } }],
  server: { proxy: { '/api': process.env.AUTHORING_PROXY || 'http://127.0.0.1:3001' } },
  preview: { proxy: { '/api': process.env.AUTHORING_PROXY || 'http://127.0.0.1:3001' } },
  build: { rollupOptions: { input: { audio:'index.html', vision:'vision.html', visualLab:'visual-lab.html' } } },
});
