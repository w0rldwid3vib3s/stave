export type Scale = "major" | "minor";

export type DrumVoice =
  | "kick"
  | "snare"
  | "hat"
  | "open"
  | "clap"
  | "tom"
  | "rim"
  | "crash"
  | "shaker"
  | "cowbell";

export type Accent = "brass" | "steel" | "bone";

export type MidiNote = {
  id: string;
  midi: number;
  start: number;
  duration: number;
  velocity: number;
};

export type AudioClip = {
  id: string;
  name: string;
  bufferId: string;
  start: number;
  gain: number;
  transpose: number;
  tune: number;
  tunedBufferId: string | null;
};

export type DrumRow = {
  id: string;
  name: string;
  voice: DrumVoice | "sample";
  sampleId: string | null;
};

export type Track = {
  id: string;
  name: string;
  kind: "midi" | "drum" | "audio";
  instrument: string;
  accent: Accent;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  send: number;
  notes: MidiNote[];
  rows: DrumRow[];
  steps: number[][];
  stepCount: number;
  clips: AudioClip[];
};

export type Panel = "keys" | "drums" | "voice" | "mix";

export type Piece = {
  name: string;
  bpm: number;
  beatsPerBar: number;
  bars: number;
  keyRoot: string;
  scale: Scale;
  swing: number;
  master: number;
  reverb: number;
  metronome: boolean;
  loop: boolean;
  octave: number;
  scaleLock: boolean;
  tracks: Track[];
  selectedTrackId: string;
};
