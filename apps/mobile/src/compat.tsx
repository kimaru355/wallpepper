import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Modal, PanResponder, Pressable, StyleSheet, Text, View, type ImageStyle } from 'react-native';
import {
  clearVariant,
  compatStatus,
  deviceShape,
  ensureDimensions,
  getDeviceSettings,
  getVariant,
  placeCrop,
  setVariant,
  shapeOf,
  type Crop,
  type Shape,
  type Wallpaper,
} from '@wallpepper/core';
import { CachedImage } from './CachedImage';
import { getCtx, toast, useAppState } from './ctx';
import { useInsets } from './insets';
import { probeImage } from './platform';
import { SearchSimilar } from './SearchSimilar';
import { Btn, colors, Icon, Sheet, text } from './ui';

// ------------------------------------------------------------------ which wallpaper is being checked

let current: Wallpaper | null = null;
const listeners = new Set<() => void>();
const set = (w: Wallpaper | null) => {
  current = w;
  listeners.forEach((l) => l());
};

/** "Check compatibility" / "Update compatibility": opens the dialog for a saved wallpaper. */
export const openCompat = (w: Wallpaper) => set(w);

/**
 * Called after a wallpaper was added to a group. Step 1: measure it when the source did not say how big it is.
 * Then, if it is not square and no choice was made yet, ask how it should look in the other orientation.
 */
export async function startCompat(w: Wallpaper): Promise<void> {
  const { store } = getCtx();
  const full = (await ensureDimensions(store, w.id, probeImage)) ?? w;
  const s = shapeOf(full);
  if (s === 'unknown' || s === 'square') return;
  if (getVariant(store.state, w.id)) return;
  set(full);
}

