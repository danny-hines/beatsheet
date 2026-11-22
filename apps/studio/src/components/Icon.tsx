/**
 * The studio's one set of icons, drawn like a drafting pen would: a 16px grid, 1.5px lines, square ends, mitred
 * corners (`.ic` in styles.css). An icon takes the colour of the type beside it. A path that starts with `*` is
 * filled instead of drawn, for the few shapes that are solid (play, a moment's diamond, the dots of "more").
 */
const ICONS = {
  // Getting around
  back: ["M10 3 5 8l5 5"],
  forward: ["M6 3l5 5-5 5"],
  down: ["M3.5 6 8 10.5 12.5 6"],
  right: ["M6 3.5 10.5 8 6 12.5"],
  external: ["M6 3.5h6.5V10", "M12.5 3.5 4 12"],
  enlarge: ["M9.5 2.5h4v4", "M6.5 13.5h-4v-4", "M13.5 2.5 9 7", "M2.5 13.5 7 9"],
  // Playing
  play: ["*M4.5 2.5v11L13.5 8z"],
  pause: ["*M4 3h3v10H4z", "*M9 3h3v10H9z"],
  stop: ["*M4 4h8v8H4z"],
  "step-back": ["M11 3.5v9L5 8z"],
  "step-forward": ["M5 3.5v9L11 8z"],
  "cut-back": ["M3.5 3v10", "*M13 3v10L6 8z"],
  "cut-forward": ["M12.5 3v10", "*M3 3v10l7-5z"],
  // Editing
  split: ["M8 1.5v13", "M3 5l3 3-3 3", "M13 5l-3 3 3 3"],
  pencil: ["M2.5 13.5 3.3 10.2 10.5 3l2.5 2.5-7.2 7.2z", "M9 4.5 11.5 7"],
  undo: ["M5.5 2.5l-3 3 3 3", "M2.5 5.5h7a4 4 0 0 1 0 8H6"],
  redo: ["M10.5 2.5l3 3-3 3", "M13.5 5.5h-7a4 4 0 0 0 0 8H10"],
  add: ["M8 3v10", "M3 8h10"],
  minus: ["M3 8h10"],
  close: ["M3.5 3.5l9 9", "M12.5 3.5l-9 9"],
  check: ["M3 8.5l3.2 3.2L13 4.5"],
  more: ["*M2.5 7h2v2h-2z", "*M7 7h2v2H7z", "*M11.5 7h2v2h-2z"],
  tune: ["M2.5 5h5", "M11 5h2.5", "M2.5 11h2", "M8.5 11h5", "M9.25 3.25v3.5", "M6.75 9.25v3.5"],
  export: ["M8 10.5v-8", "M5 5l3-3 3 3", "M3 9.5v4h10v-4"],
  folder: ["M2 4h4.5L8 6h6v7H2z"],
  new: ["M2.5 2.5h11v11h-11z", "M8 5.5v5", "M5.5 8h5"],
  // What something is, or has on it
  warn: ["M8 2.5 14 13H2z", "M8 6.5v3", "M8 11.2v.3"],
  lock: ["M4 7.5h8v6H4z", "M5.5 7.5V5.3a2.5 2.5 0 0 1 5 0v2.2"],
  star: ["M8 2.2l1.8 3.7 4 .6-2.9 2.9.7 4L8 11.5l-3.6 1.9.7-4L2.2 6.5l4-.6z"],
  moment: ["*M8 2 14 8l-6 6-6-6z"],
  key: ["M8 2.5 13.5 8 8 13.5 2.5 8z"],
  music: ["M6 11.5V3.5l6.5-1.5v8", "M6 11.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0z", "M12.5 10a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0z"],
  mic: ["M6 3.5a2 2 0 0 1 4 0v4a2 2 0 0 1-4 0z", "M3.5 7.5a4.5 4.5 0 0 0 9 0", "M8 12v2"],
  screen: ["M2 3.5h12v7.5H2z", "M5.5 13.5h5"],
  camera: ["M2 4.5h8v7H2z", "M10 7l4-2v6l-4-2"],
  region: ["M2.5 2.5h11v11h-11z", "*M6 6h4v4H6z"],
  cutout: ["M4.5 5.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z", "M4.5 14a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z", "M6 5l7.5 6.5", "M6 11l7.5-6.5"],
  effect: ["M8 2v2.5", "M8 11.5V14", "M2 8h2.5", "M11.5 8H14", "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"],
  follow: ["M2.5 5.5v-3h3", "M10.5 2.5h3v3", "M13.5 10.5v3h-3", "M5.5 13.5h-3v-3", "*M7 7h2v2H7z"],
  look: ["M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z", "*M8 2.5a5.5 5.5 0 0 1 0 11z"],
  entrance: ["M2.5 13 13.5 3v10z"],
  face: ["M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z", "M6 6.5V7", "M10 6.5V7", "M5.5 9.5c1.2 1.6 3.8 1.6 5 0"],
  person: ["M8 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z", "M3 13.5C3 10.7 5.2 9 8 9s5 1.7 5 4.5"],
  object: ["M8 2 13.5 5v6L8 14 2.5 11V5z", "M2.5 5 8 8l5.5-3", "M8 8v6"],
  "radio-on": ["M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3z", "*M8 5.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5z"],
  "radio-off": ["M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3z"],
  // The parts of Settings
  talk: ["M2.5 3h11v8H8l-3 2.5V11H2.5z"],
  service: ["M5 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z", "M7.5 8H14", "M11.5 8v2.5", "M14 8v2"],
  picture: ["M2.5 3h11v10h-11z", "M2.5 11 6 7.5l3 3 2-2 2.5 2.5"],
  words: ["M2.5 4h11", "M2.5 8h11", "M2.5 12h7"],
  restore: ["M3 8a5 5 0 1 0 1.5-3.5", "M2 2.5v2.5h2.5", "M8 5.5V8l2 1.5"],
  checked: ["M2.5 2.5h11v11h-11z", "M5 8.3l2 2 4-4.3"],
} as const;

export type IconName = keyof typeof ICONS;

/** One of the studio's icons. `size` is its side in pixels (16 unless said); `title` names it for a screen reader when it stands alone. */
export function Icon({ name, size = 16, title, className }: { name: IconName; size?: number; title?: string; className?: string }) {
  return (
    <svg className={className ? `ic ${className}` : "ic"} viewBox="0 0 16 16" width={size} height={size} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {ICONS[name].map((d, i) => (d[0] === "*" ? <path key={i} className="solid" d={d.slice(1)} /> : <path key={i} d={d} />))}
    </svg>
  );
}
