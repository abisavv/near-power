import React from 'react';
import { Text, TextInput, View } from 'react-native';

export function NumericField({ label, value, onChangeText, helper }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  helper: string;
}) {
  return <View className="mb-4 rounded-2xl border border-border bg-surface p-4">
    <Text className="text-sm font-semibold text-text">{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} keyboardType="decimal-pad" selectTextOnFocus placeholder="0" placeholderTextColor="#897F85" className="mt-3 h-12 rounded-xl border border-input-border bg-input px-3 text-base font-semibold text-text" />
    <Text className="mt-2 text-xs leading-5 text-text-muted">{helper}</Text>
  </View>;
}
