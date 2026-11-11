import { mountBuildInfo } from './build-info';
import './site.css';

const page = document.body.dataset.infoPage === 'support' ? 'support' : 'about';
const isSupport = page === 'support';
const title = isSupport ? 'Support' : 'About Patchcraft';
const heading = isSupport ? 'Support is on the way.' : 'A little more about Patchcraft.';
const copy = isSupport
  ? 'Ways to support the project and help it grow are being put together.'
  : 'The project story, people behind it, and what comes next are being put together.';

document.title = `${title} | Patchcraft`;
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="site-header">
    <a class="site-brand" href="/" aria-label="Patchcraft home"><img src="/patchcraft-mark.svg" alt=""><span>patchcraft</span></a>
    <nav class="site-nav" aria-label="Main navigation">
      <a class="nav-lab" href="/visual-lab">Visual Signal Lab <span aria-hidden="true">↗</span></a>
      <a href="/about.html" ${isSupport ? '' : 'aria-current="page"'}>About</a>
      <a href="/support.html" ${isSupport ? 'aria-current="page"' : ''}>Support</a>
    </nav>
  </header>
  <main class="info-main">
    <a class="back-link" href="/">← Back to Patchcraft</a>
    <section class="info-card">
      <img src="/patchcraft-mark.svg" alt="" width="48" height="48">
      <p class="home-kicker">${isSupport ? 'SUPPORT' : 'THE PROJECT'}</p>
      <h1>${heading}</h1>
      <p>${copy}</p>
      <span class="wip-label"><i></i> WORK IN PROGRESS</span>
      ${isSupport ? '<a class="issue-link" href="https://github.com/for-aiur/patchcraft/issues">For now, report a problem on GitHub <span aria-hidden="true">↗</span></a>' : '<a class="issue-link" href="https://github.com/for-aiur/patchcraft">Browse the open-source project <span aria-hidden="true">↗</span></a>'}
    </section>
  </main>
  <footer class="site-footer"><a class="footer-brand" href="/">PATCHCRAFT</a><span>Open source by YNY Labs</span><div class="footer-links"><a href="/about.html">About</a><a href="/support.html">Support</a><a href="https://github.com/for-aiur/patchcraft">GitHub</a></div></footer>`;

mountBuildInfo();
