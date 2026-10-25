/**
 * FIXTURE-ONLY 2-seat composition (you + one stranger), derived client-side
 * from the synthetic shared fixtures. The live backend currently seats 2-5
 * participants; this file does not and cannot enforce pairing. Strict 1v1
 * matchmaking is a pending backend change owned by the repo owner.
 */
import {
  chatFixture, countdownFixture, leaderboardFixture, sessionFixture,
} from "@game/fixtures";
import type { Seat } from "@game/game-contract";

const selfId = countdownFixture.selfId;
const self = countdownFixture.participants.find(seat => seat.id === selfId)!;
const stranger = countdownFixture.participants.find(seat => seat.id !== selfId)!;

export const fixtureSeats: readonly Seat[] = [self, stranger];
export const fixtureSelfId = selfId;
export const fixtureStrangerId = stranger.id;
export const fixtureTopic = chatFixture.topic;
export const fixtureSession = sessionFixture;
export const fixtureLeaderboard = leaderboardFixture;

/** Synthetic lines the scripted stranger "lands", in order. Never real chats. */
export const fixtureStrangerLines: readonly string[] = [
  ...chatFixture.messages.filter(message => message.senderId === stranger.id).map(message => message.text),
  "ok but Mild Food Poisoning has weirdly strong michelin energy",
  "what's on the dessert menu there. be honest",
  "I'd book a table at a place called Regret. no notes",
  "wait are you stalling right now",
  "fine. last one: The Soup Situation. it's just one soup",
  "you're quieter than I expected",
];
