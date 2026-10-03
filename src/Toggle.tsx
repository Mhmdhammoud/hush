import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/** Labeled row with a small silver switch. */
export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean | null; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable onPress={() => value != null && onChange(!value)} style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <View style={[styles.track, value && styles.trackOn]}>
        <View style={[styles.thumb, value && styles.thumbOn]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  text: { flex: 1 },
  label: { color: '#eef0f3', fontSize: 13 },
  hint: { color: '#b9bfc7', fontSize: 10, marginTop: 2 },
  track: { width: 34, height: 20, borderRadius: 10, backgroundColor: '#ffffff1a', padding: 2 },
  trackOn: { backgroundColor: '#d9dde3' },
  thumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#8a9099' },
  thumbOn: { backgroundColor: '#0b0c0e', transform: [{ translateX: 14 }] },
});
