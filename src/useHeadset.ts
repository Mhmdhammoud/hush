import { useCallback, useEffect, useRef, useState } from 'react';
import * as bmap from './bmap';
import * as sys from './system';
import { runCommand } from './commands';
import { addSample, hoursLeft, Sample } from './battery';
import * as learn from './learn';
import * as calendar from './calendar';
import { useMeetingPrep } from './useMeetingPrep';

export type Headset = {
  status: 'connecting' | 'connected' | 'disconnected';
  error: string | null;
  name: string | null;
  firmware: string | null;
  anc: { level: number; enabled: boolean } | null;
  battery: number | null;
  eq: { bass: number; mid: number; treble: number } | null;
  selfVoice: bmap.SelfVoice | null;
  devices: bmap.Device[];
  autoOff: number | null;
  voicePrompts: { on: boolean; lang: number } | null;
  multipoint: boolean | null;
  shortcut: bmap.ShortcutAction | null;
  conversation: boolean | null;
  ancPresets: { index: number; levels: number[] } | null;
};

const INITIAL: Headset = {
  status: 'connecting',
  error: null,
  name: null,
  firmware: null,
  anc: null,
  battery: null,
  eq: null,
  selfVoice: null,
  devices: [],
  autoOff: null,
  voicePrompts: null,
  multipoint: null,
  shortcut: null,
  conversation: null,
  ancPresets: null,
};
const ANC_CYCLE = [0, 5, 10];
const LOW_BATTERY = 20;

const readAll = () => {
  bmap.getFirmware();
  bmap.getAnc();
  bmap.getBattery();
  bmap.getEq();
  bmap.getSelfVoice();
  bmap.getPairedList();
  bmap.getName();
  bmap.getAutoOff();
  bmap.getVoicePrompts();
  bmap.getMultipoint();
  bmap.getShortcut();
  bmap.getConversation();
  bmap.getAncPresets();
};

