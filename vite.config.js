import { defineConfig } from 'vite';

// GitHub Pages serves this project from a repo subpath
// (https://sandbox-vm-kenyon.github.io/claw-game-prototype/), so the built
// asset URLs must be relative rather than root-absolute. `base: './'` makes
// Vite emit relative paths that work at any subpath.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    // The game runs at a fixed internal resolution and has no code-splitting
    // needs; a single small bundle keeps the deploy story simple.
    target: 'es2020',
  },
});
