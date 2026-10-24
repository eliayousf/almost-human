// Offline checks for the frontend preview contract; no API or model calls.
import assert from 'node:assert/strict';
import * as fixtures from '../shared/fixtures.ts';
import { GAME_DEFAULTS } from '../shared/game-contract.ts';

const privateKeys = new Set(['kind', 'role', 'isBot', 'botCount', 'model', 'provider', 'otherBallots']);
function checkPublicFields(value) {
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert(!privateKeys.has(key), `Pre-reveal fixture leaks ${key}`);
    checkPublicFields(child);
  }
}

const rounds = Object.values(fixtures).filter(value => value && 'phase' in value);
assert(rounds.length >= 9);
assert.equal(Date.parse(fixtures.votingFixture.votingEndsAt) - Date.parse(fixtures.countdownFixture.chatEndsAt), GAME_DEFAULTS.votingMs);
assert.equal(Date.parse(fixtures.revealFixture.serverNow), Date.parse(fixtures.votingFixture.votingEndsAt));
for (const round of rounds) {
  const ids = new Set(round.participants.map(seat => seat.id));
  assert.ok(ids.size >= GAME_DEFAULTS.minParticipants && ids.size <= GAME_DEFAULTS.maxParticipants, 'lobby size within 2-5');
  assert.equal(ids.size, round.participants.length);
  assert(ids.has(round.selfId));
  assert(Number.isInteger(round.revision) && round.revision > 0);
  assert(!Number.isNaN(Date.parse(round.serverNow)));
  if ('messages' in round) {
    for (const message of round.messages) assert(ids.has(message.senderId));
  }
  if (round.phase !== 'reveal') checkPublicFields(round);
  if (round.phase === 'countdown') {
    assert(!('topic' in round));
    assert(!('messages' in round));
    assert.equal(Date.parse(round.chatEndsAt) - Date.parse(round.chatStartsAt), GAME_DEFAULTS.chatMs);
  }
  if (round.phase === 'reveal') {
    assert.equal(round.participants.find(seat => seat.id === round.selfId).kind, 'human');
    const result = round.yourResult;
    let correct = 0;
    if (result.ballotStatus === 'submitted') {
      assert.equal(result.votes.length, 2);
      assert.equal(new Set(result.votes.map(vote => vote.participantId)).size, 2);
      for (const vote of result.votes) {
        assert.notEqual(vote.participantId, round.selfId);
        const target = round.participants.find(seat => seat.id === vote.participantId);
        assert(target);
        if (vote.label === target.kind) correct += 1;
      }
    } else assert.equal(result.votes, null);
    assert.equal(result.correctGuessCount, correct);
    assert.equal(result.guessingPointsEarned, correct * GAME_DEFAULTS.guessPoints);
    assert.equal(result.totalGuessingPoints, fixtures.sessionFixture.totalGuessingPoints + result.guessingPointsEarned);
    const recognition = result.recognition;
    const otherHumans = round.participants.filter(seat => seat.id !== round.selfId && seat.kind === 'human').length;
    assert(recognition.humanVotesReceived <= otherHumans);
    assert(recognition.humanVotesRecognisingYou <= recognition.humanVotesReceived);
    assert.equal(recognition.fraction, recognition.humanVotesReceived === 0
      ? null : recognition.humanVotesRecognisingYou / recognition.humanVotesReceived);
  }
}

// The fixtures must include every room composition and a non-voting result.
const reveals = rounds.filter(round => round.phase === 'reveal');
assert.deepEqual([...new Set(reveals.map(round => round.participants.filter(seat => seat.kind === 'ai').length))].sort(), [0, 1, 2]);
assert(reveals.some(round => round.yourResult.ballotStatus === 'not_submitted'));
assert.equal(fixtures.twoBotRevealFixture.yourResult.recognition.fraction, null);
assert.equal(fixtures.revealFixture.yourResult.totalGuessingPoints,
  fixtures.leaderboardFixture.entries.find(entry => entry.entryId === fixtures.sessionFixture.leaderboardEntryId).guessingPoints);
assert.equal(fixtures.unavailableFixture.ok, false);
console.log(`Shared fixtures checked: ${rounds.length} round views, all three compositions, private-field and scoring checks passed.`);
