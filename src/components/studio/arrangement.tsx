import { useEffect, useRef } from "react";
import { currentBeat, getDuration, getPeaks, seek } from "@/lib/studio/engine";
import { useStudio } from "@/lib/studio/store";
import type { Track } from "@/lib/studio/types";

const BEAT = 28;
const LABEL = 88;

const accentBar: Record<Track["accent"], string> = {
  brass: "bg-brass",
  steel: "bg-steel",
  bone: "bg-fg",
};

function Wave({ bufferId }: { bufferId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const data = getPeaks(bufferId);
    if (!canvas || !data) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    const g = canvas.getContext("2d");
    if (!g) return;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, width, height);
    g.strokeStyle = "#0b0b0c";
    g.lineWidth = 1;
    g.beginPath();
    data.forEach((peak, i) => {
      const x = (i / data.length) * width;
      const h = Math.max(1, peak * (height - 4));
      g.moveTo(x, (height - h) / 2);
      g.lineTo(x, (height + h) / 2);
    });
    g.stroke();
  }, [bufferId]);
  return <canvas ref={ref} className="h-full w-full" />;
}

export function Arrangement() {
  const tracks = useStudio((s) => s.tracks);
  const bars = useStudio((s) => s.bars);
  const beatsPerBar = useStudio((s) => s.beatsPerBar);
  const bpm = useStudio((s) => s.bpm);
  const selectedTrackId = useStudio((s) => s.selectedTrackId);
  const selectedNoteId = useStudio((s) => s.selectedNoteId);
  const selectedClipId = useStudio((s) => s.selectedClipId);
  const selectTrack = useStudio((s) => s.selectTrack);
  const selectNote = useStudio((s) => s.selectNote);
  const selectClip = useStudio((s) => s.selectClip);
  const moveNote = useStudio((s) => s.moveNote);
  const patchClip = useStudio((s) => s.patchClip);
  const pushHistory = useStudio((s) => s.pushHistory);
  const scroller = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const total = bars * beatsPerBar;
  const width = total * BEAT;

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const node = head.current;
      if (node) node.style.transform = `translateX(${currentBeat() * BEAT}px)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="no-print flex min-h-28 flex-1 flex-col bg-surface">
      <div className="flex items-center justify-between px-3 py-1">
        <p className="font-display text-base text-fg">Arrangement</p>
        <p className="text-sm text-muted">Tap a lane to seek. Drag notes and clips.</p>
      </div>
      <div ref={scroller} className="scroll-thin min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: width + LABEL }}>
          <div className="sticky top-0 z-20 flex h-6 bg-surface text-xs text-muted" style={{ width: width + LABEL }}>
            <div className="sticky left-0 w-22 shrink-0 bg-surface" style={{ width: LABEL }} />
            <div className="relative" style={{ width }}>
              {Array.from({ length: bars }, (_, i) => (
                <span key={i} className="absolute top-1 tabular-nums" style={{ left: i * beatsPerBar * BEAT + 4 }}>
                  {i + 1}
                </span>
              ))}
            </div>
          </div>
          {tracks.map((track) => (
            <div key={track.id} className="flex border-t border-line" style={{ width: width + LABEL }}>
              <button
                type="button"
                className={`sticky left-0 z-10 flex w-22 shrink-0 items-center gap-2 border-r border-line px-2 text-left ${selectedTrackId === track.id ? "bg-raised" : "bg-surface"}`}
                style={{ width: LABEL }}
                onClick={() => selectTrack(track.id)}
              >
                <span className={`h-6 w-1 rounded-sm ${accentBar[track.accent]}`} />
                <span className="truncate text-sm text-fg">{track.name}</span>
              </button>
              <div
                className="relative h-12"
                style={{ width }}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const beat = ((event.clientX - rect.left) / BEAT);
                  selectTrack(track.id);
                  seek(Math.max(0, Math.min(total, beat)));
                }}
              >
                {Array.from({ length: bars }, (_, i) => (
                  <span
                    key={i}
                    className={`absolute inset-y-0 ${i % 2 === 0 ? "bg-bg/40" : "bg-transparent"}`}
                    style={{ left: i * beatsPerBar * BEAT, width: beatsPerBar * BEAT }}
                  />
                ))}
                {track.kind === "midi" &&
                  track.notes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      className={`absolute top-2 h-8 rounded-sm ${accentBar[track.accent]} ${selectedNoteId === note.id ? "outline outline-2 outline-fg" : "opacity-90"}`}
                      style={{ left: note.start * BEAT, width: Math.max(8, note.duration * BEAT - 2) }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        selectTrack(track.id);
                        selectNote(note.id);
                        pushHistory();
                        const origin = event.clientX;
                        const start = note.start;
                        const move = (ev: PointerEvent) => {
                          moveNote(track.id, note.id, start + (ev.clientX - origin) / BEAT);
                        };
                        const up = () => {
                          window.removeEventListener("pointermove", move);
                          window.removeEventListener("pointerup", up);
                        };
                        window.addEventListener("pointermove", move);
                        window.addEventListener("pointerup", up);
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                  ))}
                {track.kind === "drum" &&
                  Array.from({ length: total * 4 }, (_, step) => {
                    const idx = step % track.stepCount;
                    const hits = track.steps.reduce((sum, row) => sum + ((row[idx] ?? 0) > 0 ? 1 : 0), 0);
                    if (!hits) return null;
                    return (
                      <span
                        key={step}
                        className={`absolute bottom-1 w-1 rounded-sm ${accentBar[track.accent]}`}
                        style={{ left: (step / 4) * BEAT, height: 6 + hits * 4 }}
                      />
                    );
                  })}
                {track.kind === "audio" &&
                  track.clips.map((clip) => {
                    const id = clip.tunedBufferId || clip.bufferId;
                    const beats = (getDuration(id) * bpm) / 60 || 4;
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        className={`absolute top-1.5 h-9 overflow-hidden rounded-sm bg-steel text-left ${selectedClipId === clip.id ? "outline outline-2 outline-brass" : ""}`}
                        style={{ left: clip.start * BEAT, width: Math.max(36, beats * BEAT) }}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          selectTrack(track.id);
                          selectClip(clip.id);
                          pushHistory();
                          const origin = event.clientX;
                          const start = clip.start;
                          const move = (ev: PointerEvent) => {
                            patchClip(track.id, clip.id, {
                              start: Math.max(0, Math.round((start + (ev.clientX - origin) / BEAT) * 4) / 4),
                            });
                          };
                          const up = () => {
                            window.removeEventListener("pointermove", move);
                            window.removeEventListener("pointerup", up);
                          };
                          window.addEventListener("pointermove", move);
                          window.addEventListener("pointerup", up);
                        }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Wave bufferId={id} />
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
          <div className="pointer-events-none absolute bottom-0 top-6" style={{ left: LABEL, width }}>
            <div ref={head} className="absolute top-0 h-full w-px bg-brass" />
          </div>
        </div>
      </div>
    </section>
  );
}
