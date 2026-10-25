/**
 * CONSENT GATE COPY: DEV-PREVIEW PLACEHOLDERS ONLY.
 *
 * The earlier playtest consent copy is stale and is deliberately NOT reused or
 * paraphrased here. Every string below is a marked placeholder that renders
 * with a hazard-striped "placeholder" treatment so it cannot be mistaken for
 * final copy. The repo owner replaces each slot with approved text (and bumps
 * POLICY_VERSION to whatever the backend accepts for that text) before this
 * ever ships to players. `isPlaceholder` drives the warning treatment.
 */
export const PENDING = "PENDING OWNER-APPROVED COPY";

export interface CopySlot {
  text: string;
  isPlaceholder: boolean;
}

const pending = (slot: string): CopySlot => ({ text: `${PENDING} — [${slot}]`, isPlaceholder: true });

/** The policy version the deployed backend currently validates. Owner-controlled. */
export const POLICY_VERSION = "playtest-v1";

export const consentCopy = {
  heading: pending("gate heading"),
  aiDisclosure: pending("counterpart may be a person or an AI"),
  processingNotice: pending("chat text is processed by AI services for replies"),
  conductRules: pending("conduct rules summary"),
  adultCheckbox: pending("eligibility / age confirmation checkbox label"),
  rulesCheckbox: pending("rules acceptance checkbox label"),
  continueButton: pending("accept button label"),
  trainingToggle: pending("optional training opt-in label (stored separately)"),
  trainingDetail: pending("what training opt-in does and how to withdraw"),
} satisfies Record<string, CopySlot>;
// END consent.ts
