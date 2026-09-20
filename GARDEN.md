# The living garden

Roy Tsai's static personal website. Open through an HTTP server (for example, `python3 -m http.server 8000`) and visit `http://localhost:8000`. No build step is required; the files can be served directly by GitHub Pages.

## Files

- `index.html`: original academic content, navigation, accessible controls.
- `garden.css`: portfolio typography, responsive layouts and exploration mode.
- `garden.js`: materials, planted scene, lighting, camera and lifecycle.
- `assets/`: locally hosted engine, controls, statue and surface maps.

The older `script.js` and `styles.css` are not loaded by this page and have been left untouched.

## Interaction

Scrolling follows a curved route around the sculpture. Desktop pointer movement adds a small camera offset. **Explore** hides the content and enables orbiting: drag (or one-finger touch) to rotate, wheel or pinch to zoom. Focus the garden and use arrow keys to orbit, +/− to zoom. Overview, Sculpture and Parterre provide framed viewpoints; Reset restores the view at entry. Escape or Back to portfolio returns to the same reading position. Navigation also exits exploration.

Pause stops the continuous render loop, camera sway, automatic scroll camera, cloud drift and leaf animation. Manual exploration still works. Reduced-motion preferences start paused and are respected when changed. Hidden tabs suspend rendering. Resizing also works in paused mode. If WebGL or the engine fails, the portfolio remains readable; no-JavaScript visitors also see the content.

## Rendering

Folded, curved leaf geometry is instanced into spatial batches that are culled outside the camera view, with individual orientation and muted green variation. The cypress silhouette has thousands of fine sprays, while hedges have smaller leaves. Bark, gravel and grass have photographic diffuse and normal maps; bark and gravel also use roughness maps. Procedural materials remain as loading/error fallbacks. The perimeter wall uses eight level courses of equal curved sandstone blocks with half-brick offsets and consistent mortar joints. Wall niches and detached ivy/moss meshes are omitted; foreground tree crowns are bounded to stay clear of the masonry. Rodin’s seated Thinker stands on an octagonal stone plinth with restrained gold inlays. Its locally hosted scan is reduced to 120,000 triangles (3.12 MB) and shaded with an added mottled bronze and patina finish. A fixed solar aureole sits behind the upper body: two thin gold rings, a soft amber corona, and tapered radial beams with varied length and brightness. Its additive shader remains depth-tested and attached to the sculpture, so the figure occludes the light and the ring keeps its perspective when orbiting. A small local warm light connects the halo to the bronze. The halo is static, including in reduced-motion mode; it needs no external image or full-screen bloom pass. Warm overhead spot lighting, a cool rim and darker ambient light shape the bronze; a low-opacity, depth-tested light shaft fades at its edges. Both sun and key-light shadows are rendered once and updated when the statue arrives. Leaves move slightly against the static shadows to avoid regenerating the full shadow map every frame.

Mobile starts with lower planting density, a 1024px sun shadow map, and a pixel ratio capped at 1.25. Desktop caps pixel ratio at 1.5. The sculpture key light has a 1024px shadow map on both tiers. No full-screen postprocessing or depth-of-field passes are used. Real-device frame rates depend on GPU and viewport; the automated browser checks use software WebGL, not a mobile performance benchmark.

## Sources and credits

- Three.js r128, GLTFLoader and OrbitControls: [three.js](https://github.com/mrdoob/three.js/tree/r128), MIT; license in `assets/vendor/LICENSE.three.txt`.
- `assets/models/the-thinker/`: **The Thinker, Auguste Rodin**, scan by **Scan the World**, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Selected [Sketchfab model](https://sketchfab.com/3d-models/the-thinker-auguste-rodin-00a0a35f6fc94e35b84a39a7cf60e6b9); downloadable geometry obtained from the same author’s [Wikimedia Commons STL](https://commons.wikimedia.org/wiki/File:Scan_the_World_-_The_Thinker_(Auguste_Rodin).stl). The scan has the same original triangle count as the selected listing. The derivative GLB retains CC BY-SA 4.0; see its README for provenance, modifications and reproduction. No Sketchfab viewer assets were extracted.
- `lawn_color.jpg`, `lawn_normal.jpg`: grasslight terrain maps from [Three.js r128 examples](https://github.com/mrdoob/three.js/tree/r128/examples/textures/terrain), already used by the original site; hosted locally here.
- `bark_brown_02_*`: [Bark Brown 02](https://polyhaven.com/a/bark_brown_02), Poly Haven.
- `gravelly_sand_*`: [Gravelly Sand](https://polyhaven.com/a/gravelly_sand), Poly Haven.
- `sandstone_cracks_*`: [Sandstone Cracks](https://polyhaven.com/a/sandstone_cracks), Poly Haven.
- Poly Haven textures are [CC0](https://polyhaven.com/license); 1K JPEG diffuse, OpenGL normal and roughness maps are included.
- [Logartis](https://logartis.info/) informed the transition between a personal portfolio and an explorable 3D environment; no source code, illustration or model was copied from it.

Google Fonts is the only optional external visual dependency; local serif/sans-serif fallbacks are provided.
