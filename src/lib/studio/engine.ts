import { presetById, type Preset } from "@/lib/studio/presets";
import { retuneChannels } from "@/lib/studio/pitch";
import { pieceOf, useStudio } from "@/lib/studio/store";
import type { AudioClip, DrumVoice, Piece, Track } from "@/lib/studio/types";
import { midiToFreq, rootPc, snapToScale } from "@/lib/studio/theory";
import { audioBufferToWav } from "@/lib/studio/wav";

type Hang = { stop: (at: number) => void };

type Channel = {
  input: GainNode;
  pan: StereoPannerNode;
  gain: GainNode;
  send: GainNode;
};

type Pcm = { sampleRate: number; channels: Float32Array[] };

type Frame = { beat: number; playing: boolean };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let dryBus: GainNode | null = null;
let reverbBus: ConvolverNode | null = null;
let reverbGain: GainNode | null = null;
let analyser: AnalyserNode | null = null;
const channels = new Map<string, Channel>();
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
const impulses = new WeakMap<BaseAudioContext, AudioBuffer>();
const pcm = new Map<string, Pcm>();
const decoded = new Map<string, AudioBuffer>();
const peaks = new Map<string, number[]>();
const tuneCache = new Map<string, string>();

let playing = false;
let pausedBeat = 0;
let playOriginTime = 0;
let playOriginBeat = 0;
let nextBeat = 0;
let nextTime = 0;
let timer = 0;
let hanging: Hang[] = [];
const suppress = new Set<string>();
const previews = new Map<string, Hang["stop"]>();
const finger = new Map<number, { trackId: string; midi: number }>();
const held = new Map<string, { trackId: string; midi: number; start: number }>();

let micStream: MediaStream | null = null;
let micProc: ScriptProcessorNode | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;
let micMute: GainNode | null = null;
let capturing = false;
let captureChunks: Float32Array[] = [];
let captureStart = 0;
let levelCb: ((rms: number) => void) | null = null;

let frame: Frame = { beat: 0, playing: false };
const frameSubs = new Set<() => void>();
let busy: string | null = null;
const busySubs = new Set<() => void>();
let pressed: number[] = [];
const pressedSet = new Set<number>();
const pressedSubs = new Set<() => void>();
let attached = false;

export function subscribeFrame(fn: () => void) {
  frameSubs.add(fn);
  return () => frameSubs.delete(fn);
}
export function getFrame() {
  return frame;
}
export function subscribeBusy(fn: () => void) {
  busySubs.add(fn);
  return () => busySubs.delete(fn);
}
export function getBusy() {
  return busy;
}
export function subscribePressed(fn: () => void) {
  pressedSubs.add(fn);
  return () => pressedSubs.delete(fn);
}
export function getPressed() {
  return pressed;
}

function setBusy(label: string | null) {
  busy = label;
  busySubs.forEach((fn) => fn());
}

function publish(beat: number, isOn: boolean) {
  const step = Math.floor(beat * 4 + 1e-4);
  const prev = Math.floor(frame.beat * 4 + 1e-4);
  if (step === prev && isOn === frame.playing) return;
  frame = { beat, playing: isOn };
  frameSubs.forEach((fn) => fn());
}

function markPressed(midi: number, down: boolean) {
  if (down) pressedSet.add(midi);
  else pressedSet.delete(midi);
  pressed = [...pressedSet];
  pressedSubs.forEach((fn) => fn());
}

export function isPlaying() {
  return playing;
}
export function isCapturing() {
  return capturing;
}
export function onInputLevel(cb: ((rms: number) => void) | null) {
  levelCb = cb;
}

function pieceNow(): Piece {
  return pieceOf(useStudio.getState());
}

export function songBeats(piece: Pick<Piece, "bars" | "beatsPerBar"> = pieceNow()) {
  return piece.bars * piece.beatsPerBar;
}

export function currentBeat() {
  const piece = pieceNow();
  const total = songBeats(piece);
  if (!playing || !ctx) return Math.min(pausedBeat, total);
  const elapsed = ctx.currentTime - playOriginTime;
  const beat = playOriginBeat + elapsed / (60 / piece.bpm);
  if (piece.loop) return ((beat % total) + total) % total;
  return Math.max(0, beat);
}

