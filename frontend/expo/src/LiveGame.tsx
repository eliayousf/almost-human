import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { ReportReason } from '../../../shared/game-contract';
import { consentCopy } from '../../src/copy/consent';
import { chatTrainingNotice, playtestTerms, voteFeedbackSummary } from '../../../shared/playtest-policy';
import { useLiveGame } from './game';
import { randomCharacterId } from './random';
import { useVisibleHeight } from './viewport';
import { Button, C, Frame, Label, Portrait, RoundScreen, s } from './screens';

function Check({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="checkbox" aria-checked={checked} accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onChange}
    style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12, minHeight: 44 }}>
    <Text style={{ color: C.gold, fontSize: 20 }}>{checked ? '☑' : '☐'}</Text><Text style={[s.body, { flex: 1 }]}>{label}</Text>
  </Pressable>;
}

function Terms({ close, controller }: { close: () => void; controller: ReturnType<typeof useLiveGame> }) {
  const visibleHeight = useVisibleHeight();
  return <Modal transparent animationType="fade" onRequestClose={close}>
    <View style={{ flex: 1, backgroundColor: '#000b', justifyContent: 'center', padding: 20 }}>
      <ScrollView style={{ maxHeight: Math.max(160, visibleHeight - 40) }} contentContainerStyle={{ padding: 20, gap: 14, backgroundColor: C.screen, borderRadius: 16, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
        <Text style={s.heading}>Almost Human playtest terms</Text>
        <Text style={s.disclosure}>Updated 25 October 2026</Text>
        {playtestTerms.map(section => <View key={section.title}><Text style={[s.body, { color: C.gold, fontWeight: '600' }]}>{section.title}</Text><Text style={s.body}>{section.text}</Text></View>)}
        {controller.session?.chatTrainingOptIn !== undefined && <>
          <Text style={[s.body, { color: C.gold, fontWeight: '600' }]}>Model training (optional)</Text>
          <Check label={chatTrainingNotice} checked={controller.session.chatTrainingOptIn} disabled={controller.busy || Boolean(controller.roundId) && !controller.session.chatTrainingOptIn} onChange={() => { void controller.chatTraining(!controller.session!.chatTrainingOptIn); }} />
          {controller.error ? <Text accessibilityRole="alert" style={s.error}>{controller.error}</Text> : null}
        </>}
        <Button title="Close terms" onPress={close} />
      </ScrollView>
    </View>
  </Modal>;
}

function TermsLink({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Read playtest terms" onPress={onPress} style={{ minHeight: 44, justifyContent: 'center' }}>
    <Text style={[s.disclosure, { color: C.gold, textDecorationLine: 'underline', marginTop: 0 }]}>Terms & conditions</Text>
  </Pressable>;
}

export function PlayerHeader({ alias, points, onTerms }: { alias: string; points: number; onTerms: () => void }) {
  return <View style={{ paddingHorizontal: 12, marginBottom: 8 }}><Label>PLAYING AS {alias} · {points} POINTS</Label><TermsLink onPress={onTerms} /></View>;
}

function Welcome({ busy, onAccept, updating = false, onTerms }: { busy: boolean; onAccept: (adult: boolean, rules: boolean) => Promise<void>; updating?: boolean; onTerms: () => void }) {
  const [face] = useState(randomCharacterId);
  const [adult, setAdult] = useState(updating);
  const [rules, setRules] = useState(false);
  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Frame title="ALMOST HUMAN">
    <Text style={s.brand}>Almost{'\n'}Human<Text style={{ color: C.gold }}>.</Text></Text>
    <Text style={s.tagline}>Every voice has a tell.</Text>
    <View style={s.singlePortrait}><Portrait faceId={face} name="Human or machine?" /></View>
    <Text style={[s.body, { marginVertical: 20 }]}>One stranger. One minute. A conversation that might be a little too convincing.</Text>
    <Text style={s.disclosure}>{consentCopy.aiDisclosure.text} {consentCopy.processingNotice.text}</Text>
    <Text style={s.disclosure}>{consentCopy.conductRules.text}</Text>
    {updating && <Text style={[s.body, { color: C.gold, marginTop: 16 }]}>Please review the updated playtest terms. Your alias and score stay the same.</Text>}
    <Text style={s.disclosure}>{voteFeedbackSummary}</Text>
    <TermsLink onPress={onTerms} />
    {!updating && <Check label={consentCopy.adultCheckbox.text} checked={adult} onChange={() => setAdult(!adult)} />}
    <Check label="I agree to the playtest terms, including use of my votes for bot improvement." checked={rules} onChange={() => setRules(!rules)} />
    <Button title={busy ? 'Opening the door…' : updating ? 'Accept updated terms' : 'Step inside →'} disabled={busy || !adult || !rules} onPress={() => { void onAccept(adult, rules); }} />
    <Text style={s.disclosure}>Vote feedback is a standard part of playing.</Text>
  </Frame></ScrollView>;
}

function Safety({ controller, close }: { controller: ReturnType<typeof useLiveGame>; close: () => void }) {
  const visibleHeight = useVisibleHeight();
  const [reason, setReason] = useState<ReportReason>('other');
  const [detail, setDetail] = useState('');
  const [sent, setSent] = useState(false);
  const choices: ReportReason[] = ['harassment', 'personal_information', 'unsafe_content', 'spam', 'other'];
  return <Modal transparent animationType="fade" onRequestClose={close}>
    <View style={{ flex: 1, backgroundColor: '#000b', justifyContent: 'center', padding: 20 }}>
      <ScrollView style={{ maxHeight: Math.max(160, visibleHeight - 40) }} contentContainerStyle={{ padding: 20, gap: 12, backgroundColor: C.screen, borderRadius: 16, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
        <Text style={s.heading}>Room controls</Text>
        <Text style={s.body}>Report {controller.partner?.alias ?? 'participant'}</Text>
        {choices.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value.replaceAll('_', ' ')} accessibilityState={{ checked: reason === value }} onPress={() => setReason(value)} style={{ padding: 10, minHeight: 44 }}><Text style={[s.body, { color: value === reason ? C.gold : C.text }]}>{value.replaceAll('_', ' ')}</Text></Pressable>)}
        <TextInput accessibilityLabel="Report details (optional)" placeholder="Optional details" placeholderTextColor={C.muted} value={detail} onChangeText={setDetail} maxLength={500} style={[s.input, { borderWidth: 1, borderColor: C.border }]} />
        {sent ? <Text accessibilityRole="status" style={s.body}>Report recorded.</Text> : <Button title="Send report" disabled={controller.busy} onPress={() => { void controller.report(reason, detail).then(ok => { if (ok) setSent(true); }); }} />}
        {controller.error ? <Text accessibilityRole="alert" style={s.error}>{controller.error}</Text> : null}
        <Button title="Block and leave" disabled={controller.busy} onPress={() => { void controller.block().then(ok => { if (ok) close(); }); }} />
        <Button title="Leave round" disabled={controller.busy} onPress={() => { void controller.leave().then(close); }} />
        {controller.session?.chatTrainingOptIn && <Button title="Stop new chat-training uploads" disabled={controller.busy} onPress={() => { void controller.chatTraining(false); }} />}
        <Button title="Close" onPress={close} />
      </ScrollView>
    </View>
  </Modal>;
}

export function LiveGame() {
  const controller = useLiveGame();
  const compact = useVisibleHeight() < 740;
  const desktop = useWindowDimensions().width >= 900;
  const [menu, setMenu] = useState(false);
  const [terms, setTerms] = useState(false);
  const { connection, session, state, busy, error } = controller;
  let content: React.ReactNode;
  if (connection.status === 'error') {
    content = <Frame title="ALMOST HUMAN"><Text style={s.heading}>Can't reach the game</Text><Text style={s.subtitle}>{connection.error}</Text><Button title="Retry" onPress={connection.retry} /></Frame>;
  } else if (controller.loading) {
    content = <ActivityIndicator color={C.gold} accessibilityLabel="Connecting to your room" />;
  } else if (controller.needsAcceptance) {
    content = <Welcome busy={busy} onAccept={controller.accept} updating={controller.updatingTerms} onTerms={() => setTerms(true)} />;
  } else if (controller.queueing) {
    content = <Frame title="WAITING"><Text style={s.heading}>{controller.queueClosed ? 'Queue ended' : 'Finding your stranger…'}</Text><Text style={s.subtitle}>The room starts when a partner is ready. You can cancel at any time.</Text><Button title={controller.queueClosed ? 'Back to lobby' : 'Cancel'} disabled={busy} onPress={() => { if (controller.queueClosed) controller.toLobby(); else void controller.cancelQueue(); }} /></Frame>;
  } else if (!state) {
    content = <Frame title="ROOM UNAVAILABLE"><Text style={s.heading}>This room is unavailable</Text>{controller.roundId && <Button title="Leave old room" disabled={busy} onPress={() => { void controller.leave().then(controller.toLobby); }} />}</Frame>;
  } else if (state.phase === 'cancelled') {
    content = <Frame title="ROUND ENDED"><Text style={s.heading}>Round ended</Text><Text style={s.subtitle}>{state.cancellation}</Text><Button title="Back to lobby" onPress={controller.toLobby} /></Frame>;
  } else {
    content = <>
      {state.phase === 'idle' && session && <PlayerHeader alias={session.leaderboardAlias} points={session.totalGuessingPoints} onTerms={() => setTerms(true)} />}
      <RoundScreen state={state} phase={state.phase} count={controller.seconds ?? 0} busy={busy}
        onPlay={() => { void controller.play(); }} onSend={controller.send} onVote={value => { void controller.vote(value); }}
        onMenu={controller.roundId && state.phase !== 'reveal' ? () => setMenu(true) : undefined} />
    </>;
  }
  if (state?.phase !== 'chat' && !controller.needsAcceptance) {
    content = <ScrollView contentContainerStyle={{ flexGrow: 1 }}>{content}</ScrollView>;
  }
  return <View testID="live-game-column" style={[s.appColumn, desktop && { maxWidth: state?.phase === 'chat' ? 1040 : 560 }, compact && { paddingTop: 8, paddingBottom: 8 }]}>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {content}
    {menu && <Safety controller={controller} close={() => setMenu(false)} />}
    {terms && <Terms close={() => setTerms(false)} controller={controller} />}
  </View>;
}
