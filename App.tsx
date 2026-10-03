import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as bmap from './src/bmap';
import { useHeadset } from './src/useHeadset';
import { NoiseField } from './src/NoiseField';
import { Knob } from './src/Knob';
import { Ring } from './src/Ring';
import { Segmented } from './src/Segmented';
import { Toggle } from './src/Toggle';
import { formatHours } from './src/battery';
import * as sys from './src/system';
import { C } from './src/theme';
import { useKnobHovering } from './src/knobHover';
import { CommandBar } from './src/CommandBar';
import { runCommand } from './src/commands';

const W = 360;
const H = 560;
const PAD = 20;
const TABS = ['sound', 'devices', 'settings'] as const;
type Tab = (typeof TABS)[number];
const TAB_W = (W - PAD * 2) / TABS.length;

export default function App() {
  const h = useHeadset();
  const [tab, setTab] = useState<Tab>('sound');
  const level = h.anc?.level ?? 0;

  // Indicator slides under the active tab; content slides in from the side we're moving toward.
  const idx = TABS.indexOf(tab);
  const indicatorX = useSharedValue(0);
  const enter = useSharedValue(1);
  const dir = useSharedValue(1);
  const prevIdx = useRef(idx);
  useEffect(() => {
    indicatorX.value = withSpring(idx * TAB_W, { damping: 32, stiffness: 520, mass: 0.6 });
    dir.value = idx >= prevIdx.current ? 1 : -1;
    prevIdx.current = idx;
    enter.value = 0;
    enter.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) });
  }, [idx, indicatorX, enter, dir]);
  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: indicatorX.value }] }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: (1 - enter.value) * 16 * dir.value }],
  }));

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill}>
        <NoiseField anc={level / (bmap.ANC_STEPS - 1)} width={W} height={H} />
      </View>
      {/* Scrim keeps text legible over the bright parts of the field. */}
      <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />

      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {h.name ?? 'Hush'}
          </Text>
          <Text style={styles.meta}>
            {h.status !== 'connected'
              ? h.error ?? h.status
              : h.hoursRemaining != null
                ? `Bose NC 700 · ${formatHours(h.hoursRemaining)}`
                : 'Bose NC 700'}
          </Text>
        </View>
        <Ring value={h.battery} size={40} label="Battery" />
      </View>

      <View style={styles.tabs}>
        {TABS.map(t => (
          <Pressable key={t} onPress={() => setTab(t)} style={styles.tab}>
            <Text style={[styles.tabText, tab === t && styles.tabOn]}>{t.toUpperCase()}</Text>
          </Pressable>
        ))}
        <Animated.View style={[styles.indicator, indicatorStyle]} />
      </View>

      <View style={styles.commandBar}>
        <CommandBar
          state={h}
          run={url => {
            const err = runCommand(url, h, h.setCallMode);
            setTimeout(() => (bmap.getAnc(), bmap.getEq(), bmap.getSelfVoice(), bmap.getPairedList()), 1200);
            return err;
          }}
        />
      </View>

      <Animated.View style={[styles.flex, contentStyle]}>
        {tab === 'sound' && <Sound h={h} level={level} />}
        {tab === 'devices' && <Devices h={h} />}
        {tab === 'settings' && <Settings h={h} />}
      </Animated.View>
    </View>
  );
}

type Hs = ReturnType<typeof useHeadset>;

function Sound({ h, level }: { h: Hs; level: number }) {
  return (
    <View style={[styles.body, styles.center]}>
      {h.suggestion && (
        <View style={styles.card}>
          <Text style={styles.cardText}>
            You usually set noise cancelling to {h.suggestion.anc} in {h.suggestion.appName}. Do it automatically?
          </Text>
          <View style={styles.cardActions}>
            <Pressable onPress={() => h.dismissRule(h.suggestion!.app)} style={styles.cardBtn}>
              <Text style={styles.meta}>Not now</Text>
            </Pressable>
            <Pressable
              onPress={() => h.acceptRule(h.suggestion!.app, h.suggestion!.appName, h.suggestion!.anc)}
              style={[styles.cardBtn, styles.cardPrimary]}>
              <Text style={styles.cardPrimaryText}>Yes</Text>
            </Pressable>
          </View>
        </View>
      )}
      <Knob value={level} min={0} max={bmap.ANC_STEPS - 1} size={168} onChange={h.setAncManual} />
      <Text style={styles.label}>{h.conversation ? 'CONVERSATION MODE' : 'NOISE CANCELLING'}</Text>

      <View style={styles.eqRow}>
        {(['bass', 'mid', 'treble'] as bmap.EqBand[]).map(b => (
          <Knob
            key={b}
            value={h.eq?.[b] ?? 0}
            min={-10}
            max={10}
            size={72}
            bipolar
            label={b.toUpperCase()}
            format={v => (v > 0 ? `+${v}` : String(v))}
            onChange={v => h.setEq(b, v)}
          />
        ))}
      </View>

      <Text style={[styles.label, styles.section]}>SELF VOICE</Text>
      <Segmented
        options={['off', 'low', 'medium', 'high'] as bmap.SelfVoice[]}
        value={h.selfVoice}
        onChange={h.setSelfVoice}
      />
      <View style={styles.stretch}>
        <Toggle
          label="Conversation mode"
          hint="Pause noise cancelling and hear the room"
          value={h.conversation}
          onChange={h.setConversation}
        />
      </View>
    </View>
  );
}