function beatFrom(bpm: number) {
  if (!playing || !ctx) return pausedBeat;
  return playOriginBeat + (ctx.currentTime - playOriginTime) / (60 / bpm);
}

export async function unlock() {
  if (typeof window === "undefined") return;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state !== "running") await ctx.resume();
  ensureGraph();
  ensureTracks();
  syncMix();
}

function impulse(context: BaseAudioContext) {
  const cached = impulses.get(context);
  if (cached) return cached;
  const rate = context.sampleRate;
  const len = Math.floor(rate * 1.7);
  const buffer = context.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.7);
  }
  impulses.set(context, buffer);
  return buffer;
}

function noise(context: BaseAudioContext) {
  const cached = noiseBuffers.get(context);
  if (cached) return cached;
  const len = Math.floor(context.sampleRate);
  const buffer = context.createBuffer(1, len, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffers.set(context, buffer);
  return buffer;
}

function ensureGraph() {
  if (!ctx || master) return;
  master = ctx.createGain();
  dryBus = ctx.createGain();
  reverbGain = ctx.createGain();
  reverbBus = ctx.createConvolver();
  reverbBus.buffer = impulse(ctx);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.18;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  dryBus.connect(comp);
  reverbBus.connect(reverbGain);
  reverbGain.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);
  master.connect(analyser);
}

function createChannel(context: BaseAudioContext, dry: AudioNode, verb: AudioNode): Channel {
  const input = context.createGain();
  const pan = context.createStereoPanner();
  const gain = context.createGain();
  const send = context.createGain();
  input.connect(pan);
  pan.connect(gain);
  gain.connect(dry);
  gain.connect(send);
  send.connect(verb);
  return { input, pan, gain, send };
}

function ensureTracks() {
  if (!ctx || !dryBus || !reverbBus) return;
  const tracks = useStudio.getState().tracks;
  for (const track of tracks) {
    if (!channels.has(track.id)) channels.set(track.id, createChannel(ctx, dryBus, reverbBus));
  }
  for (const id of [...channels.keys()]) {
    if (!tracks.some((t) => t.id === id)) channels.delete(id);
  }
}

function trackAudible(track: Track, tracks: Track[]) {
  const solo = tracks.some((t) => t.solo);
  return !track.mute && (!solo || track.solo);
}

function syncMix() {
  if (!ctx || !master || !reverbGain) return;
  const state = useStudio.getState();
  const now = ctx.currentTime;
  master.gain.setTargetAtTime(state.master, now, 0.02);
  reverbGain.gain.setTargetAtTime(state.reverb * 0.9, now, 0.03);
  for (const track of state.tracks) {
    const channel = channels.get(track.id);
    if (!channel) continue;
    const level = trackAudible(track, state.tracks) ? track.volume : 0;
    channel.gain.gain.setTargetAtTime(level, now, 0.015);
    channel.pan.pan.setTargetAtTime(track.pan, now, 0.02);
    channel.send.gain.setTargetAtTime(track.send, now, 0.02);
  }
}

function ampEnv(
  context: BaseAudioContext,
  time: number,
  peak: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  noteDur: number,
) {
  const gain = context.createGain();
  const a = Math.max(0.004, attack);
  const d = Math.max(0.02, decay);
  const r = Math.max(0.03, release);
  const p = Math.max(0.001, peak);
  const sus = Math.max(0.001, p * Math.max(0.001, sustain));
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(p, time + a);
  gain.gain.exponentialRampToValueAtTime(sus, time + a + d);
  const relAt = time + Math.max(noteDur, a + 0.02);
  if (relAt > time + a + d) gain.gain.setValueAtTime(sus, relAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, relAt + r);
  return {
    gain,
    release(at: number) {
      const t = Math.max(at, context.currentTime);
      gain.gain.cancelScheduledValues(t);
      const now = Math.max(0.0001, gain.gain.value || sus);
      gain.gain.setValueAtTime(now, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + r);
    },
  };
}

