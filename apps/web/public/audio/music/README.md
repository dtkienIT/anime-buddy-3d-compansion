# Local performance music

The local performance track is stored as `Bling-Bang-Bang-Born.mp3`.

The app serves it at `/audio/music/Bling-Bang-Bang-Born.mp3`. It is normalized to -16 LUFS and padded to the VRMA duration of 19.167 seconds.

`Aipai-Dance-Hall.mp3` is extracted from the local `0711.mp4`, normalized to -16 LUFS, delayed by 0.9 seconds to match the motion lead-in, and padded to 32.7 seconds.

`Cham-Vao-Binh-Minh.mp3` is the canonical, full-length companion song with the finalized Vietnamese Trúc Ly vocal. It is stored as a static product asset so performances never invoke generation, training, or voice conversion at runtime. Source material, training data, notebooks, checkpoints, and intermediate stems are intentionally excluded from this repository.
