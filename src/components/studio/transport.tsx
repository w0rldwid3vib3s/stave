import { useEffect, useRef, type ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { getBusy, getFrame, pause, play, renderMix, seek, startMeter, stop, subscribeBusy, subscribeFrame, togglePlay } from "@/lib/studio/engine";
import { useStudio } from "@/lib/studio/store";
import { KEYS } from "@/lib/studio/theory";
import { downloadBlob } from "@/lib/studio/wav";

function IconButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center rounded-md border px-3 text-sm disabled:opacity-40 ${pressed ? "border-brass bg-brass text-bg" : "border-line bg-surface text-fg"}`}
    >
      {children}
    </button>
  );
}

export function Transport() {
  const name = useStudio((s) => s.name);
  const setName = useStudio((s) => s.setName);
  const bpm = useStudio((s) => s.bpm);
  const setBpm = useStudio((s) => s.setBpm);
  const keyRoot = useStudio((s) => s.keyRoot);
  const scale = useStudio((s) => s.scale);
  const setKey = useStudio((s) => s.setKey);
  const beatsPerBar = useStudio((s) => s.beatsPerBar);
  const setBeatsPerBar = useStudio((s) => s.setBeatsPerBar);
  const bars = useStudio((s) => s.bars);
  const setBars = useStudio((s) => s.setBars);
  const loop = useStudio((s) => s.loop);
  const toggleLoop = useStudio((s) => s.toggleLoop);
  const metronome = useStudio((s) => s.metronome);
  const toggleMetronome = useStudio((s) => s.toggleMetronome);
  const recording = useStudio((s) => s.recording);
  const toggleRecording = useStudio((s) => s.toggleRecording);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const past = useStudio((s) => s.past.length);
  const future = useStudio((s) => s.future.length);
  const savedAt = useStudio((s) => s.savedAt);
  const status = useStudio((s) => s.status);
  const loadDemo = useStudio((s) => s.loadDemo);
  const newPiece = useStudio((s) => s.newPiece);
  const setStatus = useStudio((s) => s.setStatus);
  const frame = useSyncExternalStore(subscribeFrame, getFrame, getFrame);
  const busy = useSyncExternalStore(subscribeBusy, getBusy, getBusy);
  const meter = useRef<HTMLDivElement>(null);

  useEffect(() => startMeter((level) => {
    if (meter.current) meter.current.style.transform = `scaleX(${level})`;
  }), []);

  const bar = Math.floor(frame.beat / beatsPerBar) + 1;
  const beat = Math.floor(frame.beat % beatsPerBar) + 1;
  const keyId = KEYS.find((k) => k.root === keyRoot && k.scale === scale)?.id ?? "C";

  return (
    <header className="no-print shrink-0 border-b border-line bg-bg">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <p className="font-display text-2xl leading-none tracking-tight text-fg">Stave</p>
        <input
          value={name}
          aria-label="Piece name"
          onChange={(event) => setName(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-fg sm:max-w-64"
        />
        <p className="text-sm text-steel tabular-nums">
          Bar {bar} · {beat}
        </p>
        <p className="text-sm text-muted">{savedAt ? "Saved on this device" : "Demo piece"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
        <IconButton label={frame.playing ? "Pause" : "Play"} pressed={frame.playing} onClick={() => void togglePlay()}>
          {frame.playing ? "Pause" : "Play"}
        </IconButton>
        <IconButton label="Stop" onClick={() => stop()}>
          Stop
        </IconButton>
        <IconButton
          label="Record"
          pressed={recording}
          onClick={() => {
            if (!frame.playing) void play();
            toggleRecording();
          }}
        >
          Rec
        </IconButton>
        <IconButton label="Loop" pressed={loop} onClick={toggleLoop}>
          Loop
        </IconButton>
        <IconButton label="Metronome" pressed={metronome} onClick={toggleMetronome}>
          Click
        </IconButton>
        <label className="flex items-center gap-2 text-sm text-muted">
          BPM
          <input
            type="number"
            min={40}
            max={220}
            value={bpm}
            aria-label="Tempo"
            onChange={(event) => setBpm(Number(event.target.value))}
            className="h-11 w-20 rounded-md border border-line bg-surface px-2 text-fg tabular-nums"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          Key
          <select
            aria-label="Key"
            className="h-11 rounded-md border border-line bg-surface px-2 text-fg"
            value={keyId}
            onChange={(event) => {
              const next = KEYS.find((k) => k.id === event.target.value);
              if (next) setKey(next.root, next.scale);
            }}
          >
            {KEYS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          Meter
          <select
            aria-label="Time signature"
            className="h-11 rounded-md border border-line bg-surface px-2 text-fg"
            value={beatsPerBar}
            onChange={(event) => setBeatsPerBar(Number(event.target.value))}
          >
            <option value={4}>4/4</option>
            <option value={3}>3/4</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          Bars
          <select
            aria-label="Song length"
            className="h-11 rounded-md border border-line bg-surface px-2 text-fg"
            value={bars}
            onChange={(event) => setBars(Number(event.target.value))}
          >
            {[4, 8, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <IconButton label="Undo" disabled={past === 0} onClick={undo}>
          Undo
        </IconButton>
        <IconButton label="Redo" disabled={future === 0} onClick={redo}>
          Redo
        </IconButton>
        <button
          type="button"
          className="min-h-11 rounded-md border border-brass px-3 text-sm text-brass disabled:opacity-40"
          disabled={!!busy}
          onClick={() => {
            void renderMix()
              .then((blob) => downloadBlob(blob, `${name.replace(/[^\w\- ]+/g, "").trim() || "stave"}.wav`))
              .catch(() => setStatus("Could not render the mix."));
          }}
        >
          {busy ?? "Export mix"}
        </button>
        <button type="button" className="min-h-11 rounded-md border border-line px-3 text-sm" onClick={() => window.print()}>
          Print score
        </button>
        <button type="button" className="min-h-11 rounded-md border border-line px-3 text-sm" onClick={loadDemo}>
          Demo
        </button>
        <button
          type="button"
          className="min-h-11 rounded-md border border-line px-3 text-sm"
          onClick={() => {
            pause();
            seek(0);
            stop();
            newPiece();
          }}
        >
          New
        </button>
        <div className="h-2 w-24 overflow-hidden rounded-sm bg-raised" aria-hidden>
          <div ref={meter} className="h-full origin-left bg-brass" style={{ transform: "scaleX(0)" }} />
        </div>
      </div>
      {status && (
        <p className="px-3 pb-3 text-sm text-steel" role="status">
          {status}
        </p>
      )}
    </header>
  );
}
