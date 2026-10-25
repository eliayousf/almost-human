import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GameProvider, backendUrl } from './src/game';
import { LiveGame } from './src/LiveGame';
import { CastGallery, RoundScreen, Label, Button, Frame, previewState, s } from './src/screens';
import { randomCharacterId } from './src/random';
import type { Phase } from './src/game-state';

const params = Platform.OS === 'web' && typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
function DesignPreview() {
  const [faceId] = useState(randomCharacterId);
  return <ScrollView contentContainerStyle={s.preview}><View style={s.previewIntro}><Label gold>ALMOST HUMAN</Label><Text style={s.previewTitle}>Every voice has a tell.</Text><Text style={s.subtitle}>Design preview · synthetic conversation and results</Text></View><View style={s.previewRow}>
    {(['waiting', 'chat', 'guess', 'reveal'] as Phase[]).map((phase, index) => <View key={phase} style={s.previewColumn}><RoundScreen state={{ ...previewState, partner: { ...previewState.partner!, faceId }, reveal: { ...previewState.reveal!, partner: { ...previewState.reveal!.partner, faceId } } }} phase={phase} onPlay={() => { window.location.href = '/'; }} onSend={async () => false} onVote={() => {}} /><Text style={s.caption}>{index + 1} · {['Room', 'On air', 'Verdict', 'Reveal'][index]}</Text></View>)}
  </View><Button title="Play Almost Human →" onPress={() => { window.location.href = '/'; }} /></ScrollView>;
}
export default function App() {
  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><StatusBar style="light" />
    {params?.has('cast') ? <CastGallery /> : params?.has('preview') ? <DesignPreview /> : !backendUrl ? <View style={s.appColumn}><Frame title="ALMOST HUMAN"><Text style={s.heading}>Backend not configured</Text><Text style={s.subtitle}>This build needs its public Convex URL.</Text></Frame></View> : <GameProvider><LiveGame /></GameProvider>}
  </KeyboardAvoidingView>;
}
