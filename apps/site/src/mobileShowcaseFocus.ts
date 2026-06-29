const FOCUS_RADIUS = 1.08;
const SIDE_LIMIT = 1;
const BASE_Z_INDEX = 10;
const FOCUS_Z_INDEX_RANGE = 20;
const CSS_PRECISION = 3;

const FOCUS_STYLE = {
  sideShiftPx: -18,
  liftPx: -26,
  tiltDeg: -5,
  scaleBase: 0.91,
  scaleRange: 0.13,
  depthBase: -16,
  depthRange: 48,
  saturateBase: 0.74,
  saturateRange: 0.42,
  brightnessBase: 0.68,
  brightnessRange: 0.34,
  opacityBase: 0.54,
  opacityRange: 0.46,
  borderAlphaBase: 0.14,
  borderAlphaRange: 0.46,
  shadowYBase: 34,
  shadowYRange: 22,
  shadowBlurBase: 66,
  shadowBlurRange: 36,
  shadowSpreadBase: -34,
  shadowSpreadRange: 5,
  glowBlurBase: 40,
  glowBlurRange: 76,
  glowSpreadBase: -28,
  glowSpreadRange: 8,
  glowAlphaBase: 0.12,
  glowAlphaRange: 0.32,
  ringAlphaBase: 0.04,
  ringAlphaRange: 0.16,
  capAlphaBase: 0.56,
  capAlphaRange: 0.44,
  capLiftPx: -4,
} as const;

function clampUnit(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function easeFocus(value: number) {
  return value * value * (3 - 2 * value);
}

function toCssNumber(value: number) {
  return value.toFixed(CSS_PRECISION);
}

function toCssPx(value: number) {
  return `${toCssNumber(value)}px`;
}

function setCssVar(phone: HTMLElement, name: string, value: string) {
  phone.style.setProperty(name, value);
}

function setFocusStyle(phone: HTMLElement, focus: number, side: number) {
  const s = FOCUS_STYLE;
  setCssVar(phone, "--mx-shift-x", toCssPx(side * s.sideShiftPx));
  setCssVar(phone, "--mx-lift", toCssPx(focus * s.liftPx));
  setCssVar(phone, "--mx-depth", toCssPx(s.depthBase + focus * s.depthRange));
  setCssVar(phone, "--mx-tilt-y", `${toCssNumber(side * s.tiltDeg)}deg`);
  setCssVar(phone, "--mx-scale", toCssNumber(s.scaleBase + focus * s.scaleRange));
  setCssVar(phone, "--mx-saturate", toCssNumber(s.saturateBase + focus * s.saturateRange));
  setCssVar(phone, "--mx-brightness", toCssNumber(s.brightnessBase + focus * s.brightnessRange));
  setCssVar(phone, "--mx-opacity", toCssNumber(s.opacityBase + focus * s.opacityRange));
  setCssVar(phone, "--mx-border-alpha", toCssNumber(s.borderAlphaBase + focus * s.borderAlphaRange));
  setCssVar(phone, "--mx-shadow-y", toCssPx(s.shadowYBase + focus * s.shadowYRange));
  setCssVar(phone, "--mx-shadow-blur", toCssPx(s.shadowBlurBase + focus * s.shadowBlurRange));
  setCssVar(phone, "--mx-shadow-spread", toCssPx(s.shadowSpreadBase + focus * s.shadowSpreadRange));
  setCssVar(phone, "--mx-glow-blur", toCssPx(s.glowBlurBase + focus * s.glowBlurRange));
  setCssVar(phone, "--mx-glow-spread", toCssPx(s.glowSpreadBase + focus * s.glowSpreadRange));
  setCssVar(phone, "--mx-glow-alpha", toCssNumber(s.glowAlphaBase + focus * s.glowAlphaRange));
  setCssVar(phone, "--mx-ring-alpha", toCssNumber(s.ringAlphaBase + focus * s.ringAlphaRange));
  setCssVar(phone, "--mx-cap-alpha", toCssNumber(s.capAlphaBase + focus * s.capAlphaRange));
  setCssVar(phone, "--mx-cap-lift", toCssPx(focus * s.capLiftPx));
}

export function applyPhoneFocus(phones: readonly HTMLElement[], panT: number) {
  const position = panT * (phones.length - 1);
  phones.forEach((phone, i) => {
    const distance = Math.abs(position - i);
    const focus = easeFocus(clampUnit(1 - distance / FOCUS_RADIUS));
    const side = Math.max(Math.min(i - position, SIDE_LIMIT), -SIDE_LIMIT);
    setFocusStyle(phone, focus, side);
    phone.style.zIndex = String(
      Math.round(BASE_Z_INDEX + focus * FOCUS_Z_INDEX_RANGE),
    );
  });
}