export function CompatHost() {
  const w = useSyncExternalStore(
    (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    () => current,
  );
  if (!w) return null;
  return <CompatDialog key={w.id} w={w} onClose={() => set(null)} />;
}

const SHAPE_LABEL: Record<Shape, string> = { portrait: 'portrait', landscape: 'landscape' };
const WHERE: Record<Shape, string> = { portrait: 'phones', landscape: 'computers' };

// ------------------------------------------------------------------ the dialog

function CompatDialog({ w: initial, onClose }: { w: Wallpaper; onClose: () => void }) {
  const state = useAppState();
  const { store } = getCtx();
  const [w, setW] = useState(initial);
  const [cropping, setCropping] = useState(false);
  const [searching, setSearching] = useState(false);
  const status = compatStatus(state, w);
  const need = status.needs;

  // step 1 again: the wallpaper may have been opened without a size
  useEffect(() => {
    let live = true;
    void ensureDimensions(store, w.id, probeImage).then((full) => live && full && setW(full));
    return () => {
      live = false;
    };
  }, [w.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (msg: string) => {
    toast(msg);
    onClose();
  };

  if (cropping && need) {
    return (
      <CropEditor
        w={w}
        target={need}
        initial={status.variant?.choice.kind === 'crop' ? status.variant.choice.crop : undefined}
        onCancel={() => setCropping(false)}
        onSave={(crop) => {
          setVariant(store, w, { kind: 'crop', crop });
          done('Crop saved');
        }}
      />
    );
  }

  if (searching && need) {
    return (
      <SearchSimilar
        w={w}
        target={need}
        onCancel={() => setSearching(false)}
        onPick={(alt) => {
          setVariant(store, w, { kind: 'image', wallpaper: alt });
          done('Saved: phones and computers each get a picture of the right shape');
        }}
      />
    );
  }

  const me = deviceShape(getDeviceSettings(state)?.platform);
  const stateText = (() => {
    switch (status.state) {
      case 'image': return 'Another image is used';
      case 'crop': return 'A crop of this image is used';
      case 'blur': return 'It is shown whole on a blurred background';
      case 'native': return 'Square image: fits phones and computers';
      case 'unknown': return 'Size unknown';
      default: return 'Not set yet';
    }
  })();

  return (
    <Sheet visible onClose={onClose} title="Compatibility">
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        <View style={{ width: 70, aspectRatio: status.shape === 'portrait' ? 9 / 16 : 16 / 9, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.panel2 }}>
          <CachedImage uri={w.thumb} style={StyleSheet.absoluteFill as ImageStyle} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={text.h2}>
            {status.shape === 'unknown' ? 'Checking the size…' : status.shape === 'square' ? 'Square image' : `A ${SHAPE_LABEL[status.shape]} image`}
          </Text>
          {w.width && w.height ? <Text style={text.small}>{w.width}×{w.height}</Text> : null}
          <Text style={{ color: status.state === 'none' ? colors.warn : colors.ok, marginTop: 4 }}>
            {need ? `On ${WHERE[need]}: ${stateText}` : stateText}
          </Text>
        </View>
      </View>

      {need ? (
        <>
          <Text style={text.muted}>
            This is a {SHAPE_LABEL[status.shape as Shape]} image, so it will not fit {WHERE[need]} well. Pick how it should look there{need === me ? ' (that is this device)' : ''}.
          </Text>

          <View style={{ gap: 8, marginTop: 14 }}>
            <Pressable style={s.option} onPress={() => setSearching(true)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="search" size={18} /><Text style={[text.h2, { marginBottom: 0 }]}>Search similar</Text></View>
              <Text style={text.small}>Search for a {SHAPE_LABEL[need]} picture of the same thing (e.g. the same character) and use that one there.</Text>
            </Pressable>
            <Pressable style={s.option} onPress={() => setCropping(true)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="expand" size={18} /><Text style={[text.h2, { marginBottom: 0 }]}>Crop it</Text></View>
              <Text style={text.small}>Use the part of this picture you choose.</Text>
            </Pressable>
            <Pressable style={s.option} onPress={() => { setVariant(store, w, { kind: 'blur' }); done('Saved'); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="image" size={18} /><Text style={[text.h2, { marginBottom: 0 }]}>Blurred background</Text></View>
              <Text style={text.small}>Show the whole picture over a blurred copy of itself.</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {status.variant ? <Btn title="Remove choice" icon="trash" kind="danger" onPress={() => { clearVariant(store, w.id); done('Choice removed'); }} style={{ flex: 1 }} /> : null}
        <Btn title={status.variant ? 'Done' : 'Skip for now'} onPress={onClose} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

// ------------------------------------------------------------------ crop editor

/**
 * Drag the frame to choose which part of the picture is used, zoom with the buttons.
 * The frame always has the shape of the screens it is for, so what you see is what you get.
 */
function CropEditor({ w, target, initial, onCancel, onSave }: { w: Wallpaper; target: Shape; initial?: Crop; onCancel: () => void; onSave: (c: Crop) => void }) {
  const insets = useInsets();
  const iw = w.width ?? 1;
  const ih = w.height ?? 1;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(() => {
    if (initial) return { cx: initial.x + initial.w / 2, cy: initial.y + initial.h / 2, scale: Math.min(1, initial.h / placeCrop(iw, ih, target, 0.5, 0.5, 1).h) };
    return { cx: 0.5, cy: 0.5, scale: 1 };
  });
  const viewRef = useRef(view);
  viewRef.current = view;
  const boxRef = useRef(box);
  boxRef.current = box;
  const start = useRef({ cx: 0.5, cy: 0.5 });

  const crop = placeCrop(iw, ih, target, view.cx, view.cy, view.scale);
  // where the picture is drawn inside the box (resizeMode contain)
  const a = iw / ih;
  const dw = box.w && box.h ? (a > box.w / box.h ? box.w : box.h * a) : 0;
  const dh = box.w && box.h ? (a > box.w / box.h ? box.w / a : box.h) : 0;
  const ox = (box.w - dw) / 2;
  const oy = (box.h - dh) / 2;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start.current = { cx: viewRef.current.cx, cy: viewRef.current.cy };
      },
      onPanResponderMove: (_e, g) => {
        const b = boxRef.current;
        const pa = iw / ih;
        const pw = b.w && b.h ? (pa > b.w / b.h ? b.w : b.h * pa) : 1;
        const ph = b.w && b.h ? (pa > b.w / b.h ? b.w / pa : b.h) : 1;
        setView((v) => ({ ...v, cx: Math.min(1, Math.max(0, start.current.cx + g.dx / pw)), cy: Math.min(1, Math.max(0, start.current.cy + g.dy / ph)) }));
      },
    }),
  ).current;

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8) }}>
        <Text style={[text.h2, { padding: 14, paddingBottom: 6 }]}>Crop for {WHERE[target]}</Text>
        <Text style={[text.small, { paddingHorizontal: 14 }]}>Drag the frame over the part you want. The frame has the shape of a {SHAPE_LABEL[target]} screen.</Text>
        <View style={{ flex: 1, margin: 14 }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} {...pan.panHandlers}>
          <CachedImage uri={w.thumb} style={StyleSheet.absoluteFill as ImageStyle} resizeMode="contain" />
          {dw > 0 && (
            <>
              {/* dim everything outside the frame */}
              <View style={[s.dim, { left: ox, top: oy, width: dw, height: crop.y * dh }]} />
              <View style={[s.dim, { left: ox, top: oy + (crop.y + crop.h) * dh, width: dw, height: (1 - crop.y - crop.h) * dh }]} />
              <View style={[s.dim, { left: ox, top: oy + crop.y * dh, width: crop.x * dw, height: crop.h * dh }]} />
              <View style={[s.dim, { left: ox + (crop.x + crop.w) * dw, top: oy + crop.y * dh, width: (1 - crop.x - crop.w) * dw, height: crop.h * dh }]} />
              <View pointerEvents="none" style={{ position: 'absolute', left: ox + crop.x * dw, top: oy + crop.y * dh, width: crop.w * dw, height: crop.h * dh, borderWidth: 2, borderColor: colors.accent }} />
            </>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 8 }}>
          <Btn title="Zoom out" icon="chevronDown" onPress={() => setView((v) => ({ ...v, scale: Math.min(1, v.scale + 0.12) }))} style={{ flex: 1 }} />
          <Btn title="Zoom in" icon="plus" onPress={() => setView((v) => ({ ...v, scale: Math.max(0.25, v.scale - 0.12) }))} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14 }}>
          <Btn title="Cancel" onPress={onCancel} style={{ flex: 1 }} />
          <Btn title="Save crop" kind="primary" icon="check" onPress={() => onSave(crop)} style={{ flex: 2 }} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  option: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel2, borderRadius: 12, padding: 12, gap: 4 },
  cell: { borderRadius: 8, overflow: 'hidden', backgroundColor: colors.panel2, borderWidth: 3, borderColor: 'transparent' },
  tick: { position: 'absolute', top: 4, right: 4, backgroundColor: colors.accent, borderRadius: 10, padding: 3 },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,.6)' },
});
