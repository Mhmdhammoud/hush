import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ai from './ai';
import { C } from './theme';

/** Natural-language command bar (on-device Apple Foundation Models). Renders nothing if unavailable. */
export function CommandBar({ state, run }: { state: object; run: (url: string) => string | null }) {
  const [ok, setOk] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    ai.available().then(a => setOk(a.available)).catch(() => setOk(false));
  }, []);

  const show = (m: { text: string; error: boolean }) => {
    setMsg(m);
    fade.stopAnimation();
    fade.setValue(1);
    Animated.timing(fade, { toValue: 0, duration: 400, delay: m.error ? 5000 : 3000, useNativeDriver: false }).start();
  };

  const submit = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      const { commands, summary } = await ai.interpret(q, state);
      if (!commands.length) return show({ text: "Couldn't map that to a headphone setting", error: true });
      const errors = commands.map(c => run(ai.toUrl(c))).filter((e): e is string => !!e);
      setText('');
      show(errors.length ? { text: errors.join(' · '), error: true } : { text: summary || commands.join(' · '), error: false });
    } catch (e) {
      show({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  if (!ok) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          editable={!busy}
          placeholder="Tell Hush… e.g. quieter, let me hear the room"
          placeholderTextColor={C.dim}
          accessibilityLabel="Tell Hush what to do"
        />
        {busy && <ActivityIndicator size="small" color={C.silver} style={styles.spin} />}
      </View>
      {msg && (
        <Animated.Text numberOfLines={1} style={[styles.msg, msg.error && styles.err, { opacity: fade }]}>
          {msg.text}
        </Animated.Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
    paddingHorizontal: 10,
  },
  input: { flex: 1, color: C.text, fontSize: 12, paddingVertical: 7 },
  spin: { marginLeft: 6, transform: [{ scale: 0.6 }] },
  msg: { color: C.secondary, fontSize: 11, marginTop: 5, marginLeft: 2 },
  err: { color: '#e8a3a3' },
});
