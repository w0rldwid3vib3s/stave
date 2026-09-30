import type { DrumRow, DrumVoice } from "@/lib/studio/types";

export const DRUM_VOICES: { id: DrumVoice; name: string }[] = [
  { id: "kick", name: "Kick" },
  { id: "snare", name: "Snare" },
  { id: "hat", name: "Hat" },
  { id: "open", name: "Open hat" },
  { id: "clap", name: "Clap" },
  { id: "tom", name: "Tom" },
  { id: "rim", name: "Rim" },
  { id: "crash", name: "Crash" },
  { id: "shaker", name: "Shaker" },
  { id: "cowbell", name: "Cowbell" },
];

export type Groove = {
  id: string;
  name: string;
  swing: number;
  stepCount: number;
  hits: [DrumVoice, number, number][];
};

export const GROOVES: Groove[] = [
  {
    id: "backbeat",
    name: "Backbeat",
    swing: 0.08,
    stepCount: 32,
    hits: [
      ["kick", 0, 112],
      ["kick", 8, 90],
      ["kick", 18, 100],
      ["kick", 24, 108],
      ["snare", 8, 104],
      ["snare", 24, 108],
      ["hat", 0, 70],
      ["hat", 2, 48],
      ["hat", 4, 72],
      ["hat", 6, 46],
      ["hat", 8, 68],
      ["hat", 10, 44],
      ["hat", 12, 74],
      ["hat", 16, 70],
      ["hat", 18, 48],
      ["hat", 20, 72],
      ["hat", 22, 46],
      ["hat", 24, 68],
      ["hat", 26, 44],
      ["hat", 28, 74],
      ["open", 14, 78],
      ["open", 30, 80],
      ["shaker", 2, 40],
      ["shaker", 6, 36],
      ["shaker", 10, 40],
      ["shaker", 14, 34],
      ["shaker", 18, 40],
      ["shaker", 22, 36],
      ["shaker", 26, 40],
      ["shaker", 30, 34],
    ],
  },
  {
    id: "floor",
    name: "Four on the floor",
    swing: 0,
    stepCount: 16,
    hits: [
      ["kick", 0, 116],
      ["kick", 4, 110],
      ["kick", 8, 116],
      ["kick", 12, 110],
      ["snare", 4, 100],
      ["snare", 12, 104],
      ["clap", 4, 70],
      ["clap", 12, 74],
      ["hat", 0, 64],
      ["hat", 2, 78],
      ["hat", 4, 60],
      ["hat", 6, 80],
      ["hat", 8, 64],
      ["hat", 10, 78],
      ["hat", 12, 60],
      ["hat", 14, 80],
      ["open", 14, 70],
    ],
  },
  {
    id: "halftime",
    name: "Halftime",
    swing: 0.05,
    stepCount: 16,
    hits: [
      ["kick", 0, 116],
      ["kick", 10, 88],
      ["snare", 8, 112],
      ["hat", 0, 60],
      ["hat", 2, 44],
      ["hat", 4, 66],
      ["hat", 6, 42],
      ["hat", 8, 60],
      ["hat", 10, 44],
      ["hat", 12, 66],
      ["hat", 14, 42],
      ["open", 14, 72],
      ["shaker", 4, 36],
      ["shaker", 12, 36],
    ],
  },
  {
    id: "bossa",
    name: "Bossa",
    swing: 0,
    stepCount: 32,
    hits: [
      ["kick", 0, 90],
      ["kick", 16, 86],
      ["rim", 0, 80],
      ["rim", 3, 70],
      ["rim", 6, 84],
      ["rim", 10, 76],
      ["rim", 12, 80],
      ["rim", 16, 80],
      ["rim", 19, 70],
      ["rim", 22, 84],
      ["rim", 26, 76],
      ["rim", 28, 80],
      ["hat", 0, 40],
      ["hat", 4, 36],
      ["hat", 8, 40],
      ["hat", 12, 36],
      ["hat", 16, 40],
      ["hat", 20, 36],
      ["hat", 24, 40],
      ["hat", 28, 36],
      ["shaker", 2, 48],
      ["shaker", 6, 42],
      ["shaker", 10, 48],
      ["shaker", 14, 42],
      ["shaker", 18, 48],
      ["shaker", 22, 42],
      ["shaker", 26, 48],
      ["shaker", 30, 42],
    ],
  },
  {
    id: "shuffle",
    name: "Shuffle",
    swing: 0.72,
    stepCount: 16,
    hits: [
      ["kick", 0, 112],
      ["kick", 8, 100],
      ["snare", 4, 104],
      ["snare", 12, 108],
      ["hat", 0, 72],
      ["hat", 2, 58],
      ["hat", 4, 70],
      ["hat", 6, 56],
      ["hat", 8, 72],
      ["hat", 10, 58],
      ["hat", 12, 70],
      ["hat", 14, 56],
      ["rim", 4, 50],
      ["rim", 12, 54],
    ],
  },
  {
    id: "empty",
    name: "Empty grid",
    swing: 0,
    stepCount: 16,
    hits: [],
  },
];

export function defaultRows(): DrumRow[] {
  return DRUM_VOICES.map((v) => ({
    id: v.id,
    name: v.name,
    voice: v.id,
    sampleId: null,
  }));
}

export function stepsFromGroove(groove: Groove, rows: DrumRow[]): number[][] {
  const steps = rows.map(() => Array.from({ length: groove.stepCount }, () => 0));
  for (const [voice, step, vel] of groove.hits) {
    const row = rows.findIndex((r) => r.voice === voice);
    if (row < 0 || step < 0 || step >= groove.stepCount) continue;
    steps[row][step] = vel;
  }
  return steps;
}

export function resizeSteps(steps: number[][], count: number): number[][] {
  return steps.map((row) => {
    const next = Array.from({ length: count }, () => 0);
    for (let i = 0; i < Math.min(count, row.length); i++) next[i] = row[i] ?? 0;
    return next;
  });
}
