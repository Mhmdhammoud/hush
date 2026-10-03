import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/** Brushed pill selector. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: T[];
  value: T | null;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <View style={styles.row}>
      {options.map(o => (
        <Pressable key={o} onPress={() => onChange(o)} style={[styles.seg, value === o && styles.on]}>
          <Text style={[styles.text, value === o && styles.textOn]}>{labels?.[o] ?? o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 9,
    padding: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ffffff22',
  },
  seg: { flex: 1, paddingVertical: 6, borderRadius: 7, alignItems: 'center' },
  on: { backgroundColor: '#d9dde3' },
  text: { color: '#c3c9d0', fontSize: 11, fontWeight: '500' },
  textOn: { color: '#0b0c0e' },
});
