import { useRef } from "react";
import { getPressed, noteOff, noteOn, subscribePressed } from "@/lib/studio/engine";
import { PRESET_GROUPS, PRESETS } from "@/lib/studio/presets";
import { selectedTrack, useStudio } from "@/lib/studio/store";
import { prefersFlats, rootPc, scalePcs, spellPitch } from "@/lib/studio/theory";
import { useSyncExternalStore } from "react";

const WHITE = [0, 2, 4, 5, 7, 9, 11];

export function Keyboard() {
  const octave = useStudio((s) => s.octave);
  const setOctave = useStudio((s) => s.setOctave);
  const scaleLock = useStudio((s) => s.scaleLock);
  const toggleScaleLock = useStudio((s) => s.toggleScaleLock);
  const keyRoot = useStudio((s) => s.keyRoot);
  const scale = useStudio((s) => s.scale);
  const track = useStudio(selectedTrack);
  const setInstrument = useStudio((s) => s.setInstrument);
  const pressed = useSyncExternalStore(subscribePressed, getPressed, getPressed);
  const board = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, number>());

  const start = (octave + 1) * 12;
  const midis: number[] = [];
  for (let m = start; m <= start + 24; m++) midis.push(m);
  const whites = midis.filter((m) => WHITE.includes(m % 12));
  const blacks = midis.filter((m) => !WHITE.includes(m % 12));
  const flats = prefersFlats(keyRoot, scale);
  const pcs = scalePcs(scale);
  const root = rootPc(keyRoot);
  const inScale = (midi: number) => pcs.includes(((midi % 12) - root + 12) % 12);

  const label = (midi: number) => {
    const s = spellPitch(midi, flats);
    return `${s.letter}${s.alt > 0 ? "#" : s.alt < 0 ? "b" : ""}`;
  };

  const hit = (clientX: number, clientY: number) => {
    const rootEl = board.current;
    if (!rootEl) return null;
    const nodes = [...rootEl.querySelectorAll<HTMLElement>("[data-midi]")];
    const black = nodes.filter((n) => n.dataset.black === "1");
    const white = nodes.filter((n) => n.dataset.black !== "1");
    for (const el of [...black, ...white]) {
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return Number(el.dataset.midi);
      }
    }
    return null;
  };

  const down = (pointerId: number, midi: number) => {
    const prev = pointers.current.get(pointerId);
    if (prev === midi) return;
    if (prev != null) noteOff(prev);
    pointers.current.set(pointerId, midi);
    void noteOn(midi);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-40 flex-1 items-center gap-2 text-sm text-muted">
          Instrument
          <select
            className="h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-fg"
            value={track?.kind === "midi" ? track.instrument : "piano"}
            onChange={(event) => track && track.kind === "midi" && setInstrument(track.id, event.target.value)}
            disabled={track?.kind !== "midi"}
          >
            {PRESET_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {PRESETS.filter((p) => p.group === group).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button type="button" className="min-h-11 rounded-md border border-line px-3 text-sm" onClick={() => setOctave(octave - 1)}>
          Oct −
        </button>
        <button type="button" className="min-h-11 rounded-md border border-line px-3 text-sm" onClick={() => setOctave(octave + 1)}>
          Oct +
        </button>
        <button
          type="button"
          className={`min-h-11 rounded-md border px-3 text-sm ${scaleLock ? "border-brass bg-brass text-bg" : "border-line text-fg"}`}
          onClick={toggleScaleLock}
          aria-pressed={scaleLock}
        >
          Scale lock
        </button>
      </div>
      <p className="text-sm text-muted">
        {track?.kind === "midi"
          ? "Play the keys. Computer row A–K, and Z / X to shift octave. Arm Record, then play along."
          : "Select a melody track to play this keyboard into the score."}
      </p>
      <div
        ref={board}
        className="relative min-h-36 flex-1 touch-none select-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const midi = hit(event.clientX, event.clientY);
          if (midi != null) down(event.pointerId, midi);
        }}
        onPointerMove={(event) => {
          if (!pointers.current.has(event.pointerId)) return;
          const midi = hit(event.clientX, event.clientY);
          if (midi != null) down(event.pointerId, midi);
        }}
        onPointerUp={(event) => {
          const midi = pointers.current.get(event.pointerId);
          if (midi != null) noteOff(midi);
          pointers.current.delete(event.pointerId);
        }}
        onPointerCancel={(event) => {
          const midi = pointers.current.get(event.pointerId);
          if (midi != null) noteOff(midi);
          pointers.current.delete(event.pointerId);
        }}
      >
        <div className="flex h-full gap-px">
          {whites.map((midi) => {
            const on = pressed.includes(midi);
            const name = label(midi);
            return (
              <button
                key={midi}
                type="button"
                data-midi={midi}
                className={`flex h-full flex-1 items-end justify-center rounded-sm pb-2 text-sm ${on ? "bg-brass text-bg" : "bg-fg text-bg"} ${inScale(midi) ? "" : "opacity-70"}`}
              >
                {name === "C" ? name + spellPitch(midi, flats).octave : name}
              </button>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-0">
          {blacks.map((midi) => {
            const whiteIndex = whites.findIndex((w) => w > midi) - 1;
            const on = pressed.includes(midi);
            return (
              <button
                key={midi}
                type="button"
                data-midi={midi}
                data-black="1"
                className={`pointer-events-auto absolute top-0 h-[58%] rounded-sm text-xs ${on ? "bg-brass text-bg" : "bg-bg text-steel"} ${inScale(midi) ? "border border-steel" : "border border-line opacity-80"}`}
                style={{
                  left: `${((whiteIndex + 1) / whites.length) * 100}%`,
                  width: `${(0.62 / whites.length) * 100}%`,
                  transform: "translateX(-50%)",
                }}
              >
                {label(midi)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
