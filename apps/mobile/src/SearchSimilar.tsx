import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type ImageStyle } from 'react-native';
import { CATEGORIES, searchSeed, type CategoryId, type Shape, type Wallpaper } from '@wallpepper/core';
import { CachedImage } from './CachedImage';
import { makeBrowse, useAppState, useBrowseOf } from './ctx';
import { useInsets } from './insets';
import { Btn, Chip, colors, Icon, IconBtn, text } from './ui';

const WHERE: Record<Shape, string> = { portrait: 'phones', landscape: 'computers' };

/**
 * "Search similar": the Browse screen, showing only pictures of the other orientation. It starts from the words of the
 * wallpaper's title; search freely (e.g. "naruto" or "kakashi") and pick the substitute.
 */
export function SearchSimilar({ w, target, onCancel, onPick }: { w: Wallpaper; target: Shape; onCancel: () => void; onPick: (alt: Wallpaper) => void }) {
  const state = useAppState();
  const insets = useInsets();
  const { width } = useWindowDimensions();
  const seed = useMemo(() => searchSeed(state, w), [w.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [category, setCategory] = useState<CategoryId>(seed.category);
  const [query, setQuery] = useState(seed.query);
  const [picked, setPicked] = useState<Wallpaper | null>(null);
  const browse = useMemo(() => makeBrowse({ category: seed.category, query: seed.query, sort: 'popular' }, target), [target]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = useBrowseOf(browse);
  const cols = target === 'portrait' ? 3 : 2;
  const tile = (width - 16 * 2 - 8 * (cols - 1)) / cols;

  useEffect(() => {
    void browse.reload();
  }, [browse]);

  const search = (patch: { category?: CategoryId; query?: string }) => {
    setPicked(null);
    void browse.setFilters({ ...patch, tag: undefined, sourceId: 'all' });
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8) }}>
        <View style={s.head}>
          <IconBtn name="chevronLeft" label="Back" onPress={onCancel} style={{ backgroundColor: colors.panel2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[text.h2, { marginBottom: 0 }]}>Find a {target} version</Text>
            <Text style={text.small}>Only {target} pictures are shown, so what you pick fits {WHERE[target]}.</Text>
          </View>
          <View style={[s.orig, { aspectRatio: target === 'portrait' ? 16 / 9 : 9 / 16, height: 44 }]}>
            <CachedImage uri={w.thumb} style={StyleSheet.absoluteFill as ImageStyle} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} label={c.label} bold={c.main} on={category === c.id} onPress={() => { setCategory(c.id); search({ category: c.id }); }} />
          ))}
        </ScrollView>
        <View style={s.searchRow}>
          <View style={s.search}>
            <Icon name="search" size={16} color={colors.muted} />
            <TextInput
              style={{ flex: 1, color: colors.text, paddingVertical: 8 }}
              placeholder="Search, e.g. naruto or kakashi"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              onSubmitEditing={() => search({ query })}
            />
          </View>
          <Btn title="Search" kind="primary" onPress={() => search({ query })} />
        </View>
        {b.errors.map((e) => <Text key={e.sourceId} style={[text.warn, { paddingHorizontal: 16 }]}>{e.sourceName}: {e.message}</Text>)}

        <FlatList
          data={b.items}
          key={cols}
          numColumns={cols}
          keyExtractor={(a) => a.id}
          columnWrapperStyle={{ gap: 8, paddingHorizontal: 16 }}
          contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
          onEndReachedThreshold={1.5}
          onEndReached={() => void browse.loadMore()}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setPicked(picked?.id === item.id ? null : item)}
              style={[s.cell, { width: tile, aspectRatio: target === 'portrait' ? 9 / 16 : 16 / 9 }, picked?.id === item.id && { borderColor: colors.accent }]}
            >
              <CachedImage uri={item.thumb} style={StyleSheet.absoluteFill as ImageStyle} />
              {picked?.id === item.id && <View style={s.tick}><Icon name="check" size={14} color="#fff" /></View>}
            </Pressable>
          )}
          ListEmptyComponent={b.loading ? undefined : <Text style={[text.muted, { textAlign: 'center', padding: 30 }]}>No {target} pictures found. Try other words or another category.</Text>}
          ListFooterComponent={<Text style={[text.muted, { textAlign: 'center', padding: 12 }]}>{b.loading ? 'Loading…' : ''}</Text>}
        />

        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8 }}>
          <Btn title="Cancel" onPress={onCancel} style={{ flex: 1 }} />
          <Btn title="Use this picture" kind="primary" icon="check" disabled={!picked} onPress={() => picked && onPick(picked)} style={{ flex: 2 }} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingBottom: 10 },
  orig: { borderRadius: 6, overflow: 'hidden', backgroundColor: colors.panel2 },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.panel2, borderColor: colors.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  cell: { borderRadius: 10, overflow: 'hidden', backgroundColor: colors.panel2, borderWidth: 3, borderColor: 'transparent' },
  tick: { position: 'absolute', top: 6, right: 6, backgroundColor: colors.accent, borderRadius: 10, padding: 3 },
});
