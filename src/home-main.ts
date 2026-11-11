import { mountBuildInfo } from './build-info';
import './site.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="site-header">
    <a class="site-brand" href="/" aria-label="Patchcraft home"><img src="/patchcraft-mark.svg" alt=""><span>patchcraft</span></a>
    <nav class="site-nav" aria-label="Main navigation">
      <a class="nav-lab" href="/visual-lab">Visual Signal Lab <span aria-hidden="true">↗</span></a>
      <a href="/about.html">About</a>
      <a href="/support.html">Support</a>
    </nav>
  </header>
  <main class="home-main">
    <section class="home-hero">
      <div class="hero-copy">
        <p class="home-kicker"><span class="status-dot"></span> OPEN SOURCE · BROWSER BASED</p>
        <h1>Let the scene<br><em>play your sound.</em></h1>
        <p class="hero-description">Patchcraft turns changes in light, color, and motion into MIDI controls for the music gear you already use.</p>
        <div class="hero-actions">
          <a class="button-primary" href="/visual-lab">Open Visual Signal Lab <span aria-hidden="true">↗</span></a>
          <a class="button-secondary" href="https://github.com/for-aiur/patchcraft">Explore the project</a>
        </div>
        <p class="hero-footnote">Use your camera or a video. Your audio stays in its usual setup.</p>
      </div>
      <div class="signal-art" aria-label="Camera image becomes a MIDI control signal for a synthesizer">
        <div class="art-window"><div class="scene-sun"></div><div class="scene-hill scene-hill-back"></div><div class="scene-hill scene-hill-front"></div><div class="scene-scan"></div><span class="art-caption">LIVE SCENE</span></div>
        <div class="art-route"><span></span><span></span><span></span><span></span></div>
        <div class="art-control"><div class="art-ring"><i></i></div><span class="art-caption">MIDI CONTROL</span><small>CC 74 · CH 1</small></div>
        <div class="art-output"><span class="output-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><strong>YOUR RIG</strong><small>DAW · synth · effects</small></div>
        <p class="art-note">A changing scene becomes a playable control.</p>
      </div>
    </section>

    <section class="how-it-works" aria-labelledby="how-title">
      <div class="section-heading"><p class="home-kicker">A SIMPLE SIGNAL PATH</p><h2 id="how-title">From the room to your rig.</h2></div>
      <div class="steps-grid">
        <article class="step-card"><span class="step-index">01</span><h3>Choose a scene</h3><p>Use a live camera, the built-in motion scene, or a local video loop.</p></article>
        <article class="step-card"><span class="step-index">02</span><h3>Shape the signal</h3><p>Build an image pipeline and combine its measurements into named controls.</p></article>
        <article class="step-card"><span class="step-index">03</span><h3>Play your setup</h3><p>Send MIDI CC to a synth, effect, or DAW parameter. Keep your audio path as it is.</p></article>
      </div>
    </section>

    <section class="home-note">
      <div><p class="home-kicker">MADE TO EXPERIMENT</p><h2>Your setup stays yours.</h2></div>
      <p>Patchcraft runs visual analysis in your browser and sends control data over MIDI. It does not need to process your instrument audio to control your existing gear.</p>
    </section>
  </main>
  <footer class="site-footer"><a class="footer-brand" href="/">PATCHCRAFT</a><span>Open source by YNY Labs</span><div class="footer-links"><a href="/about.html">About</a><a href="/support.html">Support</a><a href="https://github.com/for-aiur/patchcraft">GitHub</a></div></footer>`;

mountBuildInfo();
