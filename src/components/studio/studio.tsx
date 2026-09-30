import { useEffect } from "react";
import { Arrangement } from "@/components/studio/arrangement";
import { Drums } from "@/components/studio/drums";
import { Keyboard } from "@/components/studio/keyboard";
import { Mixer } from "@/components/studio/mixer";
import { Sheet } from "@/components/studio/sheet";
import { Transport } from "@/components/studio/transport";
import { Voice } from "@/components/studio/voice";
import {
  attach,
  bufferIds,
  collectBuffers,
  decodeFile,
  holdPcm,
  noteOff,
  noteOn,
  previewDrum,
  releaseAll,
  togglePlay,
} from "@/lib/studio/engine";
import { loadPiece, savePiece } from "@/lib/studio/idb";
import { pieceOf, selectedTrack, useStudio } from "@/lib/studio/store";

const WHITE_KEYS: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ";": 16,
  "'": 17,
};

function typingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function Studio() {
  const panel = useStudio((s) => s.panel);
  const setPanel = useStudio((s) => s.setPanel);
  const setStatus = useStudio((s) => s.setStatus);

  useEffect(() => {
    attach();
    let ready = false;
    let touched = false;
    let timer = 0;
    const persist = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!ready) return;
        const piece = pieceOf(useStudio.getState());
        void savePiece({ piece, buffers: collectBuffers(bufferIds(piece)) })
          .then(() => useStudio.getState().markSaved())
          .catch(() => useStudio.getState().setStatus("Too large to save here. Export a mix to keep it."));
      }, 500);
    };
    void loadPiece()
      .then((saved) => {
        if (saved?.piece?.tracks?.length && !touched) {
          for (const [id, buf] of Object.entries(saved.buffers ?? {})) {
            holdPcm(
              id,
              buf.sampleRate,
              buf.channels.map((channel) => new Float32Array(channel)),
            );
          }
          useStudio.getState().loadPiece(saved.piece);
          useStudio.getState().markSaved();
        }
      })
      .catch(() => {
        /* keep the demo piece */
      })
      .finally(() => {
        ready = true;
        if (touched) persist();
      });
    const unsub = useStudio.subscribe(() => {
      if (!ready) {
        touched = true;
        return;
      }
      persist();
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const down = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (typingTarget(event.target)) return;
      if (event.code === "Space") {
        event.preventDefault();
        void togglePlay();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) useStudio.getState().redo();
        else useStudio.getState().undo();
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && useStudio.getState().selectedNoteId) {
        const state = useStudio.getState();
        const track = selectedTrack(state);
        if (track && state.selectedNoteId) {
          event.preventDefault();
          state.removeNote(track.id, state.selectedNoteId);
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const state = useStudio.getState();
      const track = selectedTrack(state);
      if (!track) return;
      if (event.key === "z" || event.key === "Z") {
        state.setOctave(state.octave - 1);
        return;
      }
      if (event.key === "x" || event.key === "X") {
        state.setOctave(state.octave + 1);
        return;
      }
      if (track.kind === "drum") {
        const row = "asdfghjkl;".indexOf(event.key);
        if (row >= 0 && row < track.rows.length) {
          event.preventDefault();
          void previewDrum(row, true);
        }
        return;
      }
      if (track.kind !== "midi") return;
      const offset = WHITE_KEYS[event.key];
      if (offset == null) return;
      event.preventDefault();
      down.add(event.key);
      void noteOn((state.octave + 1) * 12 + offset);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!down.has(event.key)) return;
      down.delete(event.key);
      const state = useStudio.getState();
      const offset = WHITE_KEYS[event.key];
      if (offset == null) return;
      noteOff((state.octave + 1) * 12 + offset);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseAll);
    };
  }, []);

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("audio/") || /\.(wav|mp3|ogg|m4a|flac)$/i.test(item.name));
    if (!file) return;
    void decodeFile(file)
      .then((decoded) => {
        const state = useStudio.getState();
        const audio = state.tracks.find((t) => t.kind === "audio");
        const id = audio?.id;
        if (!id) {
          state.addAudioTrack();
        }
        const trackId = id ?? useStudio.getState().selectedTrackId;
        state.addClip(trackId, {
          name: decoded.name,
          bufferId: decoded.id,
          start: 0,
          gain: 0.9,
          transpose: 0,
          tune: 0,
          tunedBufferId: null,
        });
        setStatus(`“${decoded.name}” is in the mix.`);
      })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Could not import."));
  };

  return (
    <main
      className="flex h-dvh min-h-0 flex-col overflow-hidden bg-bg text-fg"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <Transport />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Sheet />
          <Arrangement />
          <section className="no-print flex h-[46dvh] min-h-64 shrink-0 flex-col border-t border-line lg:h-80">
            <div className="flex gap-1 overflow-x-auto border-b border-line px-2 py-1" role="tablist">
              {(
                [
                  ["keys", "Keys"],
                  ["drums", "Drums"],
                  ["voice", "Voice"],
                  ["mix", "Mix"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={panel === id}
                  className={`min-h-11 rounded-md px-3 text-sm ${panel === id ? "bg-brass text-bg" : "text-muted"} ${id === "mix" ? "lg:hidden" : ""}`}
                  onClick={() => setPanel(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {panel === "keys" && <Keyboard />}
              {panel === "drums" && <Drums />}
              {panel === "voice" && <Voice />}
              {panel === "mix" && (
                <div className="h-full lg:hidden">
                  <Mixer embedded />
                </div>
              )}
              {panel === "mix" && (
                <div className="hidden h-full lg:block">
                  <Keyboard />
                </div>
              )}
            </div>
          </section>
        </div>
        <div className="no-print hidden w-80 shrink-0 border-l border-line lg:block">
          <Mixer />
        </div>
      </div>
    </main>
  );
}
