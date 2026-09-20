# The Thinker — Auguste Rodin

3D scan by **Scan the World**. Uploaded to Wikimedia Commons by Jonathanbeck.

- User-selected listing: https://sketchfab.com/3d-models/the-thinker-auguste-rodin-00a0a35f6fc94e35b84a39a7cf60e6b9
- Download source and attribution: https://commons.wikimedia.org/wiki/File:Scan_the_World_-_The_Thinker_(Auguste_Rodin).stl
- Original STL: https://upload.wikimedia.org/wikipedia/commons/e/e2/Scan_the_World_-_The_Thinker_%28Auguste_Rodin%29.stl
- License for the scan and this adapted GLB: **Creative Commons Attribution-ShareAlike 4.0 International**, https://creativecommons.org/licenses/by-sa/4.0/
- Legal code: https://creativecommons.org/licenses/by-sa/4.0/legalcode.en

The selected Sketchfab listing does not expose a downloadable file through its public API. The original Wikimedia scan is by the same author and has the same 837,482 triangles and 418,714 vertices as that listing. This is a publicly downloadable source, not an extraction from the Sketchfab viewer.

Original file: 41,874,184 bytes. SHA-1: `486307df3882858a36cbb5812beaf5f881b800c7`.

## Changes

The original untextured STL was simplified to 120,000 triangles / 59,974 vertices using quadric decimation, rotated from Z-up to Y-up, centered, normalized to a height of one unit, and exported to GLB with smooth vertex normals. No anatomy or pose was intentionally altered. The resulting GLB is 3,120,860 bytes. The website adds a procedural bronze/patina material, lighting, pedestal and decorative aureole; these are not scanned features of Rodin’s work.

The adapted model remains licensed under CC BY-SA 4.0. When sharing or modifying it, retain attribution, indicate changes, and comply with that license. This asset license does not assign a license to unrelated portfolio content.

## Reproduce

With Python, install `trimesh==5.1.0`, `fast-simplification==0.2.0`, and `numpy==2.5.3` (or compatible versions). Download the original STL to a temporary directory and verify the checksum above. The adjacent `prepare.py` accepts the STL input path and GLB output path. Bronze color variation is applied at runtime in `garden.js`.
