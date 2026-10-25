/** Product terms versions. Acceptance is not labelled as a GDPR lawful basis. */
export const LEGACY_PLAYTEST_POLICY = "playtest-v1";
export const VOTE_FEEDBACK_TERMS_VERSION = "playtest-v2-vote-feedback";
export const voteFeedbackSummary = "Your Human/AI guesses help us evaluate AI players and improve bot replies. We may reuse bot-written replies as style examples as part of the game.";
export const playtestTerms = [
  { title: "The game", text: "Almost Human is an anonymous guessing game for adults. Conversation partners may be people or AI. Roles are revealed at the end of each round." },
  { title: "Votes and bot improvement", text: voteFeedbackSummary + " This applies to new votes after you accept these terms. The vote-feedback feature uses your guesses and bot-written replies; it does not grant permission to import your chat messages as human-authored training examples." },
  { title: "Messages and conduct", text: "Messages are stored and processed by the game and AI services to provide replies. This is a development playtest: use invented, nonpersonal text. Be respectful and do not share contact details, links or harmful content." },
  { title: "Your controls", text: "You can leave a round, block a participant or send a private report. Leaving a round early awards no new points. Missing a vote earns zero for that vote." },
  { title: "Playtest limits", text: "This is an experimental playtest. The service may be interrupted and rounds may be cancelled." },
] as const;

export function needsCurrentTerms(session: { policyVersion?: string } | null): boolean {
  return session !== null && session.policyVersion !== VOTE_FEEDBACK_TERMS_VERSION;
}
