import type { Topic } from "../../shared/game-contract";
import { TOPICS } from "./lib";

export const RECENT_TOPIC_LIMIT = 20;

function combinations(family: string, first: readonly string[], second: readonly string[], question: (a: string, b: string) => string): Topic[] {
  return first.flatMap((a, i) => second.map((b, j) => ({ id: `${family}:${i}:${j}`, text: question(a, b) })));
}

// Generate bounded, reviewed combinations on the server. No network request or
// player text is needed, so a question is ready as soon as a room is matched.
export const QUESTIONS: readonly Topic[] = [
  ...TOPICS.map(topic => ({ ...topic, id: `classic:${topic.id}` })),
  ...combinations("shop",
    ["café", "cinema", "gym", "hotel", "museum", "bookshop", "theme park", "bakery"],
    ["ghosts", "time travellers", "retired superheroes", "robots on holiday", "dramatic cats", "sleepy dragons", "pirates", "visiting aliens"],
    (place, guests) => `You're opening a ${place} for ${guests}. What's its ridiculous name?`),
  ...combinations("power",
    ["fly", "turn invisible", "talk to animals", "teleport", "pause time", "breathe underwater", "see the future", "read minds"],
    ["only on Tuesdays", "only while singing", "only for ten seconds", "only when nobody is watching", "only before breakfast", "only while wearing a cape", "only in the rain", "only after doing a little dance"],
    (power, catchText) => `You can ${power}, but ${catchText}. What's the first thing you try?`),
  ...combinations("pitch",
    ["a self-stirring teacup", "a pillow with an alarm", "a waterproof notebook", "a pocket-sized cloud", "a talking toaster", "a bicycle with square wheels", "a hat that predicts the weather", "a robot that tells terrible jokes"],
    ["a dragon", "a medieval knight", "a very serious penguin", "an astronaut", "a ghost", "a pirate captain", "a sleepy giant", "a time traveller"],
    (product, customer) => `How would you sell ${product} to ${customer} in one sentence?`),
  ...combinations("rule",
    ["a library", "a space station", "a supermarket", "a tiny island", "a school for wizards", "a railway station", "a zoo", "a castle"],
    ["everyone whispers", "all doors sing", "the floor is a trampoline", "every sign is a riddle", "the furniture moves at night", "it's always midnight", "everyone wears a costume", "gravity switches off for a minute"],
    (place, twist) => `You're in charge of ${place} where ${twist}. What's your first rule?`),
];

export function chooseQuestion(histories: readonly (readonly string[])[], random = Math.random): Topic {
  const recent = new Set(histories.flatMap(history => history.slice(-RECENT_TOPIC_LIMIT)));
  const lastFamilies = new Set(histories.flatMap(history => history.length ? [history.at(-1)!.split(":")[0]] : []));
  const unseen = QUESTIONS.filter(question => !recent.has(question.id));
  const differentFamily = unseen.filter(question => !lastFamilies.has(question.id.split(":")[0]));
  const choices = differentFamily.length ? differentFamily : unseen.length ? unseen : QUESTIONS;
  return choices[Math.floor(random() * choices.length)];
}
