import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image as AnimatedImage } from 'expo-image';
import { cast } from './cast';
import { animationDelay, nextAnimation, randomCharacterId, type AnimationMode } from './random';

import type { Phase, Verdict, State } from './game-state';
import { roundResult } from './round-result';
import { useVisibleHeight } from './viewport';
import { GAME_DEFAULTS } from '../../../shared/game-contract';
export const C = { bg: '#0b0a08', screen: '#14130f', surface: '#1c1a15', border: '#363229', gold: '#cfaf68', ivory: '#eee9dc', text: '#cec9bb', muted: '#a09a8c', green: '#95b69c', red: '#d26753' };
const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const previewTopic = 'Invent a terrible name for a very good restaurant.';

export function Label({ children, gold = false }: { children: React.ReactNode; gold?: boolean }) {
  return <Text style={[s.label, gold && { color: C.gold }]}>{children}</Text>;
}
export function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, pressed && { backgroundColor: '#322c1f' }, disabled && { opacity: .5 }]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
const RESULT_LOOK = {
  win: { color: C.green, background: '#1a241c', glyph: '✓' },
  loss: { color: C.red, background: '#2a1915', glyph: '×' },
  missed: { color: C.gold, background: '#242016', glyph: '—' },
} as const;

function ResultFeedback({ result, total, streak, compact }: { result: ReturnType<typeof roundResult>; total: number; streak?: number; compact: boolean }) {
  const { color, background, glyph } = RESULT_LOOK[result.kind];
  const [reduced, setReduced] = useState<boolean | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const played = useRef(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); }, () => { if (active) setReduced(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (reduced === null) return;
    if (reduced || played.current) { progress.setValue(1); shake.setValue(0); played.current = true; return; }
    played.current = true;
    const useNativeDriver = Platform.OS !== 'web';
    const animation = result.kind === 'win'
      ? Animated.spring(progress, { toValue: 1, friction: 6, tension: 70, useNativeDriver })
      : result.kind === 'loss'
        ? Animated.sequence([
          Animated.timing(progress, { toValue: 1, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver }),
          ...[8, -6, 4, -2, 0].map(toValue => Animated.timing(shake, { toValue, duration: 50, useNativeDriver })),
        ])
        : Animated.timing(progress, { toValue: 1, duration: 350, useNativeDriver });
    animation.start();
    return () => { animation.stop(); progress.setValue(1); shake.setValue(0); };
  }, [reduced, result.kind, progress, shake]);
  const opacity = progress.interpolate({ inputRange: [0, result.kind === 'missed' ? 1 : .3], outputRange: [0, 1], extrapolate: 'clamp' });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [result.kind === 'loss' ? 1.15 : result.kind === 'win' ? .9 : 1, 1] });
  return <View style={[s.resultArea, compact && { paddingVertical: 16 }]} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${result.label}. ${result.points} points this round. Total ${total}${streak !== undefined ? `, streak ${streak}` : ''}.`}>
    <Animated.View testID={`result-${result.kind}`} style={[s.resultBadge, { borderColor: color, backgroundColor: background, opacity, transform: [{ translateX: shake }, { scale }, { rotate: result.kind === 'loss' ? '-3deg' : '0deg' }] }]}>
      {result.kind === 'win' && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.resultRing, { borderColor: color, opacity: progress.interpolate({ inputRange: [0, .2, 1], outputRange: [0, .5, 0], extrapolate: 'clamp' }), transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }] }]} />}
      <View style={[s.resultMark, { borderColor: color }]}><Text style={{ color, fontSize: 24, fontWeight: '700' }}>{glyph}</Text></View>
      <Text style={[s.score, { color: result.kind === 'missed' ? C.muted : color, marginBottom: 0, fontSize: 48 }]}>{result.points}</Text>
    </Animated.View>
    <Text style={[s.label, { color, textAlign: 'center' }]}>{result.label}</Text>
    <Text style={[s.footnote, { marginTop: 8 }]}>TOTAL {total}{streak !== undefined ? ` · STREAK ${streak}` : ''}</Text>
  </View>;
}

function MotionPortrait({ faceId, mode }: { faceId: number; mode: AnimationMode }) {
  const face = cast.find(f => f.id === faceId) || cast[0];
  const [failed, setFailed] = useState(false);
  return <AnimatedImage source={failed ? face.poster : face[mode]} placeholder={face.poster} style={s.fill} contentFit="cover" cachePolicy="disk" autoplay useAppleWebpCodec={false} onError={() => setFailed(true)} />;
}
function useRandomAnimation(initial: AnimationMode, enabled: boolean) {
  const [mode, setMode] = useState<AnimationMode>(initial);
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => setMode(current => nextAnimation(current)), animationDelay());
    return () => clearTimeout(timer);
  }, [mode, enabled]);
  return [mode, setMode] as const;
}
export function Portrait({ faceId, name, mode = 'idle', small = false, autoSwitch = true, animate = true }: { faceId?: number; name: string; mode?: AnimationMode; small?: boolean; autoSwitch?: boolean; animate?: boolean }) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduced); const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced); return () => sub.remove(); }, []);
  const [randomMode] = useRandomAnimation(mode, autoSwitch && !reduced && animate);
  const activeMode = autoSwitch ? randomMode : mode;
  const face = cast.find(f => f.id === faceId);
  return <View accessibilityLabel={`${name}, ${activeMode}`} style={[s.portrait, small && s.thumb]}>
    {face && (reduced || !animate ? <Image source={face.poster} style={s.fill} /> : <MotionPortrait key={`${faceId}-${activeMode}`} faceId={face.id} mode={activeMode} />)}
    {!small && !!name && <View style={s.nameTag}><Label>{name.toUpperCase()}</Label></View>}
    {!small && !!name && activeMode === 'talk' && <Text style={s.wave}>▂▅▃▇▂▆▄▅▂▇▃▅</Text>}
  </View>;
}
export function Topic({ waiting = false, text }: { waiting?: boolean; text?: string }) {
  return <View style={s.topic}><Label gold>THIS ROUND'S QUESTION</Label><Text style={s.topicText}>{waiting ? 'A fresh question when the timer starts' : text ?? 'Loading this round’s question…'}</Text></View>;
}
export function Frame({ title, children, onMenu }: { title: string; children: React.ReactNode; onMenu?: () => void }) {
  const compact = useVisibleHeight() < 740;
  return <View style={[s.phone, compact && { padding: 16 }]}><View style={[s.header, compact && { marginBottom: 8 }]}><View style={s.live} /><Label>{title}</Label>{onMenu ? <Pressable accessibilityRole="button" accessibilityLabel="Menu: report, block or leave" onPress={onMenu} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}><Label>MENU</Label></Pressable> : <View style={{ width: 5 }} />}</View>{children}</View>;
}
export function RoundScreen({ state, phase, count = 3, busy = false, onPlay, onSend, onVote, onMenu }: { state: State; phase: Phase; count?: number; busy?: boolean; onPlay: () => void; onSend: (text: string) => Promise<boolean>; onVote: (v: Verdict) => void; onMenu?: () => void }) {
  const [text, setText] = useState('');
  const visibleHeight = useVisibleHeight();
  const desktop = useWindowDimensions().width >= 900;
  const compact = !desktop && visibleHeight < 740;
  const [showcaseId] = useState(randomCharacterId);
  const messages = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const partner = state.partner || state.reveal?.partner;
  const left = Math.max(0, Math.ceil((((phase === 'guess' ? state.guessEndsAt : state.endsAt) || 0) - (state.now || 0)) / 1000));
  const timer = `${Math.floor(left / 60)}:${String(Math.ceil(left % 60)).padStart(2, '0')}`;
  const submit = async () => { if (text.trim() && await onSend(text.trim())) setText(''); };
  const result = state.reveal ? roundResult(state.reveal) : undefined;
  const title = phase === 'chat' ? `ROUND · ${timer}` : phase === 'guess' ? `VERDICT · ${timer}` : phase === 'reveal' ? 'ROUND OVER' : 'YOUR ROOM';
  return <Frame title={title} onMenu={onMenu}>
    {(phase === 'idle' || phase === 'waiting') && <>
      <Text style={s.heading}>Your room</Text><Text style={s.subtitle}>Two voices. Convince them you're real.</Text>
      <View style={[s.singlePortrait, compact && { maxWidth: visibleHeight < 600 ? 88 : 128, marginBottom: 8 }]}><Portrait faceId={partner?.faceId || showcaseId} name={partner?.name || 'A stranger'} /></View>
      {phase === 'idle' ? <><Button title="Enter room" onPress={onPlay} disabled={busy} /><Text style={s.subtitle}>Someone here might be a machine.</Text><Topic waiting /></> : <><View style={[s.countArea, compact && { minHeight: 100 }]}><Text accessibilityLiveRegion="polite" style={[s.count, compact && { fontSize: 80, lineHeight: 90 }]}>{count}</Text><Text style={s.subtitle}>Starting together…</Text></View><Topic waiting /></>}
    </>}
    {phase === 'chat' && <>
      <View accessibilityLabel={`${Math.ceil(left)} seconds remaining`} style={s.track}><View style={[s.progress, { width: `${Math.min(100, left * 1000 / (state.roundMs || GAME_DEFAULTS.chatMs) * 100)}%` }]} /></View>
      <View style={[{ flex: 1, minHeight: 0 }, desktop && { flexDirection: 'row', gap: 32 }]}>
        <View style={desktop ? { width: 280, gap: 12 } : undefined}>
      {visibleHeight >= 440 && <View style={[s.singlePortrait, desktop && { width: 260, maxWidth: 260 }, compact && { maxWidth: visibleHeight < 600 ? 88 : 128, marginBottom: 8 }]}><Portrait faceId={partner?.faceId} name={partner?.name || 'Stranger'} mode={state.messages?.at(-1)?.me === false ? 'talk' : 'idle'} /></View>}
      <Topic text={state.topic} />
        </View>
        <View style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
      <ScrollView ref={messages} style={[s.messages, { minHeight: 0 }, compact && { marginTop: 8 }]} contentContainerStyle={{ gap: 15, paddingBottom: 20 }} onContentSizeChange={() => messages.current?.scrollToEnd({ animated: false })}>
        {!state.messages?.length && <Text style={s.subtitle}>Break the silence. Ask them anything.</Text>}
        {state.messages?.map((m, i) => <View key={i} accessible accessibilityLabel={`${m.me ? 'You' : partner?.name}: ${m.text}`}><Label>{m.me ? 'YOU' : partner?.name.toUpperCase()}</Label><Text style={[s.body, desktop && { fontSize: 15, lineHeight: 23 }, m.me && { fontWeight: '600' }]}>{m.text}</Text></View>)}
      </ScrollView>
      <View style={s.composer}><TextInput accessibilityLabel="Your message" style={s.input} placeholder="Convince them…" placeholderTextColor={C.muted} value={text} onChangeText={setText} maxLength={400} onSubmitEditing={submit} returnKeyType="send" /><Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={busy || !text.trim()} onPress={submit} style={s.send}><Label>SEND</Label></Pressable></View>
        </View>
      </View>
    </>}
    {phase === 'guess' && <>
      <Text style={s.heading}>Who's human?</Text><Text style={s.subtitle}>Human or machine? Choose before the timer ends.</Text>
      <View style={s.ticks}>{Array.from({ length: 8 }, (_, i) => <View key={i} style={[s.tick, { opacity: i < left / ((state.voteMs ?? GAME_DEFAULTS.votingMs) / 1000) * 8 ? 1 : .2 }]} />)}</View>
      <View style={s.voteCard}><Portrait small faceId={partner?.faceId} name={partner?.name || 'Stranger'} /><View style={{ flex: 1, gap: 6 }}><Text style={s.name}>{partner?.name}</Text><Label>{state.guessed ? 'VOTE LOCKED' : 'YOUR CALL'}</Label></View></View>
      <View accessibilityRole="radiogroup" style={s.voteButtons}>{(['human', 'ai'] as const).map(v => <Pressable key={v} accessibilityRole="radio" aria-checked={state.guessed === v} accessibilityLabel={v === 'ai' ? 'Machine' : 'Human'} accessibilityState={{ checked: state.guessed === v, disabled: !!state.guessed || busy }} disabled={!!state.guessed || busy} onPress={() => onVote(v)} style={[s.voteButton, state.guessed === v && { backgroundColor: v === 'human' ? C.green : C.red }]}><Text style={[s.voteText, state.guessed === v && { color: C.bg }]}>{v === 'ai' ? 'MACHINE' : 'HUMAN'}</Text></Pressable>)}</View>
      <Text style={s.footnote}>{state.guessed ? 'LOCKED IN. REVEALING WHEN VOTING FINISHES…' : 'CHOOSE BEFORE THE TIMER ENDS. NO VOTE SCORES ZERO.'}</Text>
    </>}
    {phase === 'reveal' && state.reveal && <>
      <Text style={[s.heading, { color: RESULT_LOOK[result!.kind].color }]}>{result!.title}</Text><Text style={s.subtitle}>{result!.detail}</Text>
      <View style={[s.voteCard, { borderColor: RESULT_LOOK[result!.kind].color + '66' }]}><Portrait small faceId={partner?.faceId} name={partner?.name || 'Stranger'} mode={result!.kind === 'win' ? 'smile' : 'idle'} autoSwitch={false} /><View style={{ flex: 1, gap: 7 }}><Text style={s.name}>{partner?.name}</Text><Label>YOU SAID {state.reveal.yourGuess === 'human' ? 'HUMAN' : state.reveal.yourGuess === 'ai' ? 'MACHINE' : 'NOTHING'}</Label></View><Text style={[s.stamp, { color: state.reveal.truth === 'human' ? C.green : C.red, borderColor: state.reveal.truth === 'human' ? C.green : C.red }]}>{state.reveal.truth === 'human' ? 'HUMAN' : 'MACHINE'}</Text></View>
      <Text style={[s.body, { marginTop: 20 }]}>{state.reveal.judgeOnPartner?.tell || (state.reveal.truth === 'ai' ? 'A machine was behind that voice.' : 'A real person was on the other side.')}</Text>
      <ResultFeedback key={state.roomId} result={result!} total={state.score} streak={state.reveal.streak} compact={compact} />
      <Label>RECOGNITION · HUMANS WHO CALLED YOU HUMAN</Label><View style={[s.track, { marginTop: 8, marginBottom: 20 }]}><View style={[s.progress, { backgroundColor: C.green, width: `${(state.reveal.recognition?.fraction ?? 0) * 100}%` }]} /></View>
      {state.reveal.recognition?.fraction == null && <Text style={s.subtitle}>Unrated. No human judged you this round.</Text>}
      <Button title="Next room" onPress={onPlay} disabled={busy} />
    </>}
  </Frame>;
}

function CastCard({ face, visible }: { face: typeof cast[number]; visible: boolean }) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduced); const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced); return () => sub.remove(); }, []);
  const [mode, setMode] = useRandomAnimation('idle', !reduced && visible);
  return <View style={{ width: 230, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#2b2d33', backgroundColor: '#191a1f' }}>
    <View style={{ height: 230 }}><Portrait faceId={face.id} name="" mode={mode} autoSwitch={false} animate={visible} /></View>
    <View style={{ padding: 12, gap: 10 }}><Text style={{ color: '#e9e9eb', fontSize: 15, fontWeight: '700' }}>Face {String(face.id).padStart(2, '0')} · {face.signature}</Text><Text style={{ color: '#b7b8c0', fontSize: 12, lineHeight: 18, minHeight: 40 }}>{face.description}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>{(['idle', 'talk', 'smile'] as const).map(m => <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: mode === m }} onPress={() => setMode(m)} style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 7, borderColor: mode === m ? '#c3b0ff' : '#40434b', backgroundColor: mode === m ? '#403858' : '#24262c' }}><Text style={{ color: '#e9e9eb', fontSize: 12 }}>{m[0].toUpperCase() + m.slice(1)}</Text></Pressable>)}</View>
    </View>
  </View>;
}
export function CastGallery() {
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.floor((Math.min(width, 1540) - 32) / 246));
  const [visible, setVisible] = useState<Set<number>>(() => new Set());
  const viewability = useRef({ itemVisiblePercentThreshold: 10 });
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item: typeof cast[number] }[] }) => setVisible(new Set(viewableItems.map(item => item.item.id))));
  return <FlatList key={columns} data={cast} numColumns={columns} keyExtractor={face => String(face.id)} extraData={visible} initialNumToRender={columns * 2} windowSize={3} maxToRenderPerBatch={columns} viewabilityConfig={viewability.current} onViewableItemsChanged={onViewableItemsChanged.current} contentContainerStyle={{ padding: 24, alignSelf: 'center', gap: 16 }} columnWrapperStyle={columns > 1 ? { gap: 16 } : undefined} ListHeaderComponent={<><Text style={[s.previewTitle, { textAlign: 'center' }]}>Almost Human</Text><Text style={s.subtitle}>25 characters · Idle / Talk / Smile</Text></>} renderItem={({ item }) => <CastCard face={item} visible={visible.has(item.id)} />} />;
}
export const previewState: State = { phase: 'chat', topic: previewTopic, roundMs: GAME_DEFAULTS.chatMs, voteMs: GAME_DEFAULTS.votingMs, name: 'Hollow', faceId: 14, partner: { name: 'Ink Fox', faceId: 7 }, score: 300, right: 9, played: 11, now: 0, endsAt: 57000, guessEndsAt: 9000, messages: [{ me: false, text: '“Soup Crimes.” Best bisque in town, legally questionable.' }, { me: true, text: 'Grandma’s Garage. It’s Italian. Don’t ask about the oil.' }, { me: false, text: 'lol no?? are YOU real' }, { me: true, text: 'As someone who also eats food, I agree. Garage.' }], reveal: { partner: { name: 'Ink Fox', faceId: 7 }, truth: 'human', yourGuess: 'human', correct: true, earnedPoints: 100, score: 300, judgeOnYou: { verdict: 'human', tell: 'The oddly specific joke gave you away.' } } };
export const s = StyleSheet.create({
  resultArea: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  resultBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, borderWidth: 1, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10, minWidth: 180, marginBottom: 6 },
  resultMark: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  resultRing: { borderWidth: 1, borderRadius: 12 },
  root: { flex: 1, backgroundColor: C.bg }, appColumn: { minHeight: 0, width: '100%', maxWidth: 420, flex: 1, alignSelf: 'center', paddingTop: Platform.OS === 'ios' ? 54 : 24, paddingBottom: Platform.OS === 'ios' ? 30 : 20 },
  phone: { backgroundColor: C.screen, flex: 1, padding: 24, borderWidth: 1, borderColor: '#28251e', borderRadius: 30, minHeight: 0 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 25, minHeight: 20 }, live: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#a34532' }, label: { fontFamily: mono, color: C.muted, fontSize: 10, letterSpacing: 1.2, lineHeight: 15 }, heading: { fontSize: 22, fontWeight: '600', color: C.ivory, textAlign: 'center', letterSpacing: .2 }, subtitle: { color: C.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8, marginBottom: 16 },
  singlePortrait: { width: '62%', maxWidth: 190, alignSelf: 'center', flexDirection: 'row', marginBottom: 16 }, portraitRow: { flexDirection: 'row', gap: 10, marginBottom: 16 }, portrait: { flex: 1, aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: '#1c1b16', borderWidth: 1, borderColor: '#4c4430' }, thumb: { flex: 0, flexBasis: 48, flexShrink: 0, width: 48, height: 54, aspectRatio: undefined, borderRadius: 5 }, fill: { width: '100%', height: '100%' }, nameTag: { position: 'absolute', left: 6, right: 4, bottom: 6, backgroundColor: '#0b0a08b0', paddingHorizontal: 4 }, wave: { position: 'absolute', right: 8, bottom: 21, color: C.ivory, letterSpacing: 1, fontSize: 22 },
  countArea: { flex: 1, minHeight: 190, justifyContent: 'center', alignItems: 'center' }, count: { fontSize: 120, lineHeight: 140, color: C.ivory, fontWeight: '700', letterSpacing: -8 }, topic: { backgroundColor: '#282313', borderColor: '#66522a', borderWidth: 1, borderRadius: 10, padding: 12, gap: 5 }, topicText: { color: '#e1c37d', fontSize: 13, lineHeight: 18 }, track: { height: 3, backgroundColor: '#353229', overflow: 'hidden', marginBottom: 12 }, progress: { height: '100%', backgroundColor: C.gold }, messages: { flex: 1, marginTop: 20, minHeight: 160 }, body: { color: C.text, fontSize: 13, lineHeight: 20, marginTop: 4 }, composer: { flexDirection: 'row', minHeight: 46, borderColor: C.border, borderWidth: 1, borderRadius: 10, backgroundColor: '#11100c' }, input: { flex: 1, color: C.ivory, padding: 12, fontSize: 16 }, send: { minWidth: 54, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderLeftWidth: 1, borderColor: C.border },
  ticks: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginBottom: 24 }, tick: { width: 18, height: 3, backgroundColor: C.gold }, voteCard: { backgroundColor: C.surface, borderRadius: 12, padding: 10, borderColor: '#2d2920', borderWidth: 1, flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 78, marginTop: 10 }, name: { color: C.ivory, fontWeight: '600', fontSize: 13 }, voteButtons: { flexDirection: 'row', gap: 8, marginTop: 12 }, voteButton: { flex: 1, minHeight: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 7, borderWidth: 1, borderColor: C.border }, voteText: { fontFamily: mono, fontSize: 11, color: C.ivory, letterSpacing: 1 }, footnote: { color: C.muted, fontFamily: mono, fontSize: 8, letterSpacing: 1.1, textAlign: 'center', lineHeight: 15, marginTop: 16 }, stamp: { fontFamily: mono, fontSize: 9, letterSpacing: 1, paddingVertical: 4, paddingHorizontal: 6, borderWidth: 1, borderRadius: 2, transform: [{ rotate: '-6deg' }] }, score: { color: C.gold, fontSize: 40, fontWeight: '700', marginBottom: 6 }, button: { borderWidth: 1, borderColor: '#403a2d', borderRadius: 9, backgroundColor: '#24211a', minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }, buttonText: { color: C.ivory, fontWeight: '600', fontSize: 13, letterSpacing: 1 }, brand: { color: C.ivory, fontSize: 54, fontWeight: '700', letterSpacing: -3, lineHeight: 57, marginTop: 10 }, tagline: { color: C.gold, fontSize: 15, marginTop: 14, marginBottom: 28 }, joinInput: { color: C.ivory, borderBottomWidth: 1, borderColor: C.border, paddingVertical: 14, marginBottom: 22, fontSize: 14 }, disclosure: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 20 }, error: { color: '#ef9b86', padding: 12, fontSize: 12 }, preview: { padding: 32, alignItems: 'center', gap: 24 }, previewIntro: { alignItems: 'center' }, previewTitle: { color: C.ivory, fontSize: 28, fontWeight: '600', marginTop: 10 }, previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, justifyContent: 'center' }, previewColumn: { width: 290, height: 730 }, caption: { color: C.muted, textAlign: 'center', fontFamily: mono, fontSize: 10, paddingTop: 14 },
});
