# Bridge feasibility prototype

This folder is throwaway code from the planning session. No file here ships.

- `bridge-v2-cantilever.js`: the chosen silhouette direction. `v2-cantilever-*.jpg` are its renders.
- `bridge-v1-arch.js`: the rejected variant. `v1-arch-*.jpg` are its renders.
- `run.mjs`: renders five views in headless Chrome.
- `blender-bridge-NOT-RUN.py`: a draft Blender script that was never executed.

To render the chosen variant again, copy this folder to a scratch location and run:

```sh
pnpm init
pnpm add three@0.187.0 playwright-core@1.65.1
node run.mjs
```

The renders go to `out/`. The script needs Google Chrome.
