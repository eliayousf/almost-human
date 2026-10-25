import type { State } from './game-state';

export function roundResult(reveal: Pick<NonNullable<State['reveal']>, 'yourGuess' | 'correct' | 'earnedPoints'>) {
  const kind = reveal.yourGuess === undefined ? 'missed' : reveal.correct ? 'win' : 'loss';
  const points = reveal.earnedPoints ?? 0;
  return {
    kind,
    points: points > 0 ? `+${points}` : String(points),
    title: kind === 'win' ? 'You called it.' : kind === 'loss' ? 'They fooled you.' : 'You missed the call.',
    label: kind === 'win' ? 'GOOD READ' : kind === 'loss' ? 'WRONG GUESS' : 'NO GUESS SUBMITTED',
    detail: kind === 'win' ? 'One stranger. One good instinct.' : kind === 'loss' ? 'A wrong read. A fresh chance in the next room.' : 'Time ran out before you made a guess.',
  } as const;
}
