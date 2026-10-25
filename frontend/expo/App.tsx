import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image as AnimatedImage } from 'expo-image';
import { cast } from './src/cast';
import { animationDelay, nextAnimation, randomCharacterId, type AnimationMode } from './src/random';

type Phase = 'idle' | 'waiting' | 'chat' | 'guess' | 'reveal';
type Verdict = 'human' | 'ai';
type Message = { me: boolean; text: string };
type Partner = { name: string; faceId: number };
type State = { error?: string; phase: Phase; name: string; faceId?: number; score: number; played: number; right: number; roomId?: string; partner?: Partner; now?: number; endsAt?: number; roundMs?: number; guessEndsAt?: number; guessed?: Verdict; messages?: Message[]; reveal?: { partner: Partner; truth: Verdict; correct: boolean; yourGuess?: Verdict; score: number; judgeOnYou?: { verdict: Verdict; tell: string }; judgeOnPartner?: { tell: string } } };
const C = { bg: '#0b0a08', screen: '#14130f', surface: '#1c1a15', border: '#363229', gold: '#cfaf68', ivory: '#eee9dc', text: '#cec9bb', muted: '#a09a8c', green: '#95b69c', red: '#d26753' };
const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const API = process.env.EXPO_PUBLIC_API_URL || '';
const PREVIEW = Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('preview');
const GALLERY = Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('cast');
const topic = 'Invent a terrible name for a very good restaurant.';

