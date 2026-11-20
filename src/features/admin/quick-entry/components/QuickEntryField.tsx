import React from 'react';
import { Text, TextInput, View } from 'react-native';

export function QuickEntryField({ label, value, onChangeText, keyboardType = 'default', placeholder }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'decimal-pad' | 'numeric';
  placeholder?: string;
}) {
  return (
    <View className="flex-1">
      <Text className="mb-1 text-[11px] font-semibold text-text-muted">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#897F85"
        selectTextOnFocus
        className="h-11 rounded-xl border border-input-border bg-input px-3 text-sm text-text"
      />
    </View>
  );
}