export function useHeadset() {
  const [s, set] = useState<Headset>(INITIAL);
  const patch = (p: Partial<Headset>) => set(prev => ({ ...prev, ...p }));
  const live = useRef(s);
  live.current = s;

  useEffect(() => {
    const offFrame = bmap.onFrame(f => {
      if (f.op !== bmap.Op.STATUS) return;
      const key = (f.block << 8) | f.fn;
      if (key === 0x0005) patch({ firmware: bmap.parseText(f.payload) });
      else if (key === 0x0105) patch({ anc: bmap.parseAnc(f.payload) });
      else if (key === 0x0202) patch({ battery: f.payload[0] });
      else if (key === 0x0107) patch({ eq: bmap.parseEq(f.payload) });
      else if (key === 0x010b) patch({ selfVoice: bmap.parseSelfVoice(f.payload) });
      else if (key === 0x0102) patch({ name: bmap.parseName(f.payload) });
      else if (key === 0x0104) patch({ autoOff: f.payload[0] });
      else if (key === 0x0103) patch({ voicePrompts: bmap.parseVoicePrompts(f.payload) });
      else if (key === 0x010a) patch({ multipoint: (f.payload[0] & 1) === 1 });
      else if (key === 0x0109) patch({ shortcut: bmap.parseShortcut(f.payload) });
      else if (key === 0x010d) patch({ conversation: f.payload[0] === 1 });
      else if (key === 0x010f) patch({ ancPresets: bmap.parseAncPresets(f.payload) });
      else if (key === 0x0404) bmap.parsePairedList(f.payload).forEach(bmap.getDeviceInfo);
      else if (key === 0x0405) {
        const d = bmap.parseDeviceInfo(f.payload);
        set(prev => {
          const i = prev.devices.findIndex(x => x.mac === d.mac);
          const devices = i < 0 ? [...prev.devices, d] : prev.devices.map((x, j) => (j === i ? d : x));
          return { ...prev, devices };
        });
      }
    });
    const offClosed = bmap.onClosed(() => patch({ status: 'disconnected' }));

    let busy = false;
    const tick = () => {
      if (live.current.status === 'connected') {
        bmap.getBattery();
        bmap.getPairedList();
        return;
      }
      if (busy) return;
      busy = true;
      bmap
        .connect()
        .then(d => {
          patch({ status: 'connected', error: null, name: d.name });
          sys.setPref('headsetAddress', d.address);
          readAll();
        })
        .catch((e: Error) => patch({ status: 'disconnected', error: e.message }))
        .finally(() => (busy = false));
    };
    tick();
    // Physical buttons change ANC/conversation without telling us; a cheap 3s read keeps the UI honest.
    const fast = setInterval(() => {
      if (live.current.status !== 'connected') return;
      bmap.getAnc();
      bmap.getConversation();
    }, 3000);
    // ponytail: 15s poll covers reconnects and battery; swap for IOBluetooth connect notifications if it feels laggy
    const id = setInterval(tick, 15000);

    const offHotkey = sys.onHotkey(() => {
      const cur = live.current.anc?.level ?? 0;
      const next = ANC_CYCLE.find(v => v > cur) ?? ANC_CYCLE[0];
      bmap.setAnc(next);
    });

    return () => {
      offFrame();
      offClosed();
      offHotkey();
      clearInterval(id);
      clearInterval(fast);
    };
  }, []);

  // Menu-bar glyph mirrors the headset.
  useEffect(() => {
    sys.setMenuState(s.status === 'connected' ? `anc:${s.anc?.level ?? 0}` : 'disconnected');
  }, [s.status, s.anc]);

  // Drain-rate estimate, persisted so it survives restarts.
  const samples = useRef<Sample[]>([]);
  const [hoursRemaining, setHoursRemaining] = useState<number | null>(null);
  useEffect(() => {
    sys.getPref<Sample[]>('battSamples', []).then(v => (samples.current = v));
  }, []);
  useEffect(() => {
    if (s.battery == null) return;
    samples.current = addSample(samples.current, { t: Date.now(), pct: s.battery });
    sys.setPref('battSamples', samples.current);
    setHoursRemaining(hoursLeft(samples.current));
  }, [s.battery]);

  // One notification per discharge below the threshold.
  const warned = useRef(false);
  useEffect(() => {
    if (s.battery == null) return;
    if (s.battery <= LOW_BATTERY && !warned.current) {
      warned.current = true;
      sys.notify(`${s.name ?? 'Headphones'} battery low`, `${s.battery}% left`);
    } else if (s.battery > LOW_BATTERY + 10) warned.current = false;
  }, [s.battery, s.name]);

  // Call mode: while the mic is in use, max noise cancelling + self voice; restore afterwards.
  const [callMode, setCallModeState] = useState(true);
  const [inCall, setInCall] = useState(false);
  const saved = useRef<{ anc: number; selfVoice: bmap.SelfVoice } | null>(null);
  useEffect(() => {
    sys.getPref('callMode', true).then(setCallModeState);
    sys.micInUse().then(setInCall);
    return sys.onMic(setInCall);
  }, []);
  useEffect(() => {
    const cur = live.current;
    if (!callMode || cur.status !== 'connected') return;
    if (inCall && !saved.current) {
      saved.current = { anc: cur.anc?.level ?? 0, selfVoice: cur.selfVoice ?? 'off' };
      bmap.setAnc(10);
      bmap.setSelfVoice('low');
    } else if (!inCall && saved.current) {
      bmap.setAnc(saved.current.anc);
      bmap.setSelfVoice(saved.current.selfVoice);
      saved.current = null;
    }
  }, [inCall, callMode, s.status]);
  const setCallMode = useCallback((on: boolean) => {
    setCallModeState(on);
    sys.setPref('callMode', on);
  }, []);

  // Pull on unlock: unlocking this Mac brings the headphones over if they're elsewhere.
  const [pullOnUnlock, setPullState] = useState(true);
  useEffect(() => {
    sys.getPref('pullOnUnlock', true).then(setPullState);
  }, []);
  useEffect(() => {
    if (!pullOnUnlock) return;
    return sys.onUnlock(async () => {
      if (live.current.status === 'connected') return;
      const addr = await sys.getPref<string | null>('headsetAddress', null);
      if (addr) bmap.pullHeadset(addr).catch(() => {}); // the 15s tick then opens the control channel
    });
  }, [pullOnUnlock]);
  const setPullOnUnlock = useCallback((on: boolean) => {
    setPullState(on);
    sys.setPref('pullOnUnlock', on);
  }, []);

  // Learning: per-app noise-cancelling rules and device prediction (local, see learn.ts).
  const frontApp = useRef<sys.FrontApp | null>(null);
  const [ancLog, setAncLog] = useState<learn.AncEvent[]>([]);
  const [switchLog, setSwitchLog] = useState<learn.SwitchEvent[]>([]);
  const [appRules, setAppRules] = useState<learn.AppRules>({});
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    sys.getPref<learn.AncEvent[]>('ancLog', []).then(setAncLog);
    sys.getPref<learn.SwitchEvent[]>('switchLog', []).then(setSwitchLog);
    sys.getPref<learn.AppRules>('appRules', {}).then(setAppRules);
    sys.getPref<string[]>('dismissedRules', []).then(setDismissed);
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const rulesRef = useRef(appRules);
  rulesRef.current = appRules;
  useEffect(
    () =>
      sys.onFrontApp(app => {
        frontApp.current = app;
        const rule = rulesRef.current[app.bundleId];
        if (rule && live.current.status === 'connected' && !saved.current) bmap.setAnc(rule.anc);
      }),
    [],
  );
  /** Manual change from the UI: apply and remember which app it was for. */
  const setAncManual = useCallback((level: number) => {
    bmap.setAnc(level);
    const app = frontApp.current;
    if (!app) return;
    setAncLog(prev => {
      const next = learn.remember(prev, { app: app.bundleId, appName: app.name, level, t: Date.now() });
      sys.setPref('ancLog', next);
      return next;
    });
  }, []);
  const suggestion = learn.suggestAppRule(ancLog, appRules, dismissed);
  const acceptRule = useCallback((app: string, appName: string, anc: number) => {
    setAppRules(prev => {
      const next = { ...prev, [app]: { appName, anc } };
      sys.setPref('appRules', next);
      return next;
    });
  }, []);
  const removeRule = useCallback((app: string) => {
    setAppRules(prev => {
      const { [app]: _, ...next } = prev;
      sys.setPref('appRules', next);
      return next;
    });
  }, []);
  const dismissRule = useCallback((app: string) => {
    setDismissed(prev => {
      const next = [...prev, app];
      sys.setPref('dismissedRules', next);
      return next;
    });
  }, []);
  const predictedMac = learn.predictDevice(
    switchLog,
    now,
    s.devices.filter(d => d.connected).map(d => d.mac),
  );
  const predicted = s.devices.find(d => d.mac === predictedMac) ?? null;

  // Meeting prep: pull the headset here and warn about battery before calendar meetings.
  const [meetingPrep, setMeetingPrepState] = useState(false);
  useEffect(() => {
    Promise.all([sys.getPref('meetingPrep', false), calendar.authorizationStatus()]).then(([on, auth]) =>
      setMeetingPrepState(on && auth === 'granted'),
    );
  }, []);
  const setMeetingPrep = useCallback(async (on: boolean) => {
    const granted = !on || (await calendar.requestAccess());
    const next = on && granted;
    setMeetingPrepState(next);
    sys.setPref('meetingPrep', next);
  }, []);
  useMeetingPrep({
    enabled: meetingPrep,
    connected: s.status === 'connected',
    name: s.name,
    battery: s.battery,
    hoursRemaining,
    pull: () =>
      void sys.getPref<string | null>('headsetAddress', null).then(a => {
        if (a) bmap.pullHeadset(a).catch(() => {});
      }),
    notify: sys.notify,
  });

  // URL scheme / CLI commands, and a state snapshot the CLI can read back.
  useEffect(
    () =>
      sys.onCommand(url => {
        const err = runCommand(url, live.current, setCallMode);
        if (err) sys.notify('Hush', err);
        [1500, 4000].forEach(ms => setTimeout(() => (bmap.getPairedList(), bmap.getAnc()), ms));
      }),
    [setCallMode],
  );
  useEffect(() => {
    sys.publishState({ ...s, hoursRemaining, inCall, callMode, updatedAt: new Date().toISOString() });
  }, [s, hoursRemaining, inCall, callMode]);

  const forget = useCallback((mac: string) => {
    bmap.forgetDevice(mac);
    set(prev => ({ ...prev, devices: prev.devices.filter(d => d.mac !== mac) }));
    setTimeout(bmap.getPairedList, 1500);
  }, []);

  const switchTo = useCallback((mac: string) => {
    bmap.switchTo(mac, live.current.devices);
    setSwitchLog(prev => {
      const next = learn.remember(prev, { mac, t: Date.now() });
      sys.setPref('switchLog', next);
      return next;
    });
    [3000, 8000].forEach(ms => setTimeout(bmap.getPairedList, ms));
  }, []);

  return { ...s, meetingPrep, setMeetingPrep, hoursRemaining, suggestion, appRules, acceptRule, removeRule, dismissRule, predicted, setAncManual, inCall, callMode, setCallMode, pullOnUnlock, setPullOnUnlock, setAnc: bmap.setAnc, setEq: bmap.setEq, setSelfVoice: bmap.setSelfVoice, switchTo, forget,
    setName: bmap.setName, setAutoOff: bmap.setAutoOff, setVoicePrompts: bmap.setVoicePrompts,
    setMultipoint: bmap.setMultipoint, setShortcut: bmap.setShortcut, setConversation: bmap.setConversation,
    setAncPresets: bmap.setAncPresets, enterPairingMode: bmap.enterPairingMode, exitPairingMode: bmap.exitPairingMode };
}
