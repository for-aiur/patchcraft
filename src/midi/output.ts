// EVR-114. Immediate CC sends only; no scheduled message queue.
export type MidiPort = { id: string; name?: string | null; state: string; send: (bytes: number[]) => void; clear?: () => void };
export type MidiSettings = { channel: number; cc: number; hz: number; min: number; max: number };
export class MidiOutput {
  port?: MidiPort;
  armed = false;
  sent = 0;
  suppressed = 0;
  lastValue?: number;
  lastSentAt = -Infinity;
  reason = 'Disarmed';
  intervals: number[] = [];
  delays: number[] = [];
  private config?: MidiSettings;
  select(port?: MidiPort) { this.disarm('Output changed; arm explicitly.'); this.port = port; }
  arm(config: MidiSettings, now: number, frameAt: number) {
    if (!this.port || this.port.state !== 'connected') throw new Error('Choose a connected MIDI output.');
    if (!Number.isFinite(now) || !Number.isFinite(frameAt) || now - frameAt < 0 || now - frameAt > 500) throw new Error('A fresh camera frame is required.');
    if (!Number.isInteger(config.channel) || config.channel < 1 || config.channel > 16 || !Number.isInteger(config.cc) || config.cc < 0 || config.cc > 119 || !Number.isFinite(config.hz) || config.hz < 1 || config.hz > 60 || !Number.isInteger(config.min) || !Number.isInteger(config.max) || config.min < 0 || config.max > 127 || config.min > config.max) throw new Error('Invalid MIDI settings.');
    this.config = { ...config }; this.lastValue = undefined; this.lastSentAt = -Infinity;
    this.armed = true; this.reason = 'Armed';
  }
  disarm(reason = 'Disarmed') {
    this.armed = false; this.reason = reason;
    // Other applications may share the port. Never emit reset/all-notes-off messages.
    try { this.port?.clear?.(); } catch { /* A disconnected port may reject clear. */ }
  }
  send(value: number, now: number, frameAt: number) {
    if (!this.armed) return;
    if (!this.port || this.port.state !== 'connected' || !Number.isFinite(value) || !Number.isFinite(now) || !Number.isFinite(frameAt) || now - frameAt > 500 || now < frameAt) {
      this.disarm('Camera stale or MIDI unavailable; rearm after recovery.'); return;
    }
    const c = this.config!;
    const cc = Math.round(c.min + Math.max(0, Math.min(1, value)) * (c.max - c.min));
    if (cc === this.lastValue || now - this.lastSentAt < 1000 / c.hz) { this.suppressed++; return; }
    try { this.port.send([0xb0 + c.channel - 1, c.cc, cc]); }
    catch { this.disarm('MIDI send failed; select output and rearm.'); return; }
    if (Number.isFinite(this.lastSentAt)) this.intervals.push(now - this.lastSentAt);
    this.delays.push(now - frameAt);
    if (this.intervals.length > 1800) this.intervals.shift();
    if (this.delays.length > 1800) this.delays.shift();
    this.lastSentAt = now; this.lastValue = cc; this.sent++;
  }
}
