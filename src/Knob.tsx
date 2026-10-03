import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { useDerivedValue, useSharedValue, withSpring } from 'react-native-reanimated';
import {
  Canvas,
  Circle,
  Group,
  Path,
  RadialGradient,
  Shadow,
  Skia,
  SweepGradient,
  vec,
} from 'react-native-skia';
import * as sys from './system';
import { knobHover } from './knobHover';

const START = 135; // degrees, clockwise from +x (Skia convention)
const SWEEP = 270;
const SPRING = { damping: 18, stiffness: 260, mass: 0.6 };
const silver = '#d9dde3';

type Props = {
  value: number;
  min: number;
  max: number;
  size: number;
  /** Fires once per whole step (throttled to the headset). */
  onChange: (v: number) => void;
  label?: string;
  /** Arc grows from the middle (EQ) instead of from min (ANC). */
  bipolar?: boolean;
  format?: (v: number) => string;
};

/**
 * Machined-metal rotary knob. Drag (up/right increases), scroll, arrow keys, double-click to centre.
 * The dial follows the pointer continuously; each whole step is a detent with a trackpad haptic,
 * and it springs to the nearest step on release. Geometry is computed on the UI thread.
 */
export function Knob({ value, min, max, size, onChange, label, bipolar, format = String }: Props) {
  const range = max - min;
  const [step, setStep] = useState(value); // integer shown in the centre
  const pos = useSharedValue(value); // continuous position driving the drawing

  const r = useRef({ step, min, max, range, onChange });
  r.current = { step, min, max, range, onChange };

  // Ignore headset echoes while the user is interacting, so the dial doesn't fight them.
  const busyUntil = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const sync = () => {
    r.current.step = valueRef.current;
    setStep(valueRef.current);
    pos.value = withSpring(valueRef.current, SPRING);
  };
  useEffect(() => {
    if (Date.now() >= busyUntil.current) sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  // After the user stops, settle on whatever the headset actually reports.
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSettle = () => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(sync, 1500);
  };

  // At most one headset write per 80ms, always ending on the latest step.
  const pending = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = (v: number) => {
    pending.current = v;
    if (timer.current) return;
    const flush = () => {
      if (pending.current == null) return void (timer.current = null);
      r.current.onChange(pending.current);
      pending.current = null;
      timer.current = setTimeout(flush, 80);
    };
    flush();
  };

  /** Move to a (possibly fractional) position; detents fire on whole-step crossings. */
  const moveTo = (v: number, animate: boolean) => {
    const { min: lo, max: hi } = r.current;
    const clamped = Math.min(hi, Math.max(lo, v));
    busyUntil.current = Date.now() + 800;
    scheduleSettle();
    pos.value = animate ? withSpring(Math.round(clamped), SPRING) : clamped;
    const n = Math.round(clamped);
    if (n !== r.current.step) {
      r.current.step = n;
      setStep(n);
      sys.haptic();
      commit(n);
    }
  };
  const moveRef = useRef(moveTo);
  moveRef.current = moveTo;

  const dragFrom = useRef(0);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragFrom.current = r.current.step;
      },
      // ~140px of travel covers the whole range.
      onPanResponderMove: (_, g) => moveRef.current(dragFrom.current + ((g.dx - g.dy) / 140) * r.current.range, false),
      onPanResponderRelease: () => moveRef.current(r.current.step, true),
      onPanResponderTerminate: () => moveRef.current(r.current.step, true),
    }),
  ).current;

  // Scroll wheel / trackpad: only the hovered knob responds.
  const hovered = useRef(false);
  useEffect(() => {
    let acc = 0;
    return sys.onWheel(w => {
      if (!hovered.current) return;
      acc += w.precise ? w.dy / 10 : Math.sign(w.dy);
      const n = Math.trunc(acc);
      if (!n) return;
      acc -= n;
      moveRef.current(r.current.step + n, true);
    });
  }, []);

  const c = size / 2;
  const ringR = c - 4;
  const bodyR = c * 0.66;
  const rect = Skia.XYWHRect(c - ringR, c - ringR, ringR * 2, ringR * 2);

  const ticks = useRef(
    (() => {
      const t = Skia.PathBuilder.Make();
      const steps = Math.min(range, 30);
      for (let i = 0; i <= steps; i++) {
        const a = ((START + (i / steps) * SWEEP) * Math.PI) / 180;
        t.moveTo(c + Math.cos(a) * (ringR - 7), c + Math.sin(a) * (ringR - 7));
        t.lineTo(c + Math.cos(a) * (ringR - 3), c + Math.sin(a) * (ringR - 3));
      }
      return t.build();
    })(),
  ).current;
  const track = useRef(Skia.PathBuilder.Make().addArc(rect, START, SWEEP).build()).current;

  const arc = useDerivedValue(() => {
    const angle = START + ((pos.value - min) / range) * SWEEP;
    const base = bipolar ? START + SWEEP / 2 : START;
    const b = Skia.PathBuilder.Make();
    b.addArc(rect, Math.min(base, angle), Math.max(0.01, Math.abs(angle - base)));
    return b.build();
  });
  const indicator = useDerivedValue(() => {
    const rad = ((START + ((pos.value - min) / range) * SWEEP) * Math.PI) / 180;
    const b = Skia.PathBuilder.Make();
    b.moveTo(c + Math.cos(rad) * bodyR * 0.45, c + Math.sin(rad) * bodyR * 0.45);
    b.lineTo(c + Math.cos(rad) * bodyR * 0.85, c + Math.sin(rad) * bodyR * 0.85);
    return b.build();
  });

  const KEYS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];

  return (
    <View style={styles.wrap}>
      <View
        style={{ width: size, height: size }}
        {...pan.panHandlers}
        tabIndex={0}
        acceptsFirstMouse
        onMouseEnter={() => {
          hovered.current = true;
          knobHover.set(true);
        }}
        onMouseLeave={() => {
          hovered.current = false;
          knobHover.set(false);
        }}
        keyDownEvents={KEYS.map(key => ({ key }))}
        onKeyDown={(e: { nativeEvent: { key: string } }) =>
          moveTo(step + (['ArrowUp', 'ArrowRight'].includes(e.nativeEvent.key) ? 1 : -1), true)
        }
        onDoubleClick={() => bipolar && moveTo((min + max) / 2, true)}>
        <Canvas style={{ width: size, height: size }}>
          <Path path={track} style="stroke" strokeWidth={2} color="#ffffff14" strokeCap="round" />
          <Path path={ticks} style="stroke" strokeWidth={1} color="#ffffff30" />
          <Path path={arc} style="stroke" strokeWidth={2.5} color={silver} strokeCap="round">
            <Shadow dx={0} dy={0} blur={4} color="#ffffff55" />
          </Path>
          {/* knob body: drop shadow, conic brushed sheen, soft top light */}
          <Group>
            <Circle cx={c} cy={c} r={bodyR}>
              <SweepGradient
                c={vec(c, c)}
                colors={['#3a3d42', '#c9ced6', '#4a4e54', '#e6e9ee', '#3a3d42', '#aeb3bb', '#3a3d42']}
              />
              <Shadow dx={0} dy={4} blur={8} color="#000000cc" />
            </Circle>
            <Circle cx={c} cy={c} r={bodyR}>
              <RadialGradient c={vec(c, c - bodyR * 0.5)} r={bodyR * 1.3} colors={['#ffffff30', '#00000066']} />
            </Circle>
            <Circle cx={c} cy={c} r={bodyR * 0.82} color="#1a1c1f" opacity={0.55} />
            <Circle cx={c} cy={c} r={bodyR * 0.82} style="stroke" strokeWidth={1} color="#ffffff22" />
          </Group>
          <Path path={indicator} style="stroke" strokeWidth={2.5} color={silver} strokeCap="round" />
        </Canvas>
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Text style={[styles.value, { fontSize: size * 0.17 }]}>{format(step)}</Text>
        </View>
      </View>
      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  value: { color: silver, fontWeight: '300', fontVariant: ['tabular-nums'] },
  label: { color: '#a6acb4', fontSize: 9, letterSpacing: 1.4, fontWeight: '600', marginTop: 2 },
});
