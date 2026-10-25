import { describe, expect, test } from "vitest";
import { chooseQuestion, QUESTIONS, RECENT_TOPIC_LIMIT } from "./topics";

describe("varied round questions", () => {
  test("generation produces distinct, bounded questions across the random range", () => {
    expect(QUESTIONS.length).toBeGreaterThan(250);
    expect(new Set(QUESTIONS.map(topic => topic.id)).size).toBe(QUESTIONS.length);
    expect(new Set(QUESTIONS.map(topic => topic.text)).size).toBe(QUESTIONS.length);
    for (let i = 0; i < QUESTIONS.length; i++) {
      const question = chooseQuestion([], () => (i + 0.5) / QUESTIONS.length);
      expect(question).toEqual(QUESTIONS[i]);
      expect(question.text.length).toBeLessThan(200);
      expect(question.text.endsWith("?")).toBe(true);
    }
  });

  test("excludes every player's recent questions and changes the previous question family", () => {
    const histories = Array.from({ length: 5 }, (_, i) => QUESTIONS.slice(i * RECENT_TOPIC_LIMIT, (i + 1) * RECENT_TOPIC_LIMIT).map(topic => topic.id));
    const recent = histories.flat();
    for (const random of [0, 0.2, 0.5, 0.9, 0.99999]) {
      const selected = chooseQuestion(histories, () => random);
      expect(recent).not.toContain(selected.id);
      expect(histories.map(history => history.at(-1)!.split(":")[0])).not.toContain(selected.id.split(":")[0]);
    }
  });

  test("replays stay varied even when the random source keeps returning the same value", () => {
    let recent: string[] = [];
    for (let i = 0; i < 100; i++) {
      const next = chooseQuestion([recent], () => 0);
      expect(recent).not.toContain(next.id);
      if (recent.length) expect(next.id.split(":")[0]).not.toBe(recent.at(-1)!.split(":")[0]);
      recent = [...recent, next.id].slice(-RECENT_TOPIC_LIMIT);
    }
  });
});
