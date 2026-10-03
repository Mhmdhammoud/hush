import React, { useMemo } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Canvas, Path, Skia } from 'react-native-skia';

/** Thin progress ring with the value in the middle (battery). */
export function Ring({ value, size, label }: { value: number | null; size: number; label: string }) {
  const r = size / 2 - 2;
  const { track, arc } = useMemo(() => {
    const rect = Skia.XYWHRect(2, 2, r * 2, r * 2);
    const t = Skia.PathBuilder.Make();
    t.addArc(rect, 0, 360);
    const a = Skia.PathBuilder.Make();
    a.addArc(rect, -90, ((value ?? 0) / 100) * 360);
    return { track: t.build(), arc: a.build() };
  }, [value, r]);
  const low = value != null && value <= 20;
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`${label} ${value ?? 'unknown'}%`}>
      <Canvas style={{ width: size, height: size }}>
        <Path path={track} style="stroke" strokeWidth={2} color="#ffffff1a" />
        <Path path={arc} style="stroke" strokeWidth={2} strokeCap="round" color={low ? '#e8a0a0' : '#d9dde3'} />
      </Canvas>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={styles.text}>{value ?? '–'}<Text style={styles.pct}>%</Text></Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pct: { fontSize: 8, fontWeight: '500', color: '#b9bfc7' },
  center: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#eef0f3', fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sub: { color: '#b9bfc7', fontSize: 8, letterSpacing: 1, fontWeight: '600' },
});
