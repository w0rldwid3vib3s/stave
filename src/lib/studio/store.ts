import { create } from "zustand";
import { blankPiece, demoPiece } from "@/lib/studio/demo";
import { defaultRows, GROOVES, resizeSteps, stepsFromGroove } from "@/lib/studio/patterns";
import type { AudioClip, DrumRow, MidiNote, Panel, Piece, Scale, Track } from "@/lib/studio/types";
import { quantizeBeat } from "@/lib/studio/theory";

export type Snap = Piece;

type StudioState = Piece & {
  recording: boolean;
  panel: Panel;
  selectedNoteId: string | null;
  selectedClipId: string | null;
  status: string | null;
  savedAt: number | null;
  past: Snap[];
  future: Snap[];
};

type Actions = {
  setStatus: (status: string | null) => void;
  markSaved: () => void;
  setName: (name: string) => void;
  setBpm: (bpm: number) => void;
  setKey: (root: string, scale: Scale) => void;
  setBars: (bars: number) => void;
  setBeatsPerBar: (beats: number) => void;
  setSwing: (swing: number) => void;
  setMaster: (master: number) => void;
  setReverb: (reverb: number) => void;
  toggleMetronome: () => void;
  toggleLoop: () => void;
  setLoop: (loop: boolean) => void;
  toggleRecording: () => void;
  setRecording: (recording: boolean) => void;
  setOctave: (octave: number) => void;
  toggleScaleLock: () => void;
  selectTrack: (id: string) => void;
  selectNote: (id: string | null) => void;
  selectClip: (id: string | null) => void;
  setPanel: (panel: Panel) => void;
  patchTrack: (id: string, patch: Partial<Track>) => void;
  setInstrument: (id: string, instrument: string) => void;
  addMidiTrack: () => void;
  addAudioTrack: () => void;
  removeTrack: (id: string) => void;
  addNote: (trackId: string, note: Omit<MidiNote, "id">) => string;
  removeNote: (trackId: string, noteId: string) => void;
  moveNote: (trackId: string, noteId: string, start: number) => void;
  resizeNote: (trackId: string, noteId: string, duration: number) => void;
  setStep: (trackId: string, row: number, step: number, velocity: number) => void;
  setStepCount: (trackId: string, count: number) => void;
  loadGroove: (trackId: string, grooveId: string) => void;
  addSampleRow: (trackId: string, name: string, sampleId: string) => void;
  clearSample: (trackId: string, rowId: string) => void;
  addClip: (trackId: string, clip: Omit<AudioClip, "id">) => string;
  patchClip: (trackId: string, clipId: string, patch: Partial<AudioClip>) => void;
  removeClip: (trackId: string, clipId: string) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  loadPiece: (piece: Piece) => void;
  loadDemo: () => void;
  newPiece: () => void;
};

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function snapshot(s: StudioState): Snap {
  return {
    name: s.name,
    bpm: s.bpm,
    beatsPerBar: s.beatsPerBar,
    bars: s.bars,
    keyRoot: s.keyRoot,
    scale: s.scale,
    swing: s.swing,
    master: s.master,
    reverb: s.reverb,
    metronome: s.metronome,
    loop: s.loop,
    octave: s.octave,
    scaleLock: s.scaleLock,
    tracks: structuredClone(s.tracks),
    selectedTrackId: s.selectedTrackId,
  };
}

function mapTrack(tracks: Track[], id: string, fn: (track: Track) => Track): Track[] {
  return tracks.map((track) => (track.id === id ? fn(track) : track));
}

const demo = demoPiece();

