import { useEffect, useRef, useState } from 'react';
import { FlatList, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { ScrollView } from 'react-native';
import { CATEGORIES, getSources, sourceSupports, type Orientation, type Sort, type Wallpaper } from '@wallpepper/core';
import { GroupSheet, PreviewModal, Tile } from '../components';
import { getCtx, useAppState, useBrowse } from '../ctx';
import { Btn, Chip, colors, Select, text } from '../ui';

export function BrowseScreen() {
  const { browse } = getCtx();
  const state = useAppState();
  const b = useBrowse();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState(b.filters.query);
  const [preview, setPreview] = useState<Wallpaper | null>(null);
  const [grouping, setGrouping] = useState<Wallpaper | null>(null);
  const tile = (width - 16 * 2 - 10) / 2;

  const sources = getSources(state).filter((s) => s.enabled && sourceSupports(s, b.filters.category));
  const sig = JSON.stringify(getSources(state).map((s) => [s.id, s.enabled, s.options]));
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current !== sig) {
      last.current = sig;
      void browse.reload();
    }
  }, [sig, browse]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} label={c.label} bold={c.main} on={b.filters.category === c.id} onPress={() => void browse.setFilters({ category: c.id, sourceId: 'all' })} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <TextInput
            style={{ flex: 1, backgroundColor: colors.panel2, borderColor: colors.line, borderWidth: 1, borderRadius: 10, color: colors.text, paddingHorizontal: 12 }}
            placeholder="Search…"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={() => void browse.setFilters({ query })}
          />
          <Btn title="Search" icon="search" kind="primary" onPress={() => void browse.setFilters({ query })} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Select
              label="Orientation"
              value={b.orientation}
              options={[{ value: 'any', label: 'All' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]}
              onChange={(v) => browse.setOrientation(v as Orientation)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Select label="Sort" value={b.filters.sort} options={[{ value: 'latest', label: 'Latest' }, { value: 'popular', label: 'Popular' }, { value: 'random', label: 'Random' }]} onChange={(v) => void browse.setFilters({ sort: v as Sort })} />
          </View>
          <View style={{ flex: 1 }}>
            <Select label="Source" value={b.filters.sourceId} options={[{ value: 'all', label: 'All sources' }, ...sources.map((s) => ({ value: s.id, label: s.name }))]} onChange={(v) => void browse.setFilters({ sourceId: v })} />
          </View>
        </View>
        {b.fromCache && <Text style={text.small}>Showing saved results{b.loading ? ' · refreshing…' : ' (offline)'}</Text>}
        {b.errors.map((e) => (
          <Text key={e.sourceId} style={text.warn}>{e.sourceName}: {e.message}</Text>
        ))}
      </View>

      <FlatList
        data={b.items}
        keyExtractor={(w) => w.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        onEndReachedThreshold={1.5}
        onEndReached={() => void browse.loadMore()}
        renderItem={({ item }) => <Tile w={item} width={tile} onOpen={() => setPreview(item)} onGroup={() => setGrouping(item)} />}
        ListEmptyComponent={
          b.loading ? undefined : <Text style={[text.muted, { textAlign: 'center', padding: 40 }]}>No enabled source offers this category. Turn one on in Settings › Sources.</Text>
        }
        ListFooterComponent={<Text style={[text.muted, { textAlign: 'center', padding: 16 }]}>{b.loading ? 'Loading…' : ''}</Text>}
      />

      <PreviewModal w={preview} onClose={() => setPreview(null)} onGroup={() => setGrouping(preview)} />
      <GroupSheet w={grouping} onClose={() => setGrouping(null)} />
    </View>
  );
}
