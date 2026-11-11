import './build-info.css';

declare const __PATCHCRAFT_BUILD__: { version: string; commit: string; release: string | null };
const info = __PATCHCRAFT_BUILD__;
export function mountBuildInfo() {
  const footer = document.querySelector('footer');
  if (!footer) return;
  const badge = document.createElement('span'); badge.className = 'build-info';
  const version = document.createElement('a');
  version.textContent = info.release ?? `v${info.version} · dev`;
  version.href = info.release ? `https://github.com/for-aiur/patchcraft/releases/tag/${encodeURIComponent(info.release)}` : 'https://github.com/for-aiur/patchcraft/releases';
  version.target = '_blank'; version.rel = 'noopener noreferrer';
  version.title = info.release ? 'View this release' : 'Development build · view releases'; badge.append(version);
  if (info.commit) {
    const commit = document.createElement('a'); commit.textContent = info.commit.slice(0,7);
    commit.href = `https://github.com/for-aiur/patchcraft/commit/${info.commit}`; commit.title = info.commit; commit.target='_blank'; commit.rel='noopener noreferrer';
    badge.append(document.createTextNode(' · '),commit);
  }
  footer.append(badge);
}
