# Local performance music

The local performance track is stored as `Bling-Bang-Bang-Born.mp3`.

The app serves it at `/audio/music/Bling-Bang-Bang-Born.mp3`. It is normalized to -16 LUFS and padded to the VRMA duration of 19.167 seconds.

`Aipai-Dance-Hall.mp3` is extracted from the local `0711.mp4`, normalized to -16 LUFS, delayed by 0.9 seconds to match the motion lead-in, and padded to 32.7 seconds.

`Cham-Vao-Binh-Minh.mp3` is the original 3-minute companion song. Its Vietnamese vocal was rendered once with the local VieNeu-TTS voice, mixed with a deterministic gentle backing track, and stored as static 48 kHz mono audio so repeat performances do not invoke TTS. This checked-in MP3 is the canonical product asset and is an intentional exception to the rule that probe-generated audio stays under `test-results/` or the TTS cache.

The source lyrics live beside the track. With the local TTS service running, create a new rendition from the repository root with:

```powershell
uv --cache-dir .uv-cache run --project apps/tts --extra vieneu python scripts/generate-companion-song.py --force
```

The backing track is deterministic. VieNeu vocal sampling may change between renderer versions, so regeneration is not promised to be byte-identical to the canonical MP3. Segment cache keys include the renderer ID, endpoint, voice, style, and text; pass a new `--renderer-id` after changing the TTS backend.
