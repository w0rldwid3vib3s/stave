import type { Scale } from "@/lib/studio/types";
import { scalePcs } from "@/lib/studio/theory";

export type TuneOpts = {
  transpose: number;
  strength: number;
  rootPc: number;
  scale: Scale;
};

function detectPitch(frame: Float32Array, sampleRate: number): number | null {
  const n = frame.length;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += frame[i] * frame[i];
  if (Math.sqrt(energy / n) < 0.012) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / 900));
  const maxLag = Math.min(Math.floor(sampleRate / 70), n - 2);
  let bestLag = -1;
  let best = 0;

  const corrAt = (lag: number) => {
    let sum = 0;
    let e1 = 0;
    let e2 = 0;
    const limit = n - lag;
    for (let i = 0; i < limit; i++) {
      const a = frame[i];
      const b = frame[i + lag];
      sum += a * b;
      e1 += a * a;
      e2 += b * b;
    }
    return sum / Math.sqrt(e1 * e2 + 1e-12);
  };

  for (let lag = minLag; lag <= maxLag; lag++) {
    const norm = corrAt(lag);
    if (norm > best) {
      best = norm;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || best < 0.72) return null;
  const half = Math.round(bestLag / 2);
  if (half >= minLag && corrAt(half) > best * 0.9) bestLag = half;
  return sampleRate / bestLag;
}

function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate <= toRate + 50) return input;
  const ratio = fromRate / toRate;
  const len = Math.floor(input.length / ratio);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = input[Math.floor(i * ratio)] ?? 0;
  return out;
}

function nearestScaleMidi(midi: number, rootPc: number, scale: Scale): number {
  const pcs = scalePcs(scale);
  let best = Math.round(midi);
  let bestD = 99;
  for (let m = Math.round(midi) - 6; m <= Math.round(midi) + 6; m++) {
    const pc = (((m % 12) + 12) % 12 - rootPc + 12) % 12;
    if (!pcs.includes(pc)) continue;
    const d = Math.abs(m - midi);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

function ratioCurve(channel: Float32Array, sampleRate: number, opts: TuneOpts): (sample: number) => number {
  const base = Math.pow(2, opts.transpose / 12);
  if (opts.strength <= 0.001) return () => base;

  const detectRate = 8000;
  const down = downsample(channel, sampleRate, detectRate);
  const frame = 512;
  const detectHop = 256;
  const outHop = 256;
  const frames = Math.max(1, Math.ceil(channel.length / outHop));
  const ratios = new Float32Array(frames);
  ratios.fill(base);

  const rateRatio = sampleRate / detectRate;
  for (let pos = 0; pos + frame < down.length; pos += detectHop) {
    const f0 = detectPitch(down.subarray(pos, pos + frame), detectRate);
    let ratio = base;
    if (f0 && f0 > 60 && f0 < 1200) {
      const midi = 69 + 12 * Math.log2(f0 / 440);
      const target = nearestScaleMidi(midi, opts.rootPc, opts.scale);
      const corrected = midi + (target - midi) * opts.strength;
      const targetF = 440 * Math.pow(2, (corrected - 69) / 12);
      ratio = (targetF / f0) * base;
    }
    const orig = Math.floor(pos * rateRatio);
    const idx = Math.min(frames - 1, Math.floor(orig / outHop));
    ratios[idx] = Math.min(2, Math.max(0.5, ratio));
  }

  for (let i = 1; i < ratios.length; i++) {
    if (ratios[i] === base && ratios[i - 1] !== base) ratios[i] = ratios[i - 1];
  }
  for (let i = 1; i < ratios.length; i++) ratios[i] = ratios[i - 1] * 0.35 + ratios[i] * 0.65;

  return (sample: number) => {
    const f = sample / outHop;
    const i = Math.max(0, Math.min(ratios.length - 1, Math.floor(f)));
    const t = f - i;
    const a = ratios[i] ?? base;
    const b = ratios[Math.min(ratios.length - 1, i + 1)] ?? a;
    return a + (b - a) * Math.max(0, Math.min(1, t));
  };
}

function renderShift(input: Float32Array, ratioAt: (sample: number) => number): Float32Array {
  const grain = input.length < 4096 ? 512 : 2048;
  const hop = grain >> 1;
  const out = new Float32Array(input.length);
  const win = new Float32Array(grain);
  for (let i = 0; i < grain; i++) win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / grain));

  for (let pos = 0; pos < input.length; pos += hop) {
    const ratio = Math.min(2, Math.max(0.5, ratioAt(Math.min(pos, input.length - 1))));
    const end = Math.min(grain, out.length - pos);
    for (let i = 0; i < end; i++) {
      const srcPos = pos + i * ratio;
      const i0 = Math.floor(srcPos);
      const frac = srcPos - i0;
      if (i0 < 0 || i0 + 1 >= input.length) continue;
      const s = input[i0] * (1 - frac) + input[i0 + 1] * frac;
      const w = pos === 0 && i < hop ? 1 : win[i];
      out[pos + i] += s * w;
    }
  }

  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0.98) {
    const g = 0.98 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
  return out;
}

export function retuneChannels(channels: Float32Array[], sampleRate: number, opts: TuneOpts): Float32Array[] {
  if (opts.strength <= 0.001 && Math.abs(opts.transpose) < 0.01) {
    return channels.map((ch) => Float32Array.from(ch));
  }
  const ratioAt = ratioCurve(channels[0] ?? new Float32Array(0), sampleRate, opts);
  return channels.map((ch) => renderShift(ch, ratioAt));
}

/** Rough identity check used by unit smoke: constant ratio 1 stays close in the middle. */
export function shiftIdentityError(length = 8000): number {
  const input = new Float32Array(length);
  for (let i = 0; i < length; i++) input[i] = Math.sin((2 * Math.PI * 220 * i) / 44100) * 0.4;
  const out = renderShift(input, () => 1);
  let err = 0;
  let n = 0;
  for (let i = 2500; i < length - 2500; i++) {
    err += Math.abs(out[i] - input[i]);
    n++;
  }
  return err / n;
}
