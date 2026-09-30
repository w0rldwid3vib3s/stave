import { defaultRows, GROOVES, stepsFromGroove } from "@/lib/studio/patterns";
import type { MidiNote, Piece, Track } from "@/lib/studio/types";

let noteSeq = 0;

function n(start: number, duration: number, midi: number, velocity = 96): MidiNote {
  noteSeq += 1;
  return { id: `demo_${noteSeq}`, midi, start, duration, velocity };
}

function midiTrack(
  partial: Pick<Track, "id" | "name" | "instrument" | "accent" | "volume" | "notes"> & Partial<Track>,
): Track {
  return {
    kind: "midi",
    pan: 0,
    mute: false,
    solo: false,
    send: partial.instrument === "flute" ? 0.18 : 0.12,
    rows: [],
    steps: [],
    stepCount: 16,
    clips: [],
    ...partial,
  };
}

export function demoPiece(): Piece {
  noteSeq = 0;
  const rows = defaultRows();
  const groove = GROOVES[0];
  const melody: MidiNote[] = [
    n(0, 1, 64),
    n(1, 1, 67),
    n(2, 1, 69),
    n(3, 1, 67),
    n(4, 1, 65),
    n(5, 1, 62),
    n(6, 2, 60),
    n(8, 1, 64),
    n(9, 1, 67),
    n(10, 1, 72),
    n(11, 1, 71),
    n(12, 2, 69),
    n(14, 2, 67),
    n(16, 1, 62),
    n(17, 1, 64),
    n(18, 1, 67),
    n(19, 0.5, 69),
    n(19.5, 0.5, 67),
    n(20, 1, 65),
    n(21, 1, 64),
    n(22, 2, 62),
    n(24, 0.5, 60),
    n(24.5, 0.5, 62),
    n(25, 0.5, 64),
    n(25.5, 0.5, 67),
    n(26, 1, 69),
    n(27, 1, 72),
    n(28, 2, 71),
    n(30, 2, 67),
  ];

  const chord = (start: number, midis: number[], duration = 4) => midis.map((m) => n(start, duration, m, 78));

  const piano: MidiNote[] = [
    ...chord(0, [60, 64, 67]),
    ...chord(4, [57, 60, 64]),
    ...chord(8, [53, 57, 60]),
    ...chord(12, [55, 59, 62]),
    ...chord(16, [60, 64, 67]),
    ...chord(20, [57, 60, 64]),
    ...chord(24, [50, 57, 62]),
    ...chord(28, [55, 59, 62]),
  ];

  const bass: MidiNote[] = [
    n(0, 2, 36, 100),
    n(2, 2, 43, 90),
    n(4, 2, 33, 100),
    n(6, 2, 40, 88),
    n(8, 2, 41, 100),
    n(10, 2, 36, 90),
    n(12, 2, 43, 100),
    n(14, 2, 38, 88),
    n(16, 2, 36, 100),
    n(18, 2, 43, 90),
    n(20, 2, 33, 100),
    n(22, 2, 40, 88),
    n(24, 2, 38, 100),
    n(26, 2, 45, 88),
    n(28, 2, 43, 104),
    n(30, 2, 43, 90),
  ];

  const kit: Track = {
    id: "kit",
    name: "Kit",
    kind: "drum",
    instrument: "piano",
    accent: "bone",
    volume: 0.82,
    pan: 0,
    mute: false,
    solo: false,
    send: 0.08,
    notes: [],
    rows,
    steps: stepsFromGroove(groove, rows),
    stepCount: groove.stepCount,
    clips: [],
  };

  const voice: Track = {
    id: "voice",
    name: "Voice",
    kind: "audio",
    instrument: "piano",
    accent: "steel",
    volume: 0.9,
    pan: 0,
    mute: false,
    solo: false,
    send: 0.16,
    notes: [],
    rows: [],
    steps: [],
    stepCount: 16,
    clips: [],
  };

  return {
    name: "Night window",
    bpm: 96,
    beatsPerBar: 4,
    bars: 8,
    keyRoot: "C",
    scale: "major",
    swing: groove.swing,
    master: 0.86,
    reverb: 0.28,
    metronome: false,
    loop: true,
    octave: 4,
    scaleLock: false,
    selectedTrackId: "melody",
    tracks: [
      midiTrack({
        id: "melody",
        name: "Melody",
        instrument: "flute",
        accent: "brass",
        volume: 0.78,
        notes: melody,
      }),
      midiTrack({
        id: "piano",
        name: "Piano",
        instrument: "piano",
        accent: "steel",
        volume: 0.52,
        notes: piano,
      }),
      midiTrack({
        id: "bass",
        name: "Bass",
        instrument: "bass",
        accent: "bone",
        volume: 0.7,
        notes: bass,
        send: 0.04,
      }),
      kit,
      voice,
    ],
  };
}

export function blankPiece(): Piece {
  const rows = defaultRows();
  const piece = demoPiece();
  return {
    ...piece,
    name: "New piece",
    tracks: [
      {
        ...piece.tracks[0],
        notes: [],
        instrument: "piano",
        name: "Keys",
      },
      {
        ...piece.tracks[3],
        rows,
        steps: rows.map(() => Array.from({ length: 16 }, () => 0)),
        stepCount: 16,
      },
      { ...piece.tracks[4], clips: [] },
    ],
    selectedTrackId: "melody",
    swing: 0,
  };
}
