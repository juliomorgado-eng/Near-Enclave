// Enclave face icons in the NEAR deck icon style: one uniform 2-unit stroke on a 24-unit
// square grid, right angles, square terminals, optically centred, no text. Shared by the
// WebGL transition mosaic (Path2D) and the crisp DOM SVG shown at rest.
//   Shift   0 link (open networks) · 1 lock on rails (permissioned rails) · 2 lock · 3 NEAR mark
//   Stats   4 check (a verified result leaves the enclave)
//   Format  5 single stage · 6 chat · 7 calendar (the night before) · 8 key (by invitation)

export const STROKE = 2;

export type IconDef = { paths: string[]; fills?: string[]; fill?: false } | { fill: true };

export const ICONS: IconDef[] = [
  {
    // link: two square chain links joined by a bar
    paths: ['M9.5 7H3.5v10h6', 'M14.5 7h6v10h-6', 'M8 12h8'],
  },
  {
    // permissioned rails: a padlock sitting on a track (rail + sleepers)
    paths: ['M9.75 9.5V5h4.5v4.5', 'M6.5 9.5h11v7h-11z', 'M12 12v2', 'M1.5 20h21', 'M4 20v2.5', 'M9.33 20v2.5', 'M14.67 20v2.5', 'M20 20v2.5'],
  },
  {
    // padlock
    paths: ['M8 10V5h8v5', 'M5 10h14v10.5H5z', 'M12 13.5v3.5'],
  },
  { fill: true },
  {
    // check in a square frame
    paths: ['M4 4h16v16H4z', 'M8 12.25l2.75 2.75L16 9.5'],
  },
  {
    // a single stage: one speaker on a platform
    paths: ['M2.5 17h19v4h-19z', 'M14.75 6a2.75 2.75 0 1 1-5.5 0a2.75 2.75 0 1 1 5.5 0z', 'M7.5 17v-5.5h9V17'],
  },
  {
    // chat: two square speech bubbles
    paths: ['M3 4h11v8H7.5L5 14.5V12H3z', 'M17.5 8.5H21v8h-2v2.5L16.5 16.5H10v-2'],
  },
  {
    // calendar with one day marked
    paths: ['M4 5.5h16V20H4z', 'M4 10h16', 'M8.5 3v4.5', 'M15.5 3v4.5'],
    fills: ['M7 13h3.5v3.5H7z'],
  },
  {
    // key: round bow, shaft, two square teeth
    paths: ['M10.5 12a3.75 3.75 0 1 1-7.5 0a3.75 3.75 0 1 1 7.5 0z', 'M10.5 12H21', 'M17 12v3.5', 'M20.5 12v3.5'],
  },
];
