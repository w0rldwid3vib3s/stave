import { PRESET_GROUPS, PRESETS } from "@/lib/studio/presets";
import { useStudio } from "@/lib/studio/store";

export function Mixer({ embedded = false }: { embedded?: boolean }) {
  const tracks = useStudio((s) => s.tracks);
  const master = useStudio((s) => s.master);
  const reverb = useStudio((s) => s.reverb);
  const setMaster = useStudio((s) => s.setMaster);
  const setReverb = useStudio((s) => s.setReverb);
  const patchTrack = useStudio((s) => s.patchTrack);
  const setInstrument = useStudio((s) => s.setInstrument);
  const selectTrack = useStudio((s) => s.selectTrack);
  const selected = useStudio((s) => s.selectedTrackId);
  const removeTrack = useStudio((s) => s.removeTrack);
  const addMidiTrack = useStudio((s) => s.addMidiTrack);
  const addAudioTrack = useStudio((s) => s.addAudioTrack);

  return (
    <aside className={`no-print flex h-full min-h-0 flex-col gap-3 overflow-auto bg-surface p-3 ${embedded ? "" : "w-full"}`}>
      <div className="flex items-center justify-between">
        <p className="font-display text-base text-fg">Mix</p>
        <div className="flex gap-1">
          <button type="button" className="min-h-11 rounded-md border border-line px-2 text-sm" onClick={addMidiTrack}>
            + Part
          </button>
          <button type="button" className="min-h-11 rounded-md border border-line px-2 text-sm" onClick={addAudioTrack}>
            + Audio
          </button>
        </div>
      </div>
      <label className="flex items-center gap-3 text-sm text-muted">
        <span className="w-16">Master</span>
        <input type="range" min={0} max={100} value={Math.round(master * 100)} aria-label="Master level" onChange={(e) => setMaster(Number(e.target.value) / 100)} />
      </label>
      <label className="flex items-center gap-3 text-sm text-muted">
        <span className="w-16">Space</span>
        <input type="range" min={0} max={100} value={Math.round(reverb * 100)} aria-label="Reverb" onChange={(e) => setReverb(Number(e.target.value) / 100)} />
      </label>
      <ul className="flex flex-col gap-3">
        {tracks.map((track) => (
          <li key={track.id} className={`rounded-md border p-2 ${selected === track.id ? "border-brass" : "border-line"}`}>
            <div className="mb-2 flex items-center gap-2">
              <input
                value={track.name}
                aria-label={`${track.name} name`}
                className="h-11 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 text-sm text-fg"
                onFocus={() => selectTrack(track.id)}
                onChange={(event) => patchTrack(track.id, { name: event.target.value })}
              />
              <button type="button" className="min-h-11 px-2 text-sm text-muted" onClick={() => removeTrack(track.id)} aria-label={`Remove ${track.name}`}>
                Remove
              </button>
            </div>
            {track.kind === "midi" && (
              <select
                className="mb-2 h-11 w-full rounded-md border border-line bg-bg px-2 text-sm text-fg"
                value={track.instrument}
                aria-label={`${track.name} instrument`}
                onChange={(event) => setInstrument(track.id, event.target.value)}
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
            )}
            <label className="flex items-center gap-2 text-xs text-muted">
              Level
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(track.volume * 100)}
                aria-label={`${track.name} level`}
                onChange={(event) => patchTrack(track.id, { volume: Number(event.target.value) / 100 })}
              />
            </label>
            <label className="mt-1 flex items-center gap-2 text-xs text-muted">
              Pan
              <input
                type="range"
                min={-100}
                max={100}
                value={Math.round(track.pan * 100)}
                aria-label={`${track.name} pan`}
                onChange={(event) => patchTrack(track.id, { pan: Number(event.target.value) / 100 })}
              />
            </label>
            <div className="mt-2 flex gap-1">
              <button
                type="button"
                aria-pressed={track.mute}
                className={`min-h-11 flex-1 rounded-md border text-sm ${track.mute ? "border-brass text-brass" : "border-line"}`}
                onClick={() => patchTrack(track.id, { mute: !track.mute })}
              >
                Mute
              </button>
              <button
                type="button"
                aria-pressed={track.solo}
                className={`min-h-11 flex-1 rounded-md border text-sm ${track.solo ? "border-brass text-brass" : "border-line"}`}
                onClick={() => patchTrack(track.id, { solo: !track.solo })}
              >
                Solo
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
