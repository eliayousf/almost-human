import assert from 'node:assert/strict';
import { roundResult } from '../src/round-result.ts';

const win = roundResult({ yourGuess: 'human', correct: true, earnedPoints: 100 });
assert.equal(win.kind, 'win');
assert.equal(win.points, '+100');
assert.equal(win.label, 'GOOD READ');
const loss = roundResult({ yourGuess: 'ai', correct: false, earnedPoints: 0 });
assert.equal(loss.kind, 'loss');
assert.equal(loss.points, '0');
assert.equal(loss.label, 'WRONG GUESS');
const missed = roundResult({ correct: false, earnedPoints: 0 });
assert.equal(missed.kind, 'missed');
assert.equal(missed.points, '0');
assert.equal(missed.label, 'NO GUESS SUBMITTED');
assert.equal(roundResult({ correct: true, earnedPoints: 0 }).kind, 'missed');
assert.equal(roundResult({ yourGuess: 'human', correct: true }).points, '0');
assert.equal(roundResult({ yourGuess: 'ai', correct: false, earnedPoints: -25 }).points, '-25');
console.log('Round outcomes passed: wins, losses, missing guesses and exact server points.');