function triggerPreset(
  context: BaseAudioContext,
  dest: AudioNode,
  preset: Preset,
  midi: number,
  velocity: number,
  time: number,
  durationSec: number | null,
): Hang["stop"] {
  const freq = midiToFreq(midi);
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = preset.filterQ;
  const startF = Math.max(90, Math.min(14000, preset.filter + preset.filterEnv));
  const endF = Math.max(70, preset.filter);
  filter.frequency.setValueAtTime(startF, time);
  if (Math.abs(startF - endF) > 5) {
    filter.frequency.exponentialRampToValueAtTime(endF, time + Math.max(0.06, preset.attack + preset.decay));
  }
  const held = durationSec == null ? 24 : durationSec;
  const amp = ampEnv(
    context,
    time,
    preset.gain * (0.35 + (velocity / 127) * 0.65),
    preset.attack,
    preset.decay,
    preset.sustain,
    preset.release,
    held,
  );
  filter.connect(amp.gain);
  amp.gain.connect(dest);
  const oscs: OscillatorNode[] = [];
  const end = time + held + preset.release + 0.08;

  if (preset.fm) {
    const carrier = context.createOscillator();
    carrier.type = "sine";
    carrier.frequency.setValueAtTime(freq, time);
    const mod = context.createOscillator();
    mod.type = "sine";
    mod.frequency.setValueAtTime(freq * preset.fm.ratio, time);
    const modGain = context.createGain();
    modGain.gain.setValueAtTime(Math.max(2, freq * preset.fm.index), time);
    modGain.gain.exponentialRampToValueAtTime(1, time + Math.max(0.05, preset.fm.decay));
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(filter);
    carrier.start(time);
    mod.start(time);
    carrier.stop(end);
    mod.stop(end);
    oscs.push(carrier, mod);
  }

  for (const partial of preset.partials) {
    const osc = context.createOscillator();
    osc.type = partial.type;
    osc.frequency.setValueAtTime(freq * partial.ratio, time);
    if (partial.detune) osc.detune.setValueAtTime(partial.detune, time);
    const g = context.createGain();
    g.gain.value = partial.gain;
    osc.connect(g);
    g.connect(filter);
    osc.start(time);
    osc.stop(end);
    oscs.push(osc);
  }

  let lfo: OscillatorNode | null = null;
  if (preset.vibrato > 0 && oscs.length) {
    lfo = context.createOscillator();
    lfo.frequency.value = 5.15;
    const lfoGain = context.createGain();
    lfoGain.gain.value = freq * preset.vibrato;
    lfo.connect(lfoGain);
    for (const osc of oscs) lfoGain.connect(osc.frequency);
    lfo.start(time);
    lfo.stop(end);
  }

  return (at: number) => {
    amp.release(at);
    const stopAt = at + preset.release + 0.06;
    for (const osc of oscs) {
      try {
        osc.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    if (lfo) {
      try {
        lfo.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
  };
}

function playDrum(context: BaseAudioContext, dest: AudioNode, voice: DrumVoice, time: number, velocity: number): Hang["stop"] {
  const vel = velocity / 127;
  const oscs: OscillatorNode[] = [];
  const sources: AudioBufferSourceNode[] = [];

  const tone = (freq: number, decay: number, type: OscillatorType, gain: number, slideTo?: number) => {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, freq), time);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(36, slideTo), time + Math.max(0.02, decay * 0.7));
    const g = context.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain * vel), time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + decay + 0.02);
    oscs.push(osc);
  };

  const burst = (decay: number, freq: number, type: BiquadFilterType, gain: number, delay = 0) => {
    const src = context.createBufferSource();
    src.buffer = noise(context);
    const t = time + delay;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = context.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain * vel), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(t);
    src.stop(t + decay + 0.02);
    sources.push(src);
  };

  switch (voice) {
    case "kick":
      tone(150, 0.32, "sine", 1, 48);
      tone(1400, 0.02, "square", 0.1, 180);
      break;
    case "snare":
      tone(196, 0.16, "triangle", 0.32, 150);
      burst(0.18, 1800, "highpass", 0.42);
      break;
    case "hat":
      burst(0.04, 7200, "highpass", 0.26);
      break;
    case "open":
      burst(0.34, 5800, "highpass", 0.24);
      break;
    case "clap":
      burst(0.035, 1500, "bandpass", 0.38, 0);
      burst(0.045, 1700, "bandpass", 0.34, 0.011);
      burst(0.14, 1400, "bandpass", 0.3, 0.024);
      break;
    case "tom":
      tone(168, 0.3, "sine", 0.62, 92);
      break;
    case "rim":
      tone(920, 0.045, "square", 0.16);
      burst(0.03, 2800, "highpass", 0.18);
      break;
    case "crash":
      burst(0.75, 4800, "highpass", 0.22);
      break;
    case "shaker":
      burst(0.06, 5200, "highpass", 0.18);
      break;
    case "cowbell":
      tone(587, 0.16, "square", 0.11);
      tone(845, 0.14, "square", 0.07);
      break;
    default:
      break;
  }

  return (at: number) => {
    for (const osc of oscs) {
      try {
        osc.stop(at);
      } catch {
        /* noop */
      }
    }
    for (const src of sources) {
      try {
        src.stop(at);
      } catch {
        /* noop */
      }
    }
  };
}

