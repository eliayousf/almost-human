/** Development playtest notice. This is not a production-launch policy. */
export interface CopySlot { text: string; isPlaceholder: boolean }
const copy = (text: string): CopySlot => ({ text, isPlaceholder: false });

// Existing backend policy contract; no automatic acceptance or training opt-in.
export const POLICY_VERSION = "playtest-v1";
export const consentCopy = {
  heading: copy("Join the playtest"),
  aiDisclosure: copy("Your conversation partners may be people or AI. Guess who is human at the end of the round."),
  processingNotice: copy("Messages are stored and processed by the game and AI services to provide replies. Use invented, nonpersonal text only in this development playtest."),
  conductRules: copy("Be respectful. Do not share personal or contact details, links, or harmful content. You can leave, block or report a participant at any time."),
  adultCheckbox: copy("I am 18 or older."),
  rulesCheckbox: copy("I agree to play respectfully and use invented, nonpersonal text."),
  continueButton: copy("Start player"),
  trainingToggle: copy("Optional: use my votes to improve bot style"),
  trainingDetail: copy("Your votes may label bot replies, and bot-written lines may be reused as style examples. Turning this off stops future use of your votes. This does not mean a trained adapter is serving the game."),
} satisfies Record<string, CopySlot>;
