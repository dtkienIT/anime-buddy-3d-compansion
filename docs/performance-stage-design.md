# Performance Stage Design

## Intent

The performance view should feel like a short live-show set, not like the
companion continuing to stand in the study-room background. Each song therefore
has a named stage identity, a scenic silhouette, a lighting palette, and a
small amount of audio-reactive motion. The stage is generated locally in
Three.js so the demo remains deterministic and works offline.

## References and principles

The visual direction takes ideas from public, official show-design references:

- [Eurovision 2024 stage reveal](https://www.eurovision.com/stories/incredible-stage-revealed-for-eurovision-2024/)
  uses movable LED cubes, an LED floor, a central cross-shaped stage, and a
  360-degree audience-aware layout.
- [EBU technical overview of Eurovision 2024](https://www.ebu.ch/news/2024/the-eurovision-song-contest-2024-a-technical-spectacular)
  describes large LED surfaces, moving light elements, and pre-programmed
  lighting/video cues.
- [Tomorrowland 2024 Mainstage](https://www.tomorrowland.com/article/tomorrowland-belgium-2024-mainstage-reveal/?view=mobile)
  shows how a handcrafted scenic concept, sculptures, and many small lights
  can create a memorable silhouette.
- [Moment Factory's TWICE world-tour stage](https://momentfactory.com/products/twice-this-is-for-world-tour)
  demonstrates an evolving 360-degree stage with real-time visuals, overhead
  cubes, and audience-facing IMAG surfaces.
- [Show Design Singapore's stadium concert work](https://showdesignsg.com/works/hige-dandism-stadium/)
  illustrates a curved panoramic LED wall synchronized with visuals and the
  audience environment.

These references are inspiration, not copied assets. The implementation keeps
the scope appropriate for a local MVP:

1. one reusable stage controller;
2. one shader-driven back wall per theme;
3. a few high-contrast scenic primitives;
4. bounded lights and particles;
5. reduced-motion and disposal paths.

## Current stage vocabulary

| Performance | Theme | Scenic language | Palette |
| --- | --- | --- | --- |
| Bling Bang Bang Born | `neon-cube` | suspended cubes, LED grid, runway, truss | black, crimson, fuchsia, gold |
| Aipai Dance Hall | `lantern-festival` | moon gate, layered arches, lanterns, petals | indigo, magenta, warm gold, teal |
| Chạm Vào Bình Minh | `aurora-dawn` | sunrise disc, aurora rings, ribbons, side screens | deep blue, coral, cyan, dawn gold |
| Vũ điệu Uimugi Batake | `wheat-field` | golden sun, wheat silhouettes, glowing arch, amber field particles | plum, amber, wheat gold, sage |
| Happy Synthesizer | `happy-synthwave` | upright neon stargate corridor, edge equalizers, floor grid, deterministic particles | cyan, magenta, violet, deep plum |

The shared registry in `packages/shared/src/performance.ts` is the source of
truth. `apps/web/src/character/PerformanceStageController.ts` maps a theme to
geometry and animation; it does not own song URLs or UI labels.

## Happy Synthesizer safe-zone contract

The approved Concept A redesign is **Neon Stargate Corridor**. Four upright
torus gates sit behind Mika at deterministic local depths (`-0.28`, `-0.42`,
`-0.56`, `-0.70`) and rotate around their Z axis through the existing `rings`
runtime contract. The gates frame the silhouette; they must never become a
horizontal bar across the face.

The character-safe area is intentionally kept clear around the head and upper
torso (approximately `x = ±0.72`, `y = 1.15..3.10` in stage-local space).
Equalizer bars, discs, stars, beams, and large particles stay at the side
edges, above the head, on the floor, or behind the gates. Happy Synthwave
placement is deterministic so resize, zoom, and repeated reloads preserve the
same composition. Reduced motion keeps the same safe geometry while easing
rotation, scale, and particle travel.

## Runtime contract

`GET /api/performances` returns the safe catalog used by integrations and
diagnostics. It intentionally omits `audioUrl` and `animationUrl`, because
those are local frontend assets rather than public backend configuration.

The frontend `LocalPerformanceController` owns playback state:

- `onStart` mounts the stage and starts the local animation;
- `onAudioStart` attaches the analyser for the stage pulse;
- `onProgress` updates the live progress bar;
- `onCleanup` detaches audio, hides the stage, clears the mic state, and
  removes theme classes.

This makes stop, replacement, natural completion, and reduced-motion behavior
follow the same path for all five performances. The Uimugi entry uses the
first-party Golden Wheatlight hyper remix, whose exact 20-bar duration matches
the 26.8-second motion. It follows the same audio analysis, active state,
progress, stop, cleanup, and natural-completion lifecycle as the other entries.

## QA checklist

- Start each card and confirm a distinct stage appears behind the companion.
- Confirm the live card stays below the face and has a readable stage label,
  time, progress bar, and stop button.
- Stop during audio and confirm the stage, analyser, microphone state, and
  animation all return to idle.
- Tap the companion outside a performance and confirm a bounded dialogue bubble.
- Toggle reduced motion and confirm the stage remains legible without pulsing
  geometry.
- Start Happy Synthesizer and confirm no ring, beam, disc, star, or large
  particle crosses Mika's face or upper-torso safe zone at desktop and mobile
  aspect ratios.
- Run:

```powershell
npm --workspace @anime-buddy/shared run test
npm --workspace @anime-buddy/api run test
npm --workspace @anime-buddy/web run test
npm run lint
npm run typecheck
npm run test:browser:responsive
npm run test:browser:experience
npm run test:browser:animations
npm run test:browser:interactions
```

## Deliberate limits

The controller does not attempt photorealistic venue rendering, networked
concert assets, or TTS changes. It prioritizes a coherent, offline-capable
stage system that can later accept richer GLB scenery, authored cue timelines,
or real show-control data without changing the playback contract.
