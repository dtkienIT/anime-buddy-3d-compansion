# Mika Immersive Stage UI

The web shell now treats the Three.js canvas as the primary experience and keeps controls in an overlay HUD.

## Interaction model

- `#stage` remains fixed to the viewport and stays centered while panels open, close, resize, or change breakpoint.
- Companion Studio opens from `#studio-fab` or `#studio-toggle`; it is a desktop drawer and a mobile bottom sheet.
- `#studio-backdrop` provides a light scrim and closes Studio when clicked.
- `#chat-panel` starts as a compact bottom-centered pill. The existing collapse button still expands the full chat surface.
- `#stage-tools` exposes camera reset (`R`) and focus (`F`) without adding permanent chrome around the character.

## Responsive rules

The desktop Studio drawer is capped at 380–400px. On narrow viewports it becomes a bottom sheet capped at 74svh, while the chat pill remains bottom-pinned. Safe-area insets and 44px touch targets are preserved. The canvas is never reflowed to make room for either overlay.

## Accessibility and motion

Studio remains keyboard reachable, `Escape` closes it, the backdrop is inert to assistive technology, and the existing reduced-motion rules cover the new drawer/fab transitions. The rail controls mirror the existing focus and camera keyboard shortcuts.