function Devices({ h }: { h: Hs }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const togglePairing = () => {
    if (pairing) h.exitPairingMode();
    else h.enterPairingMode();
    setPairing(!pairing);
  };
  const devices = [...h.devices].sort((a, b) => Number(b.connected) - Number(a.connected));
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.body}>
      {h.predicted && (
        <Pressable onPress={() => h.switchTo(h.predicted!.mac)} style={[styles.card, styles.cardRow]}>
          <Text style={[styles.cardText, styles.flex]}>You usually use {h.predicted.name} around now</Text>
          <Text style={styles.cardPrimaryText}>Switch</Text>
        </Pressable>
      )}
      <Text style={styles.label}>CONNECTED · UP TO 2 AT ONCE</Text>
      {devices.map(d => (
        <View key={d.mac} style={styles.device}>
          <Pressable onPress={() => h.switchTo(d.mac)} style={styles.deviceMain}>
            <View style={[styles.dot, d.connected && styles.dotOn]} />
            <Text style={[styles.deviceName, d.connected && styles.deviceOn]} numberOfLines={1}>
              {d.name}
            </Text>
            <Text style={styles.meta}>{d.isHost ? 'this Mac' : d.connected ? 'connected' : 'connect'}</Text>
          </Pressable>
          {!d.connected && (
            <Pressable
              onPress={() => (confirm === d.mac ? (h.forget(d.mac), setConfirm(null)) : setConfirm(d.mac))}
              style={styles.forget}>
              <Text style={[styles.meta, confirm === d.mac && styles.danger]}>
                {confirm === d.mac ? 'confirm' : 'forget'}
              </Text>
            </Pressable>
          )}
        </View>
      ))}
      <Text style={[styles.meta, styles.section]}>
        Click a device to switch to it. Hush drops the other connection first. The headphones remember up to 8.
      </Text>
      <Pressable onPress={togglePairing} style={styles.button}>
        <Text style={styles.buttonText}>{pairing ? 'Stop pairing' : 'Pair a new device'}</Text>
      </Pressable>
      {pairing && (
        <Text style={[styles.meta, styles.hotkey]}>
          The headphones are discoverable now; pick them in the new device's Bluetooth settings. Pairing mode may
          drop one current connection.
        </Text>
      )}
    </ScrollView>
  );
}

const AUTO_OFF: { value: string; minutes: number }[] = [
  { value: 'never', minutes: 0 },
  { value: '20m', minutes: 20 },
  { value: '40m', minutes: 40 },
  { value: '1h', minutes: 60 },
  { value: '3h', minutes: 180 },
];

