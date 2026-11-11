// At most one outstanding heartbeat, including while the main thread is suspended.
let awaitingAck = false;
self.onmessage = () => { awaitingAck = false; };
setInterval(() => {
  if (!awaitingAck) { awaitingAck = true; self.postMessage('tick'); }
}, 33);
export {};
