// Свинка Dami — отличница в очках. Рисуется в системе координат 512×512.
// Используется и в интерфейсе, и скриптом scripts/make-icons.mjs для иконок PWA.

export const PIG_LIGHT = { body: '#FFE6F0', ear: '#FFC6DC', snout: '#FFB3CF', dark: '#D93A78', blush: '#FF8DB5' };
export const PIG_PINK = { body: '#FFB3CF', ear: '#FF8DBA', snout: '#FF8DBA', dark: '#C2185B', blush: '#FF6FA5' };

export function pigShapes(c = PIG_PINK, { coin = false, glasses = true, pencil = true } = {}) {
  return `
  <path d="M104 286c-36-4-44-44-18-50 18-4 24 18 8 26" fill="none" stroke="${c.dark}" stroke-width="11" stroke-linecap="round"/>
  <rect x="186" y="360" width="46" height="74" rx="18" fill="${c.ear}"/>
  <rect x="330" y="360" width="46" height="74" rx="18" fill="${c.ear}"/>
  <path d="M296 186l40-64c6-9 18-6 18 5l-2 76z" fill="${c.ear}"/>
  <ellipse cx="250" cy="298" rx="162" ry="124" fill="${c.body}"/>
  <rect x="138" y="368" width="48" height="74" rx="18" fill="${c.body}"/>
  <rect x="282" y="368" width="48" height="74" rx="18" fill="${c.body}"/>
  <path d="M176 204l-26-72c-3-11 7-18 16-12l70 52z" fill="${c.ear}"/>
  <rect x="205" y="188" width="90" height="15" rx="7.5" fill="${c.dark}" opacity=".85"/>
  <ellipse cx="400" cy="304" rx="38" ry="48" fill="${c.snout}"/>
  <ellipse cx="392" cy="288" rx="7" ry="10" fill="${c.dark}"/>
  <ellipse cx="392" cy="320" rx="7" ry="10" fill="${c.dark}"/>
  <ellipse cx="318" cy="322" rx="24" ry="14" fill="${c.blush}" opacity=".55"/>
  <circle cx="336" cy="262" r="14" fill="#3B1A2A"/>
  <circle cx="341" cy="257" r="4.5" fill="#fff"/>
  ${glasses ? `
  <circle cx="336" cy="262" r="31" fill="#fff" fill-opacity=".18" stroke="${c.dark}" stroke-width="9"/>
  <path d="M305 258c-22-6-48-10-70-6" fill="none" stroke="${c.dark}" stroke-width="8" stroke-linecap="round"/>
  <path d="M366 266c8 2 14 6 18 12" fill="none" stroke="${c.dark}" stroke-width="8" stroke-linecap="round"/>` : ''}
  ${pencil ? `
  <g transform="rotate(-38 250 118)">
    <rect x="170" y="100" width="150" height="36" rx="6" fill="#FFCC40" stroke="#E9A800" stroke-width="6"/>
    <rect x="170" y="100" width="30" height="36" rx="6" fill="#FF8DB5" stroke="#E36A98" stroke-width="6"/>
    <rect x="196" y="100" width="12" height="36" fill="#C7C2CC"/>
    <path d="M320 103l40 15-40 15z" fill="#F6D7B0" stroke="#E0B47E" stroke-width="5" stroke-linejoin="round"/>
    <path d="M346 113l14 5-14 5z" fill="#3B1A2A"/>
  </g>` : ''}
  ${coin ? `
  <circle cx="250" cy="112" r="44" fill="#FFCC40" stroke="#E9A800" stroke-width="8"/>
  <rect x="229" y="90" width="42" height="7" rx="3.5" fill="#B87F00"/>
  <rect x="229" y="103" width="42" height="7" rx="3.5" fill="#B87F00"/>
  <rect x="246" y="103" width="8" height="34" rx="4" fill="#B87F00"/>` : ''}`;
}

export const pigSvg = (cls = '', colors, opts) =>
  `<svg class="${cls}" viewBox="0 0 512 512" aria-hidden="true">${pigShapes(colors, opts)}</svg>`;
