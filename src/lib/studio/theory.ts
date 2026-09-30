export type Scale = "major" | "minor";

export const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

export const KEYS: { id: string; root: string; scale: Scale; label: string }[] = [
  { id: "C", root: "C", scale: "major", label: "C major" },
  { id: "G", root: "G", scale: "major", label: "G major" },
  { id: "D", root: "D", scale: "major", label: "D major" },
  { id: "A", root: "A", scale: "major", label: "A major" },
  { id: "E", root: "E", scale: "major", label: "E major" },
  { id: "F", root: "F", scale: "major", label: "F major" },
  { id: "Bb", root: "Bb", scale: "major", label: "B♭ major" },
  { id: "Eb", root: "Eb", scale: "major", label: "E♭ major" },
  { id: "Ab", root: "Ab", scale: "major", label: "A♭ major" },
  { id: "Am", root: "A", scale: "minor", label: "A minor" },
  { id: "Em", root: "E", scale: "minor", label: "E minor" },
  { id: "Bm", root: "B", scale: "minor", label: "B minor" },
  { id: "Dm", root: "D", scale: "minor", label: "D minor" },
  { id: "Gm", root: "G", scale: "minor", label: "G minor" },
  { id: "Cm", root: "C", scale: "minor", label: "C minor" },
];

const LETTER: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

const SHARP_SPELL: { letter: string; alt: number }[] = [
  { letter: "C", alt: 0 },
  { letter: "C", alt: 1 },
  { letter: "D", alt: 0 },
  { letter: "D", alt: 1 },
  { letter: "E", alt: 0 },
  { letter: "F", alt: 0 },
  { letter: "F", alt: 1 },
  { letter: "G", alt: 0 },
  { letter: "G", alt: 1 },
  { letter: "A", alt: 0 },
  { letter: "A", alt: 1 },
  { letter: "B", alt: 0 },
];

const FLAT_SPELL: { letter: string; alt: number }[] = [
  { letter: "C", alt: 0 },
  { letter: "D", alt: -1 },
  { letter: "D", alt: 0 },
  { letter: "E", alt: -1 },
  { letter: "E", alt: 0 },
  { letter: "F", alt: 0 },
  { letter: "G", alt: -1 },
  { letter: "G", alt: 0 },
  { letter: "A", alt: -1 },
  { letter: "A", alt: 0 },
  { letter: "B", alt: -1 },
  { letter: "B", alt: 0 },
];

const MAJOR_ACC: Record<string, Record<string, number>> = {
  C: {},
  G: { F: 1 },
  D: { F: 1, C: 1 },
  A: { F: 1, C: 1, G: 1 },
  E: { F: 1, C: 1, G: 1, D: 1 },
  B: { F: 1, C: 1, G: 1, D: 1, A: 1 },
  F: { B: -1 },
  Bb: { B: -1, E: -1 },
  Eb: { B: -1, E: -1, A: -1 },
  Ab: { B: -1, E: -1, A: -1, D: -1 },
  Db: { B: -1, E: -1, A: -1, D: -1, G: -1 },
  Gb: { B: -1, E: -1, A: -1, D: -1, G: -1, C: -1 },
};

const SIG_COUNT: Record<string, number> = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  F: -1,
  Bb: -2,
  Eb: -3,
  Ab: -4,
  Db: -5,
  Gb: -6,
};

export function rootPc(root: string): number {
  const i = ROOTS.indexOf(root as (typeof ROOTS)[number]);
  return i < 0 ? 0 : i;
}

export function relativeMajor(minorRoot: string): string {
  return ROOTS[(rootPc(minorRoot) + 3) % 12];
}

export function majorKeyName(root: string, scale: Scale): string {
  return scale === "minor" ? relativeMajor(root) : root;
}

export function prefersFlats(root: string, scale: Scale): boolean {
  const major = majorKeyName(root, scale);
  return (SIG_COUNT[major] ?? 0) < 0;
}

export function spellPitch(midi: number, flats: boolean): { letter: string; alt: number; octave: number } {
  const pc = ((midi % 12) + 12) % 12;
  const spell = (flats ? FLAT_SPELL : SHARP_SPELL)[pc];
  const octave = Math.floor(midi / 12) - 1;
  return { letter: spell.letter, alt: spell.alt, octave };
}

/** Diatonic steps from C0, respecting spelling so sharps and flats sit on the right line. */
export function staffSteps(midi: number, flats: boolean): number {
  const s = spellPitch(midi, flats);
  return s.octave * 7 + (LETTER[s.letter] ?? 0);
}

export function accidentalFor(midi: number, root: string, scale: Scale): number | null {
  const flats = prefersFlats(root, scale);
  const spell = spellPitch(midi, flats);
  const major = majorKeyName(root, scale);
  const keyAlt = MAJOR_ACC[major]?.[spell.letter] ?? 0;
  if (spell.alt === keyAlt) return null;
  return spell.alt;
}

export function keySignature(root: string, scale: Scale): { alt: 1 | -1; count: number } {
  const n = SIG_COUNT[majorKeyName(root, scale)] ?? 0;
  if (n >= 0) return { alt: 1, count: n };
  return { alt: -1, count: -n };
}

/** Staff steps above the bottom line for each accidental in signature order. */
export function signatureSteps(clef: "treble" | "bass", alt: 1 | -1): number[] {
  if (clef === "treble") {
    return alt === 1 ? [8, 5, 9, 6, 3, 7, 4] : [4, 7, 3, 6, 2, 5, 1];
  }
  return alt === 1 ? [6, 3, 7, 4, 1, 5, 2] : [2, 5, 1, 4, 0, 3, -1];
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

export function scalePcs(scale: Scale): number[] {
  return scale === "major" ? MAJOR_SCALE : MINOR_SCALE;
}

export function snapToScale(midi: number, root: string, scale: Scale): number {
  const pcs = scalePcs(scale);
  const rootN = rootPc(root);
  let best = midi;
  let bestD = 99;
  for (let m = midi - 3; m <= midi + 3; m++) {
    const pc = (((m % 12) + 12) % 12 - rootN + 12) % 12;
    if (!pcs.includes(pc)) continue;
    const d = Math.abs(m - midi);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

export function noteName(midi: number, flats: boolean): string {
  const s = spellPitch(midi, flats);
  const glyph = s.alt === 1 ? "#" : s.alt === -1 ? "b" : "";
  return `${s.letter}${glyph}${s.octave}`;
}

export function durationName(dur: number): string {
  const map: [number, string][] = [
    [4, "whole"],
    [3, "dotted half"],
    [2, "half"],
    [1.5, "dotted quarter"],
    [1, "quarter"],
    [0.75, "dotted eighth"],
    [0.5, "eighth"],
    [0.25, "16th"],
  ];
  for (const [v, name] of map) {
    if (Math.abs(dur - v) < 0.02) return name;
  }
  return `${dur} beats`;
}

export function quantizeBeat(beat: number, grid = 0.25): number {
  return Math.round(beat / grid) * grid;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function keyId(root: string, scale: Scale): string {
  return KEYS.find((k) => k.root === root && k.scale === scale)?.id ?? "C";
}
