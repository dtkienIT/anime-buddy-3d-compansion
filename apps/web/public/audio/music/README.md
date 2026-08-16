# Local performance music

These files are static audio/media assets served by the web app. Runtime
playback does not call a music-generation service.

`Bling-Bang-Bang-Born.mp3` and `Aipai-Dance-Hall.mp3` are the existing
project-local dance tracks. `Cham-Vao-Binh-Minh.mp3` is the existing full-length
vocal performance track.

## Uimugi Batake

`Golden-Wheatlight-Original.mp3` is the current soundtrack for the
26.8-second `UiMugibatake.vrma` performance. The filename is kept stable so
existing registry and browser-test references continue to work, but its bytes
were replaced on 2026-08-02 with the approved original MP3 generated in the
owner's authenticated Google Gemini account using Lyria 3 music generation.

The generated track is titled **Uimugi Night Parade**, is approximately
2 minutes 30 seconds long, and was prompted as a 175 BPM, 4/4 electro dance
remix with festival synths, taiko/house percussion, and short original
call-and-response group vocal chants. The performance controller plays the
first 26.8 seconds to stay synchronized with the one-shot VRMA motion.

The downloaded source file was `Stomp_at_Midnight.mp3` (Gemini's download
filename), 3,607,213 bytes, SHA-256
`5EB17984FB058D37350D43D80CCABEED4727A593CDA5927B209968E36E244473`.
The provenance and usage note is maintained in
[`docs/licenses/Golden-Wheatlight-Original.md`](../../../../docs/licenses/Golden-Wheatlight-Original.md).

The old deterministic local synthesizer remains only as historical source
code in `scripts/generate-uimugi-music.mjs`; it is no longer wired to a package
generation command and must not overwrite this approved Gemini asset.

## Happy Synthesizer

`Happy-Synthesizer-Stage.mp4` is the original Gemini-generated electropop
stage track for the 19.933-second `Happy-Synthesizer.vrma` motion. The track is
cheerful, bright, and choreography-focused with short original vocal chops;
the performance controller intentionally plays only the first 19.933 seconds
so the audio and motion finish together. The media container is kept as MP4
because Gemini delivered the generated audio in that format. Provenance and
the BOOTH motion terms are recorded in the root `LICENSES.md`.
