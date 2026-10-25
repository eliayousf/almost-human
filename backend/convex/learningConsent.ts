import type { Doc } from './_generated/dataModel';
import { CHAT_TRAINING_POLICY_VERSION } from '../../shared/playtest-policy';

export function chatTrainingAllowed(player: Doc<'players'> | null): boolean {
  return player?.chatTrainingOptIn === true && player.chatTrainingPolicyVersion === CHAT_TRAINING_POLICY_VERSION
    && typeof player.chatTrainingAcceptedAt === 'number' && (player.chatTrainingConsentRevision ?? 0) > 0;
}

/** Match the grant that existed before the round; withdrawal/re-enabling never revives old uploads. */
export function roundTrainingAllowed(round: Doc<'rounds'>, players: (Doc<'players'> | null)[]): boolean {
  const grants = round.chatTrainingConsents;
  return round.chatTrainingAllowed === true && players.length > 0 && grants?.length === players.length
    && players.every(player => player?.trainingOptIn === true && chatTrainingAllowed(player) && grants.some(grant => grant.playerId === player!._id && grant.revision === player!.chatTrainingConsentRevision));
}

export function reviewCaptureAllowed(round: Doc<'rounds'>, turn: number, now: number): boolean {
  const grant = round.reviewCapture;
  return !!grant && Number.isFinite(now) && round.phase === 'chat'
    && now >= round.chatStartsAt && now < round.chatEndsAt && now < grant.expiresAt
    && grant.expiresAt <= round.chatEndsAt && grant.turn === turn;
}
