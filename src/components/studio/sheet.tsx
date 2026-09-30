import { useEffect, useRef } from "react";
import { currentBeat, isPlaying } from "@/lib/studio/engine";
import { presetById } from "@/lib/studio/presets";
import { selectedTrack, useStudio } from "@/lib/studio/store";
import type { MidiNote } from "@/lib/studio/types";
import {
  accidentalFor,
  durationName,
  keySignature,
  noteName,
  prefersFlats,
  signatureSteps,
  staffSteps,
} from "@/lib/studio/theory";

const BEAT = 52;
const LINE = 11;
const STEP = LINE / 2;

function Accidental({ x, y, alt }: { x: number; y: number; alt: number }) {
  if (alt > 0) {
    return (
      <g transform={`translate(${x} ${y})`} stroke="currentColor" fill="none">
        <line x1="-3.2" y1="-8" x2="-3.2" y2="8" strokeWidth="1.1" />
        <line x1="2.2" y1="-6.4" x2="2.2" y2="9.4" strokeWidth="1.1" />
        <line x1="-6" y1="-1.6" x2="5" y2="-4.6" strokeWidth="2" />
        <line x1="-6" y1="3.2" x2="5" y2="0.2" strokeWidth="2" />
      </g>
    );
  }
  if (alt < 0) {
    return (
      <g transform={`translate(${x} ${y})`} fill="currentColor" stroke="currentColor">
        <line x1="0" y1="-11" x2="0" y2="5" strokeWidth="1.5" />
        <ellipse cx="2.4" cy="5.2" rx="3.3" ry="2.5" stroke="none" />
      </g>
    );
  }
  return (
    <g transform={`translate(${x} ${y})`} stroke="currentColor" fill="none" strokeWidth="1.3">
      <line x1="-3" y1="-8" x2="-3" y2="7" />
      <line x1="3" y1="-7" x2="3" y2="8" />
      <line x1="-3" y1="-1.5" x2="3" y2="-4.5" />
      <line x1="-3" y1="4" x2="3" y2="1" />
    </g>
  );
}

function Clef({ kind, x, mid }: { kind: "treble" | "bass"; x: number; mid: number }) {
  if (kind === "bass") {
    return (
      <g transform={`translate(${x} ${mid - 18})`} fill="currentColor" stroke="currentColor">
        <path
          d="M18 4c-8 3-14 10-14 18 0 8 5 14 12 17"
          fill="none"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="22" cy="14" r="2.1" stroke="none" />
        <circle cx="22" cy="23" r="2.1" stroke="none" />
      </g>
    );
  }
  return (
    <text x={x - 2} y={mid + 18} className="fill-current font-music" fontSize="46">
      𝄞
    </text>
  );
}

function noteStyle(duration: number) {
  if (duration >= 3.5) return { open: true, stem: false, flags: 0, dots: 0 };
  if (duration >= 2.5) return { open: true, stem: true, flags: 0, dots: 1 };
  if (duration >= 1.75) return { open: true, stem: true, flags: 0, dots: 0 };
  if (duration >= 1.25) return { open: false, stem: true, flags: 0, dots: 1 };
  if (duration >= 0.9) return { open: false, stem: true, flags: 0, dots: 0 };
  if (duration >= 0.7) return { open: false, stem: true, flags: 1, dots: 1 };
  if (duration >= 0.4) return { open: false, stem: true, flags: 1, dots: 0 };
  return { open: false, stem: true, flags: 2, dots: 0 };
}