function playBuffer(
  context: BaseAudioContext,
  dest: AudioNode,
  buffer: AudioBuffer,
  time: number,
  gain: number,
  offset: number,
): Hang["stop"] {
  const src = context.createBufferSource();
  src.buffer = buffer;
  const g = context.createGain();
  g.gain.value = Math.max(0, gain);
  src.connect(g);
  g.connect(dest);
  const off = Math.max(0, Math.min(offset, Math.max(0, buffer.duration - 0.02)));
  try {
    src.start(time, off);
  } catch {
    /* ignore late starts */
  }
  return (at: number) => {
    try {
      src.stop(Math.max(at, time));
    } catch {
      /* noop */
    }
  };
}

function metronome(context: BaseAudioContext, dest: AudioNode, time: number, accent: boolean): Hang["stop"] {
  const osc = context.createOscillator();
  osc.type = "square";
  osc.frequency.value = accent ? 1760 : 1200;
  const g = context.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(accent ? 0.05 : 0.028, time + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
  osc.connect(g);
  g.connect(dest);
  osc.start(time);
  osc.stop(time + 0.04);
  return (at: number) => {
    try {
      osc.stop(at);
    } catch {
      /* noop */
    }
  };
}

function clipBuffer(clip: AudioClip): AudioBuffer | null {
  return getBuffer(clip.tunedBufferId || "") ?? getBuffer(clip.bufferId);
}

function dispatchBeat(
  context: BaseAudioContext,
  map: Map<string, Channel>,
  piece: Piece,
  beat: number,
  time: number,
  withClick: boolean,
) {
  const stepIndex = Math.round(beat * 4);
  const sixteenth = 60 / piece.bpm / 4;
  for (const track of piece.tracks) {
    if (!trackAudible(track, piece.tracks)) continue;
    const dest = map.get(track.id)?.input;
    if (!dest) continue;
    if (track.kind === "midi") {
      for (const note of track.notes) {
        if (Math.round(note.start * 4) !== stepIndex) continue;
        if (suppress.has(note.id)) continue;
        const dur = Math.max(0.06, note.duration * (60 / piece.bpm));
        const stop = triggerPreset(context, dest, presetById(track.instrument), note.midi, note.velocity, time, dur);
        hanging.push({ stop });
      }
    } else if (track.kind === "drum") {
      const patternBeats = Math.max(0.25, track.stepCount / 4);
      const idx = Math.round((beat % patternBeats) * 4) % track.stepCount;
      const when = stepIndex % 4 === 2 ? time + piece.swing * sixteenth * 0.67 : time;
      track.rows.forEach((row, r) => {
        const vel = track.steps[r]?.[idx] ?? 0;
        if (!vel) return;
        if (row.voice === "sample") {
          if (!row.sampleId) return;
          const buffer = getBuffer(row.sampleId);
          if (!buffer) return;
          hanging.push({ stop: playBuffer(context, dest, buffer, when, (vel / 127) * 0.95, 0) });
        } else {
          hanging.push({ stop: playDrum(context, dest, row.voice, when, vel) });
        }
      });
    } else {
      for (const clip of track.clips) {
        if (Math.round(clip.start * 4) !== stepIndex) continue;
        const buffer = clipBuffer(clip);
        if (!buffer) continue;
        hanging.push({ stop: playBuffer(context, dest, buffer, time, clip.gain, 0) });
      }
    }
  }
  if (withClick && piece.metronome && master && stepIndex % 4 === 0) {
    const accent = stepIndex % (piece.beatsPerBar * 4) === 0;
    hanging.push({ stop: metronome(context, master, time, accent) });
  }
}

function stopHanging(at: number) {
  const list = hanging;
  hanging = [];
  for (const item of list) item.stop(at);
}

function sixteenthSec() {
  return 60 / useStudio.getState().bpm / 4;
}

function arm(beat: number) {
  if (!ctx) return;
  const state = useStudio.getState();
  const total = songBeats(state);
  const t0 = ctx.currentTime + 0.05;
  const start = Math.max(0, Math.min(beat, total));
  playOriginTime = t0;
  playOriginBeat = start;
  nextBeat = Math.ceil((start - 1e-4) * 4) / 4;
  if (nextBeat >= total) nextBeat = 0;
  nextTime = t0 + Math.max(0, nextBeat - start) * (60 / state.bpm);
  for (const track of state.tracks) {
    if (track.kind !== "audio" || !trackAudible(track, state.tracks)) continue;
    const dest = channels.get(track.id)?.input;
    if (!dest) continue;
    for (const clip of track.clips) {
      const buffer = clipBuffer(clip);
      if (!buffer) continue;
      const durBeats = (buffer.duration * state.bpm) / 60;
      if (clip.start < start && clip.start + durBeats > start + 0.02) {
        const offset = ((start - clip.start) * 60) / state.bpm;
        hanging.push({ stop: playBuffer(ctx, dest, buffer, t0, clip.gain, offset) });
      }
    }
  }
}

function schedule() {
  if (!playing || !ctx) return;
  const horizon = ctx.currentTime + 0.09;
  const state = useStudio.getState();
  const total = songBeats(state);
  let guard = 0;
  while (nextTime < horizon && guard < 12) {
    guard += 1;
    if (nextBeat >= total - 1e-4) {
      if (!state.loop) {
        playing = false;
        const endAt = nextTime;
        window.setTimeout(() => {
          if (!ctx || playing) return;
          stopHanging(ctx.currentTime);
          pausedBeat = 0;
          publish(0, false);
        }, Math.max(0, (endAt - ctx.currentTime) * 1000 + 30));
        break;
      }
      stopHanging(nextTime);
      suppress.clear();
      nextBeat = 0;
    }
    dispatchBeat(ctx, channels, pieceOf(state), nextBeat, nextTime, true);
    nextBeat = Math.round((nextBeat + 0.25) * 4) / 4;
    nextTime += sixteenthSec();
  }
  if (playing) publish(currentBeat(), true);
  timer = window.setTimeout(schedule, 25);
}

export async function play() {
  await unlock();
  if (!ctx || playing) return;
  playing = true;
  arm(pausedBeat);
  schedule();
  publish(pausedBeat, true);
}

export function pause() {
  if (!ctx) return;
  if (playing) pausedBeat = currentBeat();
  playing = false;
  window.clearTimeout(timer);
  stopHanging(ctx.currentTime);
  for (const stop of previews.values()) stop(ctx.currentTime);
  previews.clear();
  publish(pausedBeat, false);
}

export function stop() {
  if (ctx && playing) {
    playing = false;
    window.clearTimeout(timer);
    stopHanging(ctx.currentTime);
  }
  playing = false;
  pausedBeat = 0;
  suppress.clear();
  publish(0, false);
}

export async function togglePlay() {
  if (playing) pause();
  else await play();
}

export function seek(beat: number) {
  const total = songBeats();
  const next = Math.max(0, Math.min(total, beat));
  const was = playing;
  if (was) pause();
  pausedBeat = next;
  publish(next, false);
  if (was) void play();
}

export async function noteOn(rawMidi: number) {
  const state = useStudio.getState();
  const track = state.tracks.find((t) => t.id === state.selectedTrackId);
  if (!track || track.kind !== "midi") return;
  const midi = state.scaleLock ? snapToScale(rawMidi, state.keyRoot, state.scale) : rawMidi;
  markPressed(midi, true);
  finger.set(rawMidi, { trackId: track.id, midi });
  await unlock();
  if (!ctx) return;
  const dest = channels.get(track.id)?.input;
  const fresh = useStudio.getState();
  const live = fresh.tracks.find((t) => t.id === track.id) ?? track;
  if (!dest || !trackAudible(live, fresh.tracks)) return;
  const key = `${track.id}:${midi}`;
  previews.get(key)?.(ctx.currentTime);
  previews.set(key, triggerPreset(ctx, dest, presetById(live.instrument), midi, 108, ctx.currentTime, null));
  if (fresh.recording) {
    if (!playing) await play();
    held.set(key, { trackId: track.id, midi, start: currentBeat() });
  }
}

export function noteOff(rawMidi: number) {
  const mapped = finger.get(rawMidi);
  finger.delete(rawMidi);
  if (!mapped) {
    markPressed(rawMidi, false);
    return;
  }
  markPressed(mapped.midi, false);
  const key = `${mapped.trackId}:${mapped.midi}`;
  if (ctx) previews.get(key)?.(ctx.currentTime);
  previews.delete(key);
  const start = held.get(key);
  held.delete(key);
  const state = useStudio.getState();
  if (!start || !state.recording) return;
  let dur = currentBeat() - start.start;
  const total = songBeats(state);
  if (dur < -0.05) dur += total;
  const id = state.addNote(start.trackId, {
    midi: start.midi,
    start: start.start,
    duration: Math.max(0.25, dur),
    velocity: 104,
  });
  suppress.add(id);
}

export function releaseAll() {
  for (const raw of [...finger.keys()]) noteOff(raw);
}

export async function previewDrum(rowIndex: number, write: boolean) {
  const state = useStudio.getState();
  const track =
    state.tracks.find((t) => t.id === state.selectedTrackId && t.kind === "drum") ??
    state.tracks.find((t) => t.kind === "drum");
  if (!track) return;
  await unlock();
  if (!ctx) return;
  const dest = channels.get(track.id)?.input;
  const row = track.rows[rowIndex];
  if (!dest || !row) return;
  if (row.voice === "sample" && row.sampleId) {
    const buffer = getBuffer(row.sampleId);
    if (buffer) playBuffer(ctx, dest, buffer, ctx.currentTime, 0.9, 0);
  } else if (row.voice !== "sample") {
    playDrum(ctx, dest, row.voice, ctx.currentTime, 112);
  }
  if (write && state.recording && playing) {
    const idx = Math.floor(currentBeat() * 4 + 1e-4) % track.stepCount;
    useStudio.getState().setStep(track.id, rowIndex, idx, 112);
  }
}

export async function startVoice(trackId: string) {
  await unlock();
  if (!ctx) throw new Error("Audio isn't available in this browser.");
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser can't record a microphone.");
  }
  if (!micStream) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch {
      throw new Error("Microphone blocked. Allow it to record a vocal.");
    }
    micSource = ctx.createMediaStreamSource(micStream);
    micProc = ctx.createScriptProcessor(4096, 1, 1);
    micMute = ctx.createGain();
    micMute.gain.value = 0;
    micProc.onaudioprocess = (event) => {
      const data = event.inputBuffer.getChannelData(0);
      if (capturing) captureChunks.push(new Float32Array(data));
      if (!levelCb) return;
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      levelCb(Math.sqrt(sum / data.length));
    };
    micSource.connect(micProc);
    micProc.connect(micMute);
    micMute.connect(ctx.destination);
  }
  captureChunks = [];
  capturing = true;
  useStudio.getState().setLoop(false);
  useStudio.getState().setRecording(true);
  if (!playing) await play();
  captureStart = currentBeat();
  useStudio.getState().selectTrack(trackId);
}

