export const animationModes = ['idle', 'talk', 'smile'] as const;
export type AnimationMode = typeof animationModes[number];

export function nextAnimation(current: AnimationMode, random = Math.random): AnimationMode {
  const alternatives = animationModes.filter(mode => mode !== current);
  return alternatives[Math.floor(random() * alternatives.length)];
}

export function randomCharacterId(random = Math.random): number {
  return 1 + Math.floor(random() * 25);
}

export function animationDelay(random = Math.random): number {
  return 4000 + Math.floor(random() * 4000);
}