function StaffNotes({
  notes,
  clef,
  left,
  bottomY,
  flats,
  root,
  scale,
  selectedId,
  onSelect,
}: {
  notes: MidiNote[];
  clef: "treble" | "bass";
  left: number;
  bottomY: number;
  flats: boolean;
  root: string;
  scale: "major" | "minor";
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const base = staffSteps(clef === "treble" ? 64 : 43, flats);
  const placed = notes.map((note) => {
    const delta = staffSteps(note.midi, flats) - base;
    return { note, delta, y: bottomY - delta * STEP, x: left + note.start * BEAT };
  });

  const ledgers: { x: number; y: number }[] = [];
  for (const item of placed) {
    const reach = item.delta < 0 ? item.delta : item.delta > 8 ? item.delta : null;
    if (reach == null) continue;
    const from = item.delta < 0 ? -2 : 10;
    const dir = item.delta < 0 ? -2 : 2;
    for (let s = from; item.delta < 0 ? s >= item.delta : s <= item.delta; s += dir) {
      if (s % 2 !== 0) continue;
      ledgers.push({ x: item.x, y: bottomY - s * STEP });
    }
  }

  return (
    <g>
      {ledgers.map((led, i) => (
        <line
          key={`l${i}`}
          x1={led.x - 11}
          x2={led.x + 11}
          y1={led.y}
          y2={led.y}
          stroke="currentColor"
          strokeWidth="1"
        />
      ))}
      {placed.map(({ note, delta, x, y }) => {
        const style = noteStyle(note.duration);
        const up = delta < 4;
        const alt = accidentalFor(note.midi, root, scale);
        const selected = note.id === selectedId;
        const stemX = up ? x + 5.4 : x - 5.4;
        const stemY = up ? y - 30 : y + 30;
        return (
          <g
            key={note.id}
            className={selected ? "text-brass" : "text-fg"}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(note.id);
            }}
            role="button"
            tabIndex={0}
          >
            {alt != null && <Accidental x={x - 16} y={y} alt={alt} />}
            <ellipse
              cx={x}
              cy={y}
              rx="6.4"
              ry="4.5"
              transform={`rotate(-20 ${x} ${y})`}
              fill={style.open ? "none" : "currentColor"}
              stroke="currentColor"
              strokeWidth="1.5"
            />
            {style.stem && <line x1={stemX} y1={y} x2={stemX} y2={stemY} stroke="currentColor" strokeWidth="1.3" />}
            {Array.from({ length: style.flags }, (_, i) => {
              const fy = up ? stemY + i * 7 : stemY - i * 7;
              const dir = up ? 1 : -1;
              return (
                <path
                  key={i}
                  d={`M ${stemX} ${fy} q 9 ${dir * 4} 8 ${dir * 12}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
              );
            })}
            {style.dots > 0 && <circle cx={x + 12} cy={y - 3} r="1.7" fill="currentColor" />}
          </g>
        );
      })}
    </g>
  );
}

export function Sheet() {
  const bars = useStudio((s) => s.bars);
  const beatsPerBar = useStudio((s) => s.beatsPerBar);
  const keyRoot = useStudio((s) => s.keyRoot);
  const scale = useStudio((s) => s.scale);
  const track = useStudio(selectedTrack);
  const selectedNoteId = useStudio((s) => s.selectedNoteId);
  const selectNote = useStudio((s) => s.selectNote);
  const removeNote = useStudio((s) => s.removeNote);
  const moveNote = useStudio((s) => s.moveNote);
  const resizeNote = useStudio((s) => s.resizeNote);
  const pushHistory = useStudio((s) => s.pushHistory);
  const scroller = useRef<HTMLDivElement>(null);
  const playhead = useRef<SVGLineElement>(null);

  const clef = track?.kind === "midi" ? presetById(track.instrument).clef : "treble";
  const grand = clef === "grand";
  const flats = prefersFlats(keyRoot, scale);
  const sig = keySignature(keyRoot, scale);
  const sigW = sig.count * 12;
  const left = 86 + sigW;
  const total = bars * beatsPerBar;
  const width = left + total * BEAT + 28;
  const trebleBottom = grand ? 78 : 86;
  const bassBottom = trebleBottom + 78;
  const height = grand ? bassBottom + 36 : trebleBottom + 36;
  const selected = track?.notes.find((n) => n.id === selectedNoteId) ?? null;

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const node = playhead.current;
      if (node) {
        const x = String(left + currentBeat() * BEAT);
        node.setAttribute("x1", x);
        node.setAttribute("x2", x);
      }
      const box = scroller.current;
      if (box && isPlaying()) {
        const x = left + currentBeat() * BEAT;
        if (x < box.scrollLeft + 48 || x > box.scrollLeft + box.clientWidth - 64) {
          box.scrollLeft = Math.max(0, x - box.clientWidth * 0.35);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [left]);

  const drawStaff = (bottom: number) =>
    [0, 1, 2, 3, 4].map((line) => {
      const y = bottom - line * LINE;
      return <line key={`${bottom}-${line}`} x1={8} x2={width - 12} y1={y} y2={y} stroke="currentColor" strokeWidth="1" />;
    });

  const drawSig = (kind: "treble" | "bass", bottom: number) => {
    const steps = signatureSteps(kind, sig.alt).slice(0, sig.count);
    return steps.map((step, i) => (
      <Accidental key={`${kind}${i}`} x={48 + i * 12} y={bottom - step * STEP} alt={sig.alt} />
    ));
  };

  const notesFor = (kind: "treble" | "bass") => {
    if (!track || track.kind !== "midi") return [];
    if (!grand) return track.notes;
    return track.notes.filter((n) => (kind === "treble" ? n.midi >= 60 : n.midi < 60));
  };

  return (
    <section className={`print-sheet flex shrink-0 flex-col border-b border-line bg-bg ${grand ? "h-56" : "h-40"} lg:h-52`}>
      <div className="no-print flex items-center gap-2 px-3 pt-2">
        <p className="font-display text-base text-fg">Score</p>
        <p className="truncate text-sm text-muted">{track ? track.name : "No part"}</p>
        <div className="ml-auto flex items-center gap-1">
          {selected && track && (
            <>
              <span className="px-2 text-sm text-steel tabular-nums">
                {noteName(selected.midi, flats)} · {durationName(selected.duration)}
              </span>
              <button
                type="button"
                className="min-h-11 rounded-md border border-line px-3 text-sm"
                onClick={() => {
                  pushHistory();
                  moveNote(track.id, selected.id, selected.start - 0.25);
                }}
              >
                Earlier
              </button>
              <button
                type="button"
                className="min-h-11 rounded-md border border-line px-3 text-sm"
                onClick={() => {
                  pushHistory();
                  moveNote(track.id, selected.id, selected.start + 0.25);
                }}
              >
                Later
              </button>
              <button
                type="button"
                className="min-h-11 rounded-md border border-line px-3 text-sm"
                onClick={() => {
                  pushHistory();
                  resizeNote(track.id, selected.id, selected.duration - 0.25);
                }}
              >
                Shorter
              </button>
              <button
                type="button"
                className="min-h-11 rounded-md border border-line px-3 text-sm"
                onClick={() => {
                  pushHistory();
                  resizeNote(track.id, selected.id, selected.duration + 0.25);
                }}
              >
                Longer
              </button>
              <button
                type="button"
                className="min-h-11 rounded-md border border-brass px-3 text-sm text-brass"
                onClick={() => removeNote(track.id, selected.id)}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      <div ref={scroller} className="scroll-thin min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <svg
          width={width}
          height={height}
          className="text-steel"
          role="img"
          aria-label="Sheet music for the selected part"
          onClick={() => selectNote(null)}
        >
          {drawStaff(trebleBottom)}
          {grand && drawStaff(bassBottom)}
          {Array.from({ length: bars + 1 }, (_, i) => {
            const x = left + i * beatsPerBar * BEAT;
            const y1 = trebleBottom - 4 * LINE;
            const y2 = grand ? bassBottom : trebleBottom;
            return <line key={`b${i}`} x1={x} x2={x} y1={y1} y2={y2} stroke="currentColor" strokeWidth={i % 4 === 0 ? 1.4 : 1} />;
          })}
          <Clef kind="treble" x={6} mid={trebleBottom - 2 * LINE} />
          {grand && <Clef kind="bass" x={4} mid={bassBottom - 2 * LINE} />}
          <g className="text-fg">
            {grand ? (
              <>
                {drawSig("treble", trebleBottom)}
                {drawSig("bass", bassBottom)}
              </>
            ) : (
              drawSig(clef === "bass" ? "bass" : "treble", trebleBottom)
            )}
          </g>
          <g className="fill-fg font-display" fontSize="18">
            <text x={left - 18} y={trebleBottom - 3 * LINE}>
              {beatsPerBar}
            </text>
            <text x={left - 18} y={trebleBottom - LINE}>
              4
            </text>
          </g>
          {Array.from({ length: bars }, (_, i) => (
            <text key={`n${i}`} x={left + i * beatsPerBar * BEAT + 4} y={16} className="fill-muted" fontSize="11">
              {i + 1}
            </text>
          ))}
          {track?.kind === "midi" && (
            <>
              <StaffNotes
                notes={notesFor(grand || clef !== "bass" ? "treble" : "bass")}
                clef={grand || clef !== "bass" ? "treble" : "bass"}
                left={left}
                bottomY={trebleBottom}
                flats={flats}
                root={keyRoot}
                scale={scale}
                selectedId={selectedNoteId}
                onSelect={selectNote}
              />
              {grand && (
                <StaffNotes
                  notes={notesFor("bass")}
                  clef="bass"
                  left={left}
                  bottomY={bassBottom}
                  flats={flats}
                  root={keyRoot}
                  scale={scale}
                  selectedId={selectedNoteId}
                  onSelect={selectNote}
                />
              )}
            </>
          )}
          {track?.kind !== "midi" && (
            <text x={left} y={grand ? 120 : 78} className="fill-muted" fontSize="14">
              {track?.kind === "drum"
                ? "Drum grid is the kit score. Switch to a melody part to see pitched notation."
                : "Audio sits on the arrangement. Tune vocals in the Voice panel."}
            </text>
          )}
          <line ref={playhead} y1={8} y2={height - 8} stroke="currentColor" className="text-brass" strokeWidth="1.5" />
        </svg>
      </div>
    </section>
  );
}
