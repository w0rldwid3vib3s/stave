import { useRef } from "react";
import { getFrame, previewDrum, subscribeFrame } from "@/lib/studio/engine";
import { GROOVES } from "@/lib/studio/patterns";
import { useStudio } from "@/lib/studio/store";
import { decodeFile } from "@/lib/studio/engine";
import { useSyncExternalStore } from "react";

export function Drums() {
  const tracks = useStudio((s) => s.tracks);
  const selectedId = useStudio((s) => s.selectedTrackId);
  const track = tracks.find((t) => t.id === selectedId && t.kind === "drum") ?? tracks.find((t) => t.kind === "drum");
  const swing = useStudio((s) => s.swing);
  const setSwing = useStudio((s) => s.setSwing);
  const setStep = useStudio((s) => s.setStep);
  const setStepCount = useStudio((s) => s.setStepCount);
  const loadGroove = useStudio((s) => s.loadGroove);
  const addSampleRow = useStudio((s) => s.addSampleRow);
  const pushHistory = useStudio((s) => s.pushHistory);
  const setStatus = useStudio((s) => s.setStatus);
  const frame = useSyncExternalStore(subscribeFrame, getFrame, getFrame);
  const painting = useRef<{ row: number; vel: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!track) {
    return <p className="p-4 text-sm text-muted">Add a drum track to program a kit.</p>;
  }

  const stepCount = track.stepCount;
  const playStep = frame.playing ? Math.floor(frame.beat * 4 + 1e-4) % stepCount : -1;

  const paint = (row: number, step: number, vel: number) => {
    setStep(track.id, row, step, vel);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          Groove
          <select
            className="h-11 rounded-md border border-line bg-surface px-2 text-fg"
            defaultValue="backbeat"
            onChange={(event) => loadGroove(track.id, event.target.value)}
          >
            {GROOVES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`min-h-11 rounded-md border px-3 text-sm ${stepCount === 16 ? "border-brass text-brass" : "border-line"}`}
          onClick={() => setStepCount(track.id, 16)}
        >
          1 bar
        </button>
        <button
          type="button"
          className={`min-h-11 rounded-md border px-3 text-sm ${stepCount === 32 ? "border-brass text-brass" : "border-line"}`}
          onClick={() => setStepCount(track.id, 32)}
        >
          2 bars
        </button>
        <label className="flex min-w-36 flex-1 items-center gap-2 text-sm text-muted">
          Swing
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(swing * 100)}
            onChange={(event) => setSwing(Number(event.target.value) / 100)}
            aria-label="Swing"
          />
        </label>
        <button type="button" className="min-h-11 rounded-md border border-line px-3 text-sm" onClick={() => fileRef.current?.click()}>
          Add sample
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.wav,.mp3,.ogg,.m4a"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void decodeFile(file)
              .then((decoded) => addSampleRow(track.id, decoded.name, decoded.id))
              .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Could not load sample"));
          }}
        />
      </div>
      <p className="text-sm text-muted">Tap a cell to toggle it. Drag to paint. Tap a pad name to hear it.</p>
      <div
        className="scroll-thin min-h-0 flex-1 overflow-auto"
        onPointerUp={() => {
          painting.current = null;
        }}
        onPointerLeave={() => {
          painting.current = null;
        }}
      >
        <div className="grid gap-1" style={{ gridTemplateColumns: `7.5rem repeat(${stepCount}, minmax(2.25rem, 1fr))` }}>
          <span />
          {Array.from({ length: stepCount }, (_, step) => (
            <span key={step} className={`text-center text-xs tabular-nums ${step % 4 === 0 ? "text-steel" : "text-muted"}`}>
              {step % 4 === 0 ? step / 4 + 1 : "·"}
            </span>
          ))}
          {track.rows.map((row, r) => (
            <div key={row.id} className="contents">
              <button
                type="button"
                className="sticky left-0 z-10 min-h-11 truncate bg-surface pr-2 text-left text-sm text-fg"
                onClick={() => void previewDrum(r, false)}
              >
                {row.name}
              </button>
              {Array.from({ length: stepCount }, (_, step) => {
                const on = (track.steps[r]?.[step] ?? 0) > 0;
                const current = step === playStep;
                return (
                  <button
                    key={step}
                    type="button"
                    aria-label={`${row.name} step ${step + 1}`}
                    aria-pressed={on}
                    className={`min-h-11 rounded-sm border ${on ? "border-brass bg-brass" : "border-line bg-raised"} ${current ? "outline outline-1 outline-steel" : ""} ${step % 4 === 0 ? "border-l-steel/40" : ""}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      pushHistory();
                      const vel = on ? 0 : 108;
                      painting.current = { row: r, vel };
                      paint(r, step, vel);
                      void previewDrum(r, false);
                    }}
                    onPointerEnter={() => {
                      if (!painting.current || painting.current.row !== r) return;
                      paint(r, step, painting.current.vel);
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