function Label({ children, gold = false }: { children: React.ReactNode; gold?: boolean }) {
  return <Text style={[s.label, gold && { color: C.gold }]}>{children}</Text>;
}
function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, pressed && { backgroundColor: '#322c1f' }, disabled && { opacity: .5 }]}><Text style={s.buttonText}>{title}</Text></Pressable>;
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
function Portrait({ faceId, name, mode = 'idle', small = false, autoSwitch = true, animate = true }: { faceId?: number; name: string; mode?: AnimationMode; small?: boolean; autoSwitch?: boolean; animate?: boolean }) {
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
function Topic({ waiting = false }: { waiting?: boolean }) {
  return <View style={s.topic}><Label gold>TONIGHT'S TOPIC</Label><Text style={s.topicText}>{waiting ? 'Revealed when the timer starts' : topic}</Text></View>;
}
function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={s.phone}><View style={s.header}><View style={s.live} /><Label>{title}</Label><View style={{ width: 5 }} /></View>{children}</View>;
}
function RoundScreen({ state, phase, count = 3, busy = false, onPlay, onSend, onVote }: { state: State; phase: Phase; count?: number; busy?: boolean; onPlay: () => void; onSend: (text: string) => Promise<boolean>; onVote: (v: Verdict) => void }) {
  const [text, setText] = useState('');
  const [showcaseId] = useState(randomCharacterId);
  const messages = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const partner = state.partner || state.reveal?.partner;
  const left = Math.max(0, Math.ceil((((phase === 'guess' ? state.guessEndsAt : state.endsAt) || 0) - (state.now || 0)) / 1000));
  const timer = `${Math.floor(left / 60)}:${String(Math.ceil(left % 60)).padStart(2, '0')}`;
  const submit = async () => { if (text.trim() && await onSend(text.trim())) setText(''); };
  const title = phase === 'chat' ? `ROUND ${state.played + 1} · ${timer}` : phase === 'guess' ? `VERDICT · ${timer}` : phase === 'reveal' ? 'ROUND OVER' : `ROOM ${String(state.played + 1).padStart(2, '0')}`;
  return <Frame title={title}>
    {(phase === 'idle' || phase === 'waiting') && <>
      <Text style={s.heading}>Your room</Text><Text style={s.subtitle}>Two voices. Convince them you're real.</Text>
      <View style={s.singlePortrait}><Portrait faceId={partner?.faceId || showcaseId} name={partner?.name || 'A stranger'} /></View>
      <View style={s.countArea}><Text accessibilityLiveRegion="polite" style={s.count}>{phase === 'waiting' ? count : '?'}</Text><Text style={s.subtitle}>{phase === 'waiting' ? 'Finding your stranger…' : 'Someone here might be a machine.'}</Text></View>
      <Topic waiting /><View style={{ height: 18 }} />{phase === 'idle' && <Button title="Enter room" onPress={onPlay} disabled={busy} />}
    </>}
    {phase === 'chat' && <>
      <View accessibilityLabel={`${Math.ceil(left)} seconds remaining`} style={s.track}><View style={[s.progress, { width: `${Math.min(100, left * 1000 / (state.roundMs || 75000) * 100)}%` }]} /></View>
      <View style={s.singlePortrait}><Portrait faceId={partner?.faceId} name={partner?.name || 'Stranger'} mode={state.messages?.at(-1)?.me === false ? 'talk' : 'idle'} /></View>
      <Topic />
      <ScrollView ref={messages} style={s.messages} contentContainerStyle={{ gap: 15, paddingBottom: 20 }} onContentSizeChange={() => messages.current?.scrollToEnd({ animated: false })}>
        {!state.messages?.length && <Text style={s.subtitle}>Break the silence. Ask them anything.</Text>}
        {state.messages?.map((m, i) => <View key={i} accessible accessibilityLabel={`${m.me ? 'You' : partner?.name}: ${m.text}`}><Label>{m.me ? 'YOU' : partner?.name.toUpperCase()}</Label><Text style={[s.body, m.me && { fontWeight: '600' }]}>{m.text}</Text></View>)}
      </ScrollView>
      <View style={s.composer}><TextInput accessibilityLabel="Your message" style={s.input} placeholder="Convince them…" placeholderTextColor={C.muted} value={text} onChangeText={setText} maxLength={200} onSubmitEditing={submit} returnKeyType="send" /><Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={busy || !text.trim()} onPress={submit} style={s.send}><Label>SEND</Label></Pressable></View>
    </>}
    {phase === 'guess' && <>
      <Text style={s.heading}>Who's human?</Text><Text style={s.subtitle}>Call it for their voice. They're calling yours.</Text>
      <View style={s.ticks}>{Array.from({ length: 8 }, (_, i) => <View key={i} style={[s.tick, { opacity: i < left / 15 * 8 ? 1 : .2 }]} />)}</View>
      <View style={s.voteCard}><Portrait small faceId={partner?.faceId} name={partner?.name || 'Stranger'} /><View style={{ flex: 1, gap: 6 }}><Text style={s.name}>{partner?.name}</Text><Label>{state.guessed ? 'VOTE LOCKED' : 'YOUR CALL'}</Label></View></View>
      <View accessibilityRole="radiogroup" style={s.voteButtons}>{(['human', 'ai'] as const).map(v => <Pressable key={v} accessibilityRole="radio" accessibilityLabel={v === 'ai' ? 'Machine' : 'Human'} accessibilityState={{ checked: state.guessed === v, disabled: !!state.guessed || busy }} disabled={!!state.guessed || busy} onPress={() => onVote(v)} style={[s.voteButton, state.guessed === v && { backgroundColor: v === 'human' ? C.green : C.red }]}><Text style={[s.voteText, state.guessed === v && { color: C.bg }]}>{v === 'ai' ? 'MACHINE' : 'HUMAN'}</Text></Pressable>)}</View>
      <Text style={s.footnote}>{state.guessed ? 'LOCKED IN. WAITING FOR THE REVEAL…' : 'ALL VOTES LOCK WHEN THE TIMER HITS ZERO'}</Text>
    </>}
    {phase === 'reveal' && state.reveal && <>
      <Text style={s.heading}>Who was real?</Text><Text style={s.subtitle}>{state.reveal.correct ? 'You called it. But did they believe you?' : 'Some voices are harder to read.'}</Text>
      <View style={s.voteCard}><Portrait small faceId={partner?.faceId} name={partner?.name || 'Stranger'} mode="smile" /><View style={{ flex: 1, gap: 7 }}><Text style={s.name}>{partner?.name}</Text><Label>YOU SAID {state.reveal.yourGuess === 'human' ? 'HUMAN' : state.reveal.yourGuess === 'ai' ? 'MACHINE' : 'NOTHING'}</Label></View><Text style={[s.stamp, { color: state.reveal.truth === 'human' ? C.green : C.red, borderColor: state.reveal.truth === 'human' ? C.green : C.red }]}>{state.reveal.truth === 'human' ? 'HUMAN' : 'MACHINE'}</Text></View>
      <Text style={[s.body, { marginTop: 20 }]}>{state.reveal.judgeOnPartner?.tell || (state.reveal.truth === 'ai' ? 'A machine was behind that voice.' : 'A real person was on the other side.')}</Text>
      <View style={s.scoreArea}><Text style={s.score}>{state.reveal.correct ? '+1' : '+0'}</Text><Label gold>{state.reveal.correct ? 'GOOD READ' : 'THEY FOOLED YOU'}</Label><Text style={s.footnote}>TOTAL {state.score} · {state.right}/{state.played} RIGHT</Text></View>
      {state.reveal.judgeOnYou && <><Label>THE JUDGE READ YOU AS {state.reveal.judgeOnYou.verdict === 'ai' ? 'MACHINE · +1 BONUS' : 'HUMAN'}</Label><Text style={[s.body, { marginVertical: 10 }]}>{state.reveal.judgeOnYou.tell}</Text></>}
      <Label>RECOGNITION · HOW OFTEN YOU READ THEM RIGHT</Label><View style={[s.track, { marginTop: 8, marginBottom: 20 }]}><View style={[s.progress, { backgroundColor: C.green, width: `${state.played ? state.right / state.played * 100 : 0}%` }]} /></View>
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
function CastGallery() {
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.floor((Math.min(width, 1540) - 32) / 246));
  const [visible, setVisible] = useState<Set<number>>(() => new Set());
  const viewability = useRef({ itemVisiblePercentThreshold: 10 });
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item: typeof cast[number] }[] }) => setVisible(new Set(viewableItems.map(item => item.item.id))));
  return <FlatList key={columns} data={cast} numColumns={columns} keyExtractor={face => String(face.id)} extraData={visible} initialNumToRender={columns * 2} windowSize={3} maxToRenderPerBatch={columns} viewabilityConfig={viewability.current} onViewableItemsChanged={onViewableItemsChanged.current} contentContainerStyle={{ padding: 24, alignSelf: 'center', gap: 16 }} columnWrapperStyle={columns > 1 ? { gap: 16 } : undefined} ListHeaderComponent={<><Text style={[s.previewTitle, { textAlign: 'center' }]}>Almost Human</Text><Text style={s.subtitle}>25 characters · Idle / Talk / Smile</Text></>} renderItem={({ item }) => <CastCard face={item} visible={visible.has(item.id)} />} />;
}
const previewState: State = { phase: 'chat', name: 'Hollow', faceId: 14, partner: { name: 'Ink Fox', faceId: 7 }, score: 12, right: 9, played: 11, now: 0, endsAt: 67000, guessEndsAt: 9000, messages: [{ me: false, text: '“Soup Crimes.” Best bisque in town, legally questionable.' }, { me: true, text: 'Grandma’s Garage. It’s Italian. Don’t ask about the oil.' }, { me: false, text: 'lol no?? are YOU real' }, { me: true, text: 'As someone who also eats food, I agree. Garage.' }], reveal: { partner: { name: 'Ink Fox', faceId: 7 }, truth: 'human', yourGuess: 'human', correct: true, score: 12, judgeOnYou: { verdict: 'human', tell: 'The oddly specific joke gave you away.' } } };
export default function App() {
  const [showcaseId] = useState(randomCharacterId);
  const [id, setId] = useState<string | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(3);
  const inFlight = useRef(false);
  useEffect(() => { if (Platform.OS === 'web' && !PREVIEW) { try { setId(localStorage.getItem('ah-id')); } catch {} } }, []);
  const request = async (path: string, body?: object) => {
    if (Platform.OS !== 'web' && !API) throw new Error('Set EXPO_PUBLIC_API_URL to your game server before playing on a device.');
    const res = await fetch(`${API}${path}?id=${encodeURIComponent(id || '')}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
    if (res.status === 404 && id) { setId(null); setState(null); if (Platform.OS === 'web') { try { localStorage.removeItem('ah-id'); } catch {} } throw new Error('Your session expired. Enter a new room.'); }
    if (!res.ok) {
      const failure = await res.json().catch(() => ({}));
      throw new Error(failure.error || `Could not reach the room (${res.status}). Try again.`);
    }
    return res.json();
  };
  useEffect(() => {
    if (!id || PREVIEW) return;
    let active = true;
    const poll = async () => { if (inFlight.current) return; inFlight.current = true; try { const next = await request('/api/me'); if (active) { setState(next); setError(next.error || ''); } } catch (e) { if (active) setError((e as Error).message); } finally { inFlight.current = false; } };
    poll(); const timer = setInterval(poll, 700); return () => { active = false; clearInterval(timer); };
  }, [id]);
  useEffect(() => { if (state?.phase !== 'waiting') return; setCount(3); const t = setInterval(() => setCount(c => Math.max(1, c - 1)), 1000); return () => clearInterval(t); }, [state?.phase]);
  const act = async (path: string, body: object) => { if (busy) return null; setBusy(true); try { const result = await request(path, body); setError(''); return result; } catch (e) { setError((e as Error).message); return null; } finally { setBusy(false); } };
  const play = async () => { const next = await act('/api/play', { mode: 'mystery' }); if (next) setState(next); };
  const vote = async (verdict: Verdict) => { const result = await act('/api/guess', { verdict }); if (result?.ok) setState(old => old ? { ...old, guessed: verdict } : old); };
  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><StatusBar style="light" />
    {GALLERY ? <CastGallery /> : PREVIEW ? <ScrollView contentContainerStyle={s.preview}><View style={s.previewIntro}><Label gold>ALMOST HUMAN</Label><Text style={s.previewTitle}>Every voice has a tell.</Text><Text style={s.subtitle}>Design preview · example conversation and results</Text></View><View style={s.previewRow}>{(['waiting', 'chat', 'guess', 'reveal'] as Phase[]).map((phase, i) => <View key={phase} style={s.previewColumn}><RoundScreen state={{ ...previewState, partner: { ...previewState.partner!, faceId: showcaseId }, reveal: { ...previewState.reveal!, partner: { ...previewState.reveal!.partner, faceId: showcaseId } } }} phase={phase} onPlay={() => { window.location.href = '/'; }} onSend={async () => false} onVote={() => {}} /><Text style={s.caption}>{i + 1} · {['Room', 'On air', 'Verdict', 'Reveal'][i]}</Text></View>)}</View><Button title="Play Almost Human →" onPress={() => { window.location.href = '/'; }} /></ScrollView> : <View style={s.appColumn}>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {!id ? <Frame title="ALMOST HUMAN"><Text style={s.brand}>Almost{ '\n' }Human<Text style={{ color: C.gold }}>.</Text></Text><Text style={s.tagline}>Every voice has a tell.</Text><View style={s.singlePortrait}><Portrait faceId={showcaseId} name="Human or machine?" /></View><Text style={[s.body, { marginVertical: 24 }]}>One stranger. 75 seconds. A conversation that might be a little too convincing.</Text><Label>YOUR ALIAS · OPTIONAL</Label><TextInput accessibilityLabel="Your nickname" placeholder="Let the room name you" placeholderTextColor={C.muted} value={name} onChangeText={setName} maxLength={20} style={s.joinInput} onSubmitEditing={async () => { const r = await act('/api/join', { name }); if (r) setId(r.id); }} /><Button title={busy ? 'Opening the door…' : 'Step inside →'} disabled={busy} onPress={async () => { const r = await act('/api/join', { name }); if (r) { if (Platform.OS === 'web') { try { localStorage.setItem('ah-id', r.id); } catch {} } setId(r.id); } }} /><Text style={s.disclosure}>Some players are AI. Anonymous chats help train a bot detector. Keep personal details out of the room.</Text></Frame> : state ? <RoundScreen state={state} phase={state.phase} count={count} busy={busy} onPlay={play} onSend={async text => !!(await act('/api/say', { text }))?.ok} onVote={vote} /> : <ActivityIndicator color={C.gold} accessibilityLabel="Opening your room" />}
    </View>}
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, appColumn: { width: '100%', maxWidth: 420, flex: 1, alignSelf: 'center', paddingTop: Platform.OS === 'ios' ? 54 : 24, paddingBottom: Platform.OS === 'ios' ? 30 : 20 },
  phone: { backgroundColor: C.screen, flex: 1, padding: 24, borderWidth: 1, borderColor: '#28251e', borderRadius: 30, minHeight: 640 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 25, minHeight: 20 }, live: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#a34532' }, label: { fontFamily: mono, color: C.muted, fontSize: 8, letterSpacing: 1.4, lineHeight: 13 }, heading: { fontSize: 22, fontWeight: '600', color: C.ivory, textAlign: 'center', letterSpacing: .2 }, subtitle: { color: C.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8, marginBottom: 16 },
  singlePortrait: { width: '62%', maxWidth: 190, alignSelf: 'center', flexDirection: 'row', marginBottom: 16 }, portraitRow: { flexDirection: 'row', gap: 10, marginBottom: 16 }, portrait: { flex: 1, aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: '#1c1b16', borderWidth: 1, borderColor: '#4c4430' }, thumb: { flex: 0, flexBasis: 48, flexShrink: 0, width: 48, height: 54, aspectRatio: undefined, borderRadius: 5 }, fill: { width: '100%', height: '100%' }, nameTag: { position: 'absolute', left: 6, right: 4, bottom: 6, backgroundColor: '#0b0a08b0', paddingHorizontal: 4 }, wave: { position: 'absolute', right: 8, bottom: 21, color: C.ivory, letterSpacing: 1, fontSize: 22 },
  countArea: { flex: 1, minHeight: 190, justifyContent: 'center', alignItems: 'center' }, count: { fontSize: 120, lineHeight: 140, color: C.ivory, fontWeight: '700', letterSpacing: -8 }, topic: { backgroundColor: '#282313', borderColor: '#66522a', borderWidth: 1, borderRadius: 10, padding: 12, gap: 5 }, topicText: { color: '#e1c37d', fontSize: 13, lineHeight: 18 }, track: { height: 3, backgroundColor: '#353229', overflow: 'hidden', marginBottom: 12 }, progress: { height: '100%', backgroundColor: C.gold }, messages: { flex: 1, marginTop: 20, minHeight: 160 }, body: { color: C.text, fontSize: 13, lineHeight: 20, marginTop: 4 }, composer: { flexDirection: 'row', minHeight: 46, borderColor: C.border, borderWidth: 1, borderRadius: 10, backgroundColor: '#11100c' }, input: { flex: 1, color: C.ivory, padding: 12, fontSize: 13 }, send: { minWidth: 54, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderLeftWidth: 1, borderColor: C.border },
  ticks: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginBottom: 24 }, tick: { width: 18, height: 3, backgroundColor: C.gold }, voteCard: { backgroundColor: C.surface, borderRadius: 12, padding: 10, borderColor: '#2d2920', borderWidth: 1, flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 78, marginTop: 10 }, name: { color: C.ivory, fontWeight: '600', fontSize: 13 }, voteButtons: { flexDirection: 'row', gap: 8, marginTop: 12 }, voteButton: { flex: 1, minHeight: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 7, borderWidth: 1, borderColor: C.border }, voteText: { fontFamily: mono, fontSize: 11, color: C.ivory, letterSpacing: 1 }, footnote: { color: C.muted, fontFamily: mono, fontSize: 8, letterSpacing: 1.1, textAlign: 'center', lineHeight: 15, marginTop: 16 }, stamp: { fontFamily: mono, fontSize: 9, letterSpacing: 1, paddingVertical: 4, paddingHorizontal: 6, borderWidth: 1, borderRadius: 2, transform: [{ rotate: '-6deg' }] }, scoreArea: { alignItems: 'center', marginVertical: 32 }, score: { color: C.gold, fontSize: 40, fontWeight: '700', marginBottom: 6 }, button: { borderWidth: 1, borderColor: '#403a2d', borderRadius: 9, backgroundColor: '#24211a', minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }, buttonText: { color: C.ivory, fontWeight: '600', fontSize: 13, letterSpacing: 1 }, brand: { color: C.ivory, fontSize: 54, fontWeight: '700', letterSpacing: -3, lineHeight: 57, marginTop: 10 }, tagline: { color: C.gold, fontSize: 15, marginTop: 14, marginBottom: 28 }, joinInput: { color: C.ivory, borderBottomWidth: 1, borderColor: C.border, paddingVertical: 14, marginBottom: 22, fontSize: 14 }, disclosure: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 20 }, error: { color: '#ef9b86', padding: 12, fontSize: 12 }, preview: { padding: 32, alignItems: 'center', gap: 24 }, previewIntro: { alignItems: 'center' }, previewTitle: { color: C.ivory, fontSize: 28, fontWeight: '600', marginTop: 10 }, previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, justifyContent: 'center' }, previewColumn: { width: 290, height: 730 }, caption: { color: C.muted, textAlign: 'center', fontFamily: mono, fontSize: 10, paddingTop: 14 },
});
