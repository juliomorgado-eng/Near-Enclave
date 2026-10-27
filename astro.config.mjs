import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://enclave.near.org',
  server: { port: 4321, host: true },
  vite: {
    // Pre-bundle every animation dep up front. When Vite discovered a GSAP plugin
    // late it re-optimized and served the old chunk as 504, so v2's script never booted.
    optimizeDeps: {
      include: [
        'gsap',
        'gsap/CustomEase',
        'gsap/ScrambleTextPlugin',
        'gsap/ScrollTrigger',
        'gsap/SplitText',
        'lenis',
        'three',
        'three/examples/jsm/geometries/RoundedBoxGeometry.js',
        'three/examples/jsm/effects/AsciiEffect.js',
      ],
    },
  },
});
