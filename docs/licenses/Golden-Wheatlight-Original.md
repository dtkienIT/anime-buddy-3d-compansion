# Uimugi Night Parade soundtrack

## Asset

- Runtime file: `apps/web/public/audio/music/Golden-Wheatlight-Original.mp3`
- Performance: `Vũ điệu Uimugi Batake` / `UiMugibatake.vrma`
- Runtime playback window: 26.8 seconds (the motion duration)
- Generated track length: approximately 2 minutes 30 seconds
- Prompt tempo: 175 BPM, 4/4
- Downloaded MP3 size: 3,607,213 bytes
- SHA-256:
  `5EB17984FB058D37350D43D80CCABEED4727A593CDA5927B209968E36E244473`

The stable runtime filename is retained for compatibility with the shared
performance registry and existing browser tests. The content was replaced on
2026-08-02 after the owner approved the Gemini preview.

## Source and generation record

The MP3 was generated in the owner's already-authenticated Google Gemini
account with **Gemini Pro**, the **Create music** tool, and **Lyria 3**. The
download action selected **Chỉ riêng âm thanh / Bản nhạc MP3**. Gemini's local
download filename was `Stomp_at_Midnight.mp3`; it was copied into the project
and renamed to the stable runtime filename above.

The generation prompt requested an original, high-energy electro dance remix
for the Uimugi Batake choreography: 175 BPM, punchy kick and syncopated bass,
festival synths, taiko and house percussion, a call-and-response group vocal
texture with short non-lexical chants, an 8-bar intro, two dance drops, a
tension break, and a larger final drop. It explicitly requested an original
melody and vocal sounds and prohibited copying any existing song, melody,
lyrics, or recording.

This repository records provenance and the generated-file hash for the
personal educational project. The Gemini/Google account terms and any
applicable Lyria output terms remain controlling; this Markdown note does not
grant rights beyond those terms. The asset is not sourced from, extracted from,
or a replacement recording of the commercial `Uimugi` song. The BOOTH motion
license is separate and documented in
[`MaronYatsuhashi-BOOTH-5846143.md`](MaronYatsuhashi-BOOTH-5846143.md).

## Verification

```powershell
npm run verify:uimugi-music
npm run verify-assets
```

The verifier checks the MP3 signature, minimum size, and pinned SHA-256. The
old deterministic generator is retained as historical source only and is not
used by the verification workflow.