function Settings({ h }: { h: Hs }) {
  const [login, setLogin] = useState<boolean | null>(null);
  const [name, setName] = useState(h.name ?? '');
  useEffect(() => {
    sys.launchAtLogin().then(setLogin);
  }, []);
  useEffect(() => setName(h.name ?? ''), [h.name]);
  const presets = h.ancPresets;
  const overKnob = useKnobHovering();
  const saveName = () => name.trim() && name.trim() !== h.name && h.setName(name.trim());

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.body} scrollEnabled={!overKnob}>
      <Text style={styles.label}>HEADPHONES</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Name</Text>
        <TextInput value={name} onChangeText={setName} onSubmitEditing={saveName} onBlur={saveName} style={styles.input} />
      </View>
      <Text style={[styles.rowLabel, styles.small]}>Auto-off</Text>
      <Segmented
        options={AUTO_OFF.map(a => a.value)}
        value={AUTO_OFF.find(a => a.minutes === h.autoOff)?.value ?? null}
        onChange={v => h.setAutoOff(AUTO_OFF.find(a => a.value === v)!.minutes)}
      />
      <Text style={[styles.rowLabel, styles.small]}>Shortcut button (hold)</Text>
      <Segmented
        options={['battery', 'spotify'] as bmap.ShortcutAction[]}
        labels={{ battery: 'Battery level', spotify: 'Spotify Tap' }}
        value={h.shortcut}
        onChange={h.setShortcut}
      />
      <Toggle
        label="Voice prompts"
        value={h.voicePrompts?.on ?? null}
        onChange={on => h.setVoicePrompts(on, h.voicePrompts?.lang ?? 1)}
      />
      <Toggle label="Multipoint" hint="Stay connected to two devices at once" value={h.multipoint} onChange={h.setMultipoint} />

      <Text style={[styles.label, styles.section]}>NOISE CANCELLING BUTTON CYCLES</Text>
      <View style={styles.eqRow}>
        {[0, 1, 2].map(i => (
          <Knob
            key={i}
            value={presets?.levels[i] ?? 0}
            min={0}
            max={10}
            size={60}
            label={`PRESET ${i + 1}`}
            onChange={v => presets && h.setAncPresets(presets.index, presets.levels.map((l, j) => (j === i ? v : l)))}
          />
        ))}
      </View>

      <Text style={[styles.label, styles.section]}>PER-APP NOISE CANCELLING</Text>
      {Object.keys(h.appRules).length === 0 ? (
        <Text style={styles.meta}>Hush suggests rules once it notices a habit, e.g. always 10 in Xcode.</Text>
      ) : (
        Object.entries(h.appRules).map(([app, rule]) => (
          <View key={app} style={styles.ruleRow}>
            <Text style={[styles.rowLabel]}>{rule.appName}</Text>
            <Text style={styles.meta}>noise cancelling {rule.anc}</Text>
            <Pressable onPress={() => h.removeRule(app)} style={styles.forget}>
              <Text style={styles.meta}>remove</Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={[styles.label, styles.section]}>APP</Text>
      <Toggle
        label="Launch at login"
        value={login}
        onChange={v => sys.setLaunchAtLogin(v).then(setLogin).catch(() => setLogin(!v))}
      />
      <Toggle
        label="Call mode"
        hint={h.inCall ? 'On a call now' : 'Max noise cancelling + self voice while the mic is in use'}
        value={h.callMode}
        onChange={h.setCallMode}
      />
      <Toggle
        label="Meeting prep"
        hint="Before calendar meetings: bring headphones here, warn if the battery won't last"
        value={h.meetingPrep}
        onChange={h.setMeetingPrep}
      />
      <Toggle
        label="Bring headphones here on unlock"
        hint="Connects them to this Mac when you unlock it"
        value={h.pullOnUnlock}
        onChange={h.setPullOnUnlock}
      />
      <Text style={[styles.meta, styles.hotkey]}>⌥⌘N cycles noise cancelling 0 → 5 → 10</Text>

      <Text style={[styles.label, styles.section]}>ABOUT</Text>
      <Text style={styles.meta}>Firmware {h.firmware ?? '—'}</Text>
      <Pressable onPress={sys.quit} style={[styles.button, styles.quit]}>
        <Text style={styles.buttonText}>Quit Hush</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { width: W, height: H, backgroundColor: C.bg },
  scrim: { backgroundColor: 'rgba(6,7,9,0.5)' },
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: PAD, paddingTop: 16 },
  name: { color: C.text, fontSize: 16, fontWeight: '600' },
  meta: { color: C.secondary, fontSize: 11 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: PAD,
    marginTop: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.hairline,
  },
  tab: { width: TAB_W, paddingVertical: 9, alignItems: 'center' },
  tabText: { color: C.dim, fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
  tabOn: { color: C.text },
  indicator: {
    position: 'absolute',
    bottom: -1,
    left: TAB_W * 0.25,
    width: TAB_W * 0.5,
    height: 2,
    borderRadius: 1,
    backgroundColor: C.text,
  },
  body: { paddingHorizontal: PAD, paddingTop: 14, paddingBottom: 20 },
  center: { alignItems: 'center' },
  label: { color: C.label, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  section: { marginTop: 18, marginBottom: 8 },
  small: { fontSize: 12, marginTop: 12, marginBottom: 6 },
  eqRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  rowLabel: { color: C.text, fontSize: 13, flex: 1 },
  input: {
    flex: 2,
    color: C.text,
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
  },
  device: { flexDirection: 'row', alignItems: 'center' },
  deviceMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 10, backgroundColor: 'rgba(255,255,255,0.22)' },
  dotOn: { backgroundColor: C.text },
  deviceName: { color: C.secondary, fontSize: 13, flex: 1 },
  deviceOn: { color: C.text },
  forget: { paddingLeft: 12, paddingVertical: 9 },
  danger: { color: '#f0a8a8' },
  button: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
  },
  buttonText: { color: C.text, fontSize: 12 },
  hotkey: { marginTop: 6 },
  commandBar: { paddingHorizontal: PAD, paddingTop: 10 },
  card: {
    alignSelf: 'stretch',
    marginBottom: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardText: { color: C.text, fontSize: 12, lineHeight: 16 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 8 },
  cardBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 },
  cardPrimary: { backgroundColor: C.silver },
  cardPrimaryText: { color: C.bg, fontSize: 12, fontWeight: '600' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  quit: { marginTop: 10 },
});