export function stopVoice(trackId: string) {
  capturing = false;
  useStudio.getState().setRecording(false);
  if (!ctx || !captureChunks.length) return;
  const length = captureChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (length < ctx.sampleRate * 0.15) {
    captureChunks = [];
    useStudio.getState().setStatus("That take was too short. Hold the mic a little longer.");
    return;
  }
  const data = new Float32Array(length);
  let offset = 0;
  for (const chunk of captureChunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  captureChunks = [];
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.getChannelData(0).set(data);
  const id = `buf_${Math.random().toString(36).slice(2, 9)}`;
  remember(id, buffer);
  useStudio.getState().addClip(trackId, {
    name: "Voice",
    bufferId: id,
    start: Math.max(0, Math.round(captureStart * 4) / 4),
    gain: 0.95,
    transpose: 0,
    tune: 0,
    tunedBufferId: null,
  });
  useStudio.getState().setStatus("Vocal is on the voice track. Tune it without changing the timing.");
}

function computePeaks(data: Float32Array, buckets = 160) {
  const out: number[] = [];
  const size = Math.max(1, Math.floor(data.length / buckets));
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const start = i * size;
    for (let j = 0; j < size; j += 4) max = Math.max(max, Math.abs(data[start + j] ?? 0));
    out.push(max);
  }
  return out;
}

