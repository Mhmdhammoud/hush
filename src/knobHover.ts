import { useEffect, useState } from 'react';

// Whether the pointer is over any knob. Scroll views stop scrolling then, so a trackpad
// scroll turns the knob instead of moving the page underneath it.
let hovering = false;
const subs = new Set<(v: boolean) => void>();

export const knobHover = {
  set(v: boolean) {
    hovering = v;
    subs.forEach(cb => cb(v));
  },
};

export function useKnobHovering() {
  const [v, setV] = useState(hovering);
  useEffect(() => {
    subs.add(setV);
    return () => void subs.delete(setV);
  }, []);
  return v;
}
