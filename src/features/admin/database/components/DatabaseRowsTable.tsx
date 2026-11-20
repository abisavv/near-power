import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Database, Pencil } from 'lucide-react-native';

type DatabaseRow = Record<string, unknown>;

export function DatabaseRowsTable({
  loading, isDarkMode, columns, rows, hasMore, loadingMore,
  pageSize, primaryKey, onSelectRow, onLoadMore,
}: {
  loading: boolean;
  isDarkMode: boolean;
  columns: string[];
  rows: DatabaseRow[];
  hasMore: boolean;
  loadingMore: boolean;
  pageSize: number;
  primaryKey: string;
  onSelectRow: (row: DatabaseRow) => void;
  onLoadMore: () => void;
}) {
  if (loading) return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={isDarkMode ? '#C7ACCE' : '#62446A'} /><Text className="mt-3 text-sm text-text-muted">Loading database rows…</Text></View>;

  const labelOf = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const displayValue = (value: unknown) => value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);

  return <ScrollView className="flex-1" horizontal showsHorizontalScrollIndicator>
    <View className="min-w-full px-4 pb-28">
      <ScrollView nestedScrollEnabled stickyHeaderIndices={[0]}>
        <View className="flex-row rounded-t-xl bg-primary px-3 py-3">
          {columns.map(key => <Text key={key} numberOfLines={1} className="w-36 pr-3 text-xs font-bold text-on-primary">{labelOf(key)}</Text>)}
          <Text className="w-20 text-xs font-bold text-on-primary">Action</Text>
        </View>
        {rows.map((row, index) => <Pressable key={String(row[primaryKey] ?? index)} onPress={() => onSelectRow(row)} className={`min-h-14 flex-row items-center border-b border-divider px-3 py-2 ${index % 2 ? 'bg-surface' : 'bg-background'}`}>
          {columns.map(key => <Text key={key} numberOfLines={2} className="w-36 pr-3 text-xs leading-5 text-text">{displayValue(row[key])}</Text>)}
          <View className="w-20 flex-row items-center gap-1"><Pencil size={13} color={isDarkMode ? '#C7ACCE' : '#62446A'} /><Text className="text-xs font-semibold text-tertiary">Edit</Text></View>
        </Pressable>)}
        {!rows.length ? <View className="items-center rounded-b-xl border border-border bg-surface p-8"><Database size={24} color={isDarkMode ? '#A99BAE' : '#897F85'} /><Text className="mt-3 text-sm text-text-secondary">No rows found.</Text></View> : null}
        {hasMore ? <Pressable disabled={loadingMore} onPress={onLoadMore} className="my-3 min-h-11 items-center justify-center rounded-xl border border-border bg-surface">{loadingMore ? <ActivityIndicator /> : <Text className="text-sm font-semibold text-tertiary">Load next {pageSize} rows</Text>}</Pressable> : null}
      </ScrollView>
    </View>
  </ScrollView>;
}