export function remember(id: string, buffer: AudioBuffer) {
  decoded.set(id, buffer);
  const channelsData = Array.from({ length: buffer.numberOfChannels }, (_, i) => Float32Array.from(buffer.getChannelData(i)));
  pcm.set(id, { sampleRate: buffer.sampleRate, channels: channelsData });
  peaks.set(id, computePeaks(channelsData[0] ?? new Float32Array()));
}

export function holdPcm(id: string, sampleRate: number, channelData: Float32Array[]) {
  pcm.set(id, { sampleRate, channels: channelData });
  peaks.set(id, computePeaks(channelData[0] ?? new Float32Array()));
  decoded.delete(id);
}

export function getPeaks(id: string) {
  return peaks.get(id) ?? null;
}

export function getDuration(id: string) {
  const buffer = decoded.get(id);
  if (buffer) return buffer.duration;
  const raw = pcm.get(id);
  if (!raw?.channels[0]) return 0;
  return raw.channels[0].length / raw.sampleRate;
}

export function getBuffer(id: string): AudioBuffer | null {
  if (!id) return null;
  const hit = decoded.get(id);
  if (hit) return hit;
  const raw = pcm.get(id);
  if (!raw?.channels[0] || !ctx) return null;
  const buffer = ctx.createBuffer(raw.channels.length, raw.channels[0].length, raw.sampleRate);
  raw.channels.forEach((ch, i) => buffer.getChannelData(i).set(ch));
  decoded.set(id, buffer);
  return buffer;
}

