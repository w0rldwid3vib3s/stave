import { useEffect, useRef } from "react";
import { decodeFile, isCapturing, onInputLevel, startVoice, stopVoice, tuneClip } from "@/lib/studio/engine";
import { selectedTrack, useStudio } from "@/lib/studio/store";
import { KEYS } from "@/lib/studio/theory";

export function Voice() {
  const track = useStudio(selectedTrack);
  const tracks = useStudio((s) => s.tracks);
  const keyRoot = useStudio((s) => s.keyRoot);
  const scale = useStudio((s) => s.scale);
  const selectedClipId = useStudio((s) => s.selectedClipId);
  const selectTrack = useStudio((s) => s.selectTrack);
  const selectClip = useStudio((s) => s.selectClip);
  const addClip = useStudio((s) => s.addClip);
  const patchClip = useStudio((s) => s.patchClip);
  const removeClip = useStudio((s) => s.removeClip);
  const addAudioTrack = useStudio((s) => s.addAudioTrack);
  const setStatus = useStudio((s) => s.setStatus);
  const recording = useStudio((s) => s.recording);
  const meter = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const audio = track?.kind === "audio" ? track : tracks.find((t) => t.kind === "audio");
  const clip = audio?.clips.find((c) => c.id === selectedClipId) ?? audio?.clips.at(-1) ?? null;

  useEffect(() => {
    onInputLevel((level) => {
      if (meter.current) meter.current.style.transform = `scaleX(${Math.min(1, level * 4)})`;
    });
    return () => onInputLevel(null);
  }, []);

  useEffect(() => {
    if (!audio || !clip) return;
    const handle = window.setTimeout(() => {
      void tuneClip(audio.id, clip.id);
    }, 280);
    return () => window.clearTimeout(handle);
  }, [audio, clip]);

  const ensureAudio = () => {
    if (audio) {
      selectTrack(audio.id);
      return audio.id;
    }
    addAudioTrack();
    return useStudio.getState().selectedTrackId;
  };

  const toggleRec = async () => {
    const id = ensureAudio();
    try {
      if (isCapturing()) stopVoice(id);
      else await startVoice(id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not record.");
    }
  };

  const importFile = async (file: File) => {
    try {
      const decoded = await decodeFile(file);
      const id = ensureAudio();
      const beat = 0;
      addClip(id, {
        name: decoded.name,
        bufferId: decoded.id,
        start: beat,
        gain: 0.9,
        transpose: 0,
        tune: 0,
        tunedBufferId: null,
      });
      setStatus(`“${decoded.name}” is on the arrangement. Drag it into place.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import.");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`min-h-11 rounded-md border px-4 text-sm ${recording ? "border-brass bg-brass text-bg" : "border-line"}`}
          onClick={() => void toggleRec()}
        >
          {recording ? "Stop vocal" : "Record vocal"}
        </button>
        <button type="button" className="min-h-11 rounded-md border border-line px-3 text-sm" onClick={() => fileRef.current?.click()}>
          Import audio
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.wav,.mp3,.ogg,.m4a,.flac"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importFile(file);
          }}
        />
        <div className="h-2 w-28 overflow-hidden rounded-sm bg-raised" aria-hidden>
          <div ref={meter} className="h-full origin-left bg-brass" style={{ transform: "scaleX(0)" }} />
        </div>
      </div>
      <p className="text-sm text-pretty text-muted">
        Record a vocal or drop in a stem. Tune snaps the pitch toward {KEYS.find((k) => k.root === keyRoot && k.scale === scale)?.label ?? "the key"} without speeding the take up or down.
      </p>
      {audio && audio.clips.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {audio.clips.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`min-h-11 shrink-0 rounded-md border px-3 text-sm ${item.id === clip?.id ? "border-brass text-brass" : "border-line"}`}
              onClick={() => {
                selectTrack(audio.id);
                selectClip(item.id);
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
      {clip && audio ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-muted">
            Transpose {clip.transpose > 0 ? `+${clip.transpose}` : clip.transpose} st
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={clip.transpose}
              aria-label="Transpose semitones"
              onChange={(event) => patchClip(audio.id, clip.id, { transpose: Number(event.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            Tune to key {Math.round(clip.tune * 100)}%
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(clip.tune * 100)}
              aria-label="Tune strength"
              onChange={(event) => patchClip(audio.id, clip.id, { tune: Number(event.target.value) / 100 })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            Clip level
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(clip.gain * 100)}
              aria-label="Clip level"
              onChange={(event) => patchClip(audio.id, clip.id, { gain: Number(event.target.value) / 100 })}
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="min-h-11 rounded-md border border-line px-3 text-sm"
              onClick={() => patchClip(audio.id, clip.id, { tune: 0, transpose: 0 })}
            >
              Original
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border border-brass px-3 text-sm text-brass"
              onClick={() => removeClip(audio.id, clip.id)}
            >
              Remove take
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-steel">No take yet. Record, or import a loop to mix under the keys.</p>
      )}
    </div>
  );
}
