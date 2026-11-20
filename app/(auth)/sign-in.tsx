import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff, LockKeyhole, Mail, Zap } from 'lucide-react-native';

export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing information', 'Enter your email address and password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
      router.replace('/');
    } catch (error) {
      Alert.alert('Unable to sign in', error instanceof Error ? 'Please check your internet connection.' : 'Please check your details.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerClassName="grow justify-center px-6 py-10" keyboardShouldPersistTaps="handled">
        <View className="mx-auto w-full max-w-[460px]">
          <View className="mb-8">
            <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl bg-primary">
              <Zap size={27} color="#FFFFFF" strokeWidth={2.2} />
            </View>
            <Text className="font-jakarta text-3xl text-text">Welcome back</Text>
            <Text className="mt-2 text-base leading-6 text-text-secondary">Sign in to your NEAR Power account.</Text>
          </View>
          <View className="gap-5 rounded-3xl border border-border bg-surface p-5">
            <View>
              <View className="mb-2 flex-row items-center gap-2"><Mail size={15} color="#8A6B8F" /><Text className="text-sm font-semibold text-text">Email address</Text></View>
              <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" placeholder="name@example.com" placeholderTextColor="#897F85" className="h-14 rounded-2xl border border-input-border bg-input px-4 text-base text-text" />
            </View>
            <View>
              <View className="mb-2 flex-row items-center gap-2"><LockKeyhole size={15} color="#8A6B8F" /><Text className="text-sm font-semibold text-text">Password</Text></View>
              <View className="h-14 flex-row items-center rounded-2xl border border-input-border bg-input px-4">
                <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" textContentType="password" placeholder="Your password" placeholderTextColor="#897F85" className="flex-1 text-base text-text" />
                <Pressable onPress={() => setShowPassword(value => !value)} hitSlop={10}>
                  {showPassword ? <EyeOff size={19} color="#8A6B8F" /> : <Eye size={19} color="#8A6B8F" />}
                </Pressable>
              </View>
            </View>
            <Pressable onPress={submit} disabled={busy} className="h-14 flex-row items-center justify-center rounded-2xl bg-primary active:opacity-80">
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-semibold text-on-primary">Sign in</Text>}
            </Pressable>
          </View>
          <View className="mt-7 flex-row justify-center gap-1">
            <Text className="text-text-secondary">Don't have an account?</Text>
            <Link href="/(auth)/sign-up" className="font-semibold text-text-secondary">Create one</Link>
          </View>
          <Text className="mt-7 text-center text-xs leading-5 text-text-muted">Consumer billing access requires administrator approval.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