export function collectBuffers(ids: string[]) {
  const out: Record<string, { sampleRate: number; channels: ArrayBuffer[] }> = {};
  for (const id of ids) {
    const raw = pcm.get(id);
    if (!raw) continue;
    out[id] = {
      sampleRate: raw.sampleRate,
      channels: raw.channels.map((ch) => {
        const copy = new ArrayBuffer(ch.byteLength);
        new Float32Array(copy).set(ch);
        return copy;
      }),
    };
  }
  return out;
}

export function bufferIds(piece: Piece) {
  const ids = new Set<string>();
  for (const track of piece.tracks) {
    for (const clip of track.clips) {
      ids.add(clip.bufferId);
      if (clip.tunedBufferId) ids.add(clip.tunedBufferId);
    }
    for (const row of track.rows) if (row.sampleId) ids.add(row.sampleId);
  }
  return [...ids];
}

export async function decodeFile(file: File) {
  await unlock();
  if (!ctx) throw new Error("Audio isn't available.");
  try {
    const arr = await file.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arr.slice(0));
    const id = `buf_${Math.random().toString(36).slice(2, 9)}`;
    remember(id, buffer);
    return { id, name: file.name.replace(/\.[^.]+$/, "") || "Audio" };
  } catch {
    throw new Error("Couldn't read that file. Try WAV, MP3, or OGG.");
  }
}

