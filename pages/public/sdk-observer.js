// Metadata-only, side-effect-free media observer. Never intercepts/changes audio.
(function (scope) {
  class SdkObserver {
    constructor({ emit, sessionId, wall = () => Date.now(), mono = () => performance.now() }) {
      this.emit = emit; this.sessionId = sessionId; this.wall = wall; this.mono = mono;
      this.seq = 0; this.callSid = null; this.queue = []; this.prevSample = null;
    }
    record(event, fields = {}) {
      const row = { event, browserSessionId: this.sessionId, eventSeq: ++this.seq,
        browserTs: this.wall(), browserMonoMs: this.mono(), clockDomain: 'browser', ...fields };
      if (this.callSid) this.emit({ ...row, callSid: this.callSid });
      else this.queue.push(row);
    }
    bind(callSid) {
      if (!callSid) return;
      this.callSid = callSid;
      for (const row of this.queue) this.emit({ ...row, callSid });
      this.queue = [];
    }
    options(nativeGetUserMedia, NativePeerConnection) {
      const obs = this;
      return {
        getUserMedia(...args) {
          obs.record('media_requested');
          // Preserve rejection, original constraints, and exact stream identity.
          return nativeGetUserMedia(...args).then(stream => {
            obs.record('media_resolved', { audioTrackCount: stream.getAudioTracks().length });
            return stream;
          }, error => { obs.record('media_failed'); throw error; });
        },
        RTCPeerConnection: class extends NativePeerConnection {
          constructor(...a) { super(...a); obs.pc = this; } // read-only handle for getStats; never changes media
          addTrack(...args) {
            const audio = args[0] && args[0].kind === 'audio';
            if (audio) obs.record('track_attach_start');
            try {
              const sender = super.addTrack(...args);
              if (audio) obs.record('track_attached');
              return sender;
            } catch (error) { if (audio) obs.record('track_attach_failed'); throw error; }
          }
        }
      };
    }
    // Read-only WebRTC stats split by direction (metadata only). Fields a browser does not provide stay null.
    async stats() {
      const pc = this.pc;
      if (!pc || pc.connectionState === 'closed' || typeof pc.getStats !== 'function') return null;
      let rep; try { rep = await pc.getStats(); } catch (e) { return null; }
      const n = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0) ? v : null;
      const ms = v => n(v) == null ? null : v * 1000;
      const o = { pairRttMs: null, up: null, down: null, sent: null };
      const audio = s => (s.kind || s.mediaType) === 'audio';
      rep.forEach(s => {
        if (s.type === 'candidate-pair' && (s.selected || (s.nominated && s.state === 'succeeded')) && n(s.currentRoundTripTime) != null) {
          o.pairRttMs = s.currentRoundTripTime * 1000;
        } else if (s.type === 'remote-inbound-rtp' && audio(s)) {
          o.up = { jitterMs: ms(s.jitter), lossFraction: n(s.fractionLost), rttMs: ms(s.roundTripTime), packetsLost: n(s.packetsLost) };
        } else if (s.type === 'inbound-rtp' && audio(s)) {
          const jbc = n(s.jitterBufferEmittedCount), jbd = n(s.jitterBufferDelay);
          o.down = { jitterMs: ms(s.jitter), packetsLost: n(s.packetsLost), packetsReceived: n(s.packetsReceived),
            jitterBufferMs: jbc && jbd != null ? (jbd / jbc) * 1000 : null,
            concealedSamples: n(s.concealedSamples), totalSamples: n(s.totalSamplesReceived) };
        } else if (s.type === 'outbound-rtp' && audio(s)) {
          o.sent = { packets: n(s.packetsSent), bytes: n(s.bytesSent) };
        }
      });
      return o;
    }
    sample(sm) {
      const finite = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
      const ts = finite(sm.timestamp), previous = this.prevSample;
      const windowMs = ts != null && previous != null && ts > previous ? ts - previous : undefined;
      this.record('outbound_sample', { sdkStatsTs: ts, sampleWindowMs: windowMs,
        packetsSent: finite(sm.packetsSent), bytesSent: finite(sm.bytesSent),
        totalPacketsSent: finite(sm.totals && sm.totals.packetsSent),
        totalBytesSent: finite(sm.totals && sm.totals.bytesSent) });
      this.prevSample = ts == null ? null : ts;
    }
  }
  scope.SdkObserver = SdkObserver;
})(globalThis);