export const useStudio = create<StudioState & Actions>((set, get) => ({
  ...demo,
  recording: false,
  panel: "keys",
  selectedNoteId: null,
  selectedClipId: null,
  status: null,
  savedAt: null,
  past: [],
  future: [],

  setStatus: (status) => set({ status }),
  markSaved: () => set({ savedAt: Date.now() }),
  setName: (name) => set({ name }),
  setBpm: (bpm) => set({ bpm: Math.max(40, Math.min(220, Math.round(bpm))) }),
  setKey: (keyRoot, scale) => set({ keyRoot, scale }),
  setBars: (bars) => set({ bars: Math.max(1, Math.min(32, bars)) }),
  setBeatsPerBar: (beatsPerBar) => set({ beatsPerBar }),
  setSwing: (swing) => set({ swing: Math.max(0, Math.min(1, swing)) }),
  setMaster: (master) => set({ master }),
  setReverb: (reverb) => set({ reverb }),
  toggleMetronome: () => set((s) => ({ metronome: !s.metronome })),
  toggleLoop: () => set((s) => ({ loop: !s.loop })),
  setLoop: (loop) => set({ loop }),
  toggleRecording: () => set((s) => ({ recording: !s.recording })),
  setRecording: (recording) => set({ recording }),
  setOctave: (octave) => set({ octave: Math.max(1, Math.min(6, octave)) }),
  toggleScaleLock: () => set((s) => ({ scaleLock: !s.scaleLock })),
  selectTrack: (id) => {
    const track = get().tracks.find((t) => t.id === id);
    const panel: Panel = track?.kind === "drum" ? "drums" : track?.kind === "audio" ? "voice" : "keys";
    set({ selectedTrackId: id, selectedNoteId: null, selectedClipId: null, panel });
  },
  selectNote: (selectedNoteId) => set({ selectedNoteId, selectedClipId: null }),
  selectClip: (selectedClipId) => set({ selectedClipId, selectedNoteId: null }),
  setPanel: (panel) => set({ panel }),

  patchTrack: (id, patch) => set((s) => ({ tracks: mapTrack(s.tracks, id, (t) => ({ ...t, ...patch })) })),

  setInstrument: (id, instrument) => {
    get().pushHistory();
    set((s) => ({ tracks: mapTrack(s.tracks, id, (t) => ({ ...t, instrument })) }));
  },

  addMidiTrack: () => {
    get().pushHistory();
    const id = uid("trk");
    const track: Track = {
      id,
      name: "Line",
      kind: "midi",
      instrument: "piano",
      accent: "brass",
      volume: 0.75,
      pan: 0,
      mute: false,
      solo: false,
      send: 0.12,
      notes: [],
      rows: [],
      steps: [],
      stepCount: 16,
      clips: [],
    };
    set((s) => ({ tracks: [...s.tracks, track], selectedTrackId: id, panel: "keys" }));
  },

  addAudioTrack: () => {
    get().pushHistory();
    const id = uid("aud");
    const track: Track = {
      id,
      name: "Audio",
      kind: "audio",
      instrument: "piano",
      accent: "steel",
      volume: 0.85,
      pan: 0,
      mute: false,
      solo: false,
      send: 0.1,
      notes: [],
      rows: [],
      steps: [],
      stepCount: 16,
      clips: [],
    };
    set((s) => ({ tracks: [...s.tracks, track], selectedTrackId: id, panel: "voice" }));
  },

  removeTrack: (id) => {
    const tracks = get().tracks;
    if (tracks.length < 2) return;
    get().pushHistory();
    const next = tracks.filter((t) => t.id !== id);
    set({
      tracks: next,
      selectedTrackId: get().selectedTrackId === id ? next[0].id : get().selectedTrackId,
    });
  },

  addNote: (trackId, note) => {
    get().pushHistory();
    const id = uid("n");
    const full: MidiNote = {
      ...note,
      id,
      start: quantizeBeat(Math.max(0, note.start)),
      duration: Math.max(0.25, quantizeBeat(note.duration)),
    };
    set((s) => ({
      tracks: mapTrack(s.tracks, trackId, (t) => ({ ...t, notes: [...t.notes, full] })),
      selectedNoteId: id,
    }));
    return id;
  },

  removeNote: (trackId, noteId) => {
    get().pushHistory();
    set((s) => ({
      tracks: mapTrack(s.tracks, trackId, (t) => ({ ...t, notes: t.notes.filter((n) => n.id !== noteId) })),
      selectedNoteId: s.selectedNoteId === noteId ? null : s.selectedNoteId,
    }));
  },

  moveNote: (trackId, noteId, start) => {
    const total = get().bars * get().beatsPerBar;
    const next = Math.max(0, Math.min(total - 0.25, quantizeBeat(start)));
    set((s) => ({
      tracks: mapTrack(s.tracks, trackId, (t) => ({
        ...t,
        notes: t.notes.map((n) => (n.id === noteId ? { ...n, start: next } : n)),
      })),
    }));
  },

  resizeNote: (trackId, noteId, duration) => {
    const next = Math.max(0.25, quantizeBeat(duration));
    set((s) => ({
      tracks: mapTrack(s.tracks, trackId, (t) => ({
        ...t,
        notes: t.notes.map((n) => (n.id === noteId ? { ...n, duration: next } : n)),
      })),
    }));
  },

  setStep: (trackId, row, step, velocity) => {
    set((s) => ({
      tracks: mapTrack(s.tracks, trackId, (t) => {
        const steps = t.steps.map((r, i) => (i === row ? r.map((v, c) => (c === step ? velocity : v)) : r));
        return { ...t, steps };
      }),
    }));
  },

  setStepCount: (trackId, count) => {
    get().pushHistory();
    const stepCount = count === 32 ? 32 : 16;
    set((s) => ({
      tracks: mapTrack(s.tracks, trackId, (t) => ({
        ...t,
        stepCount,
        steps: resizeSteps(t.steps, stepCount),
      })),
    }));
  },

  loadGroove: (trackId, grooveId) => {
    const groove = GROOVES.find((g) => g.id === grooveId);
    if (!groove) return;
    get().pushHistory();
    set((s) => ({
      swing: groove.swing,
      tracks: mapTrack(s.tracks, trackId, (t) => ({
        ...t,
        stepCount: groove.stepCount,
        steps: stepsFromGroove(
          groove,
          t.rows.length ? t.rows : defaultRows(),
        ),
        rows: t.rows.length ? t.rows : defaultRows(),
      })),
    }));
  },

  addSampleRow: (trackId, name, sampleId) => {
    get().pushHistory();
    set((s) => ({
      tracks: mapTrack(s.tracks, trackId, (t) => {
        const row: DrumRow = { id: uid("row"), name, voice: "sample", sampleId };
        const steps = [...t.steps, Array.from({ length: t.stepCount }, () => 0)];
        return { ...t, rows: [...t.rows, row], steps };
      }),
    }));
  },

  clearSample: (trackId, rowId) => {
    set((s) => ({
      tracks: mapTrack(s.tracks, trackId, (t) => ({
        ...t,
        rows: t.rows.map((r) => (r.id === rowId ? { ...r, sampleId: null } : r)),
      })),
    }));
  },

  addClip: (trackId, clip) => {
    get().pushHistory();
    const id = uid("clip");
    const full: AudioClip = { ...clip, id };
    set((s) => ({
      tracks: mapTrack(s.tracks, trackId, (t) => ({ ...t, clips: [...t.clips, full] })),
      selectedClipId: id,
      selectedTrackId: trackId,
      panel: "voice",
    }));
    return id;
  },

  patchClip: (trackId, clipId, patch) => {
    set((s) => ({
      tracks: mapTrack(s.tracks, trackId, (t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
      })),
    }));
  },

  removeClip: (trackId, clipId) => {
    get().pushHistory();
    set((s) => ({
      tracks: mapTrack(s.tracks, trackId, (t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })),
      selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
    }));
  },

  pushHistory: () => {
    const snap = snapshot(get());
    set((s) => ({ past: [...s.past, snap].slice(-40), future: [] }));
  },

  undo: () => {
    const { past, future } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    const now = snapshot(get());
    set({
      ...prev,
      past: past.slice(0, -1),
      future: [...future, now].slice(-40),
    });
  },

  redo: () => {
    const { past, future } = get();
    const next = future[future.length - 1];
    if (!next) return;
    const now = snapshot(get());
    set({
      ...next,
      future: future.slice(0, -1),
      past: [...past, now].slice(-40),
    });
  },

  loadPiece: (piece) => {
    set({
      ...piece,
      recording: false,
      panel: piece.tracks.find((t) => t.id === piece.selectedTrackId)?.kind === "drum" ? "drums" : "keys",
      selectedNoteId: null,
      selectedClipId: null,
      status: null,
      past: [],
      future: [],
    });
  },

  loadDemo: () => get().loadPiece(demoPiece()),
  newPiece: () => get().loadPiece(blankPiece()),
}));

export function pieceOf(s: StudioState): Piece {
  return {
    name: s.name,
    bpm: s.bpm,
    beatsPerBar: s.beatsPerBar,
    bars: s.bars,
    keyRoot: s.keyRoot,
    scale: s.scale,
    swing: s.swing,
    master: s.master,
    reverb: s.reverb,
    metronome: s.metronome,
    loop: s.loop,
    octave: s.octave,
    scaleLock: s.scaleLock,
    tracks: s.tracks,
    selectedTrackId: s.selectedTrackId,
  };
}

export function selectedTrack(s: { tracks: Track[]; selectedTrackId: string }): Track | undefined {
  return s.tracks.find((t) => t.id === s.selectedTrackId) ?? s.tracks[0];
}