export async function tuneClip(trackId: string, clipId: string) {
  const state = useStudio.getState();
  const clip = state.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId);
  if (!clip) return;
  if (clip.tune <= 0.001 && clip.transpose === 0) {
    if (clip.tunedBufferId) useStudio.getState().patchClip(trackId, clipId, { tunedBufferId: null });
    return;
  }
  const cacheKey = `${clip.bufferId}:${clip.tune.toFixed(2)}:${clip.transpose}:${state.keyRoot}:${state.scale}`;
  const cached = tuneCache.get(cacheKey);
  if (cached && pcm.has(cached)) {
    if (clip.tunedBufferId !== cached) useStudio.getState().patchClip(trackId, clipId, { tunedBufferId: cached });
    return;
  }
  const src = pcm.get(clip.bufferId);
  if (!src?.channels[0]) return;
  setBusy("Tuning the take");
  await new Promise((resolve) => window.setTimeout(resolve, 16));
  try {
    const tuned = retuneChannels(src.channels, src.sampleRate, {
      transpose: clip.transpose,
      strength: clip.tune,
      rootPc: rootPc(state.keyRoot),
      scale: state.scale,
    });
    await unlock();
    if (!ctx || !tuned[0]) return;
    const buffer = ctx.createBuffer(tuned.length, tuned[0].length, src.sampleRate);
    tuned.forEach((ch, i) => buffer.getChannelData(i).set(ch));
    const id = `tune_${Math.random().toString(36).slice(2, 8)}`;
    remember(id, buffer);
    tuneCache.set(cacheKey, id);
    useStudio.getState().patchClip(trackId, clipId, { tunedBufferId: id });
  } finally {
    setBusy(null);
  }
}

export async function renderMix() {
  const piece = pieceNow();
  await unlock();
  setBusy("Rendering mix");
  try {
    const total = songBeats(piece);
    const seconds = total * (60 / piece.bpm) + 0.85;
    const offline = new OfflineAudioContext(2, Math.ceil(seconds * 44100), 44100);
    const dry = offline.createGain();
    const verb = offline.createConvolver();
    verb.buffer = impulse(offline);
    const verbGain = offline.createGain();
    verbGain.gain.value = piece.reverb * 0.9;
    const comp = offline.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    const out = offline.createGain();
    out.gain.value = piece.master;
    dry.connect(comp);
    verb.connect(verbGain);
    verbGain.connect(comp);
    comp.connect(out);
    out.connect(offline.destination);
    const map = new Map<string, Channel>();
    for (const track of piece.tracks) map.set(track.id, createChannel(offline, dry, verb));
    for (const track of piece.tracks) {
      const channel = map.get(track.id);
      if (!channel) continue;
      channel.gain.gain.value = trackAudible(track, piece.tracks) ? track.volume : 0;
      channel.pan.pan.value = track.pan;
      channel.send.gain.value = track.send;
    }
    const t0 = 0.05;
    const live = hanging;
    hanging = [];
    for (let step = 0; step < total * 4; step++) {
      const beat = step / 4;
      dispatchBeat(offline, map, piece, beat, t0 + beat * (60 / piece.bpm), false);
    }
    hanging = live;
    const rendered = await offline.startRendering();
    return audioBufferToWav(rendered);
  } finally {
    setBusy(null);
  }
}

export function startMeter(onLevel: (level: number) => void) {
  const data = new Uint8Array(1024);
  let raf = 0;
  const loop = () => {
    if (analyser) {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      onLevel(Math.min(1, Math.sqrt(sum / data.length) * 3.2));
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}

export function attach() {
  if (attached || typeof window === "undefined") return;
  attached = true;
  useStudio.subscribe((state, prev) => {
    if (!ctx) return;
    ensureTracks();
    syncMix();
    if (
      playing &&
      (state.bpm !== prev.bpm || state.bars !== prev.bars || state.beatsPerBar !== prev.beatsPerBar || state.loop !== prev.loop)
    ) {
      let beat = beatFrom(prev.bpm);
      const total = songBeats(state);
      beat = state.loop ? ((beat % total) + total) % total : Math.min(Math.max(0, beat), total);
      window.clearTimeout(timer);
      stopHanging(ctx.currentTime);
      pausedBeat = beat;
      arm(beat);
      schedule();
    }
  });
}
