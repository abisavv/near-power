import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { LockKeyhole, Mail, Phone, UserRound, Zap } from 'lucide-react-native';

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!fullName.trim() || !phone.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Missing information', 'Complete every field to create your account.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Enter the same password in both password fields.');
      return;
    }
    setBusy(true);
    try {
      const result = await signUp({ fullName, phone, email, password });
      if (result.needsEmailConfirmation) {
        Alert.alert('Check your email', 'Your account was created. Verify your email before signing in. Consumer access remains pending until an administrator reviews it.', [
          { text: 'Continue', onPress: () => router.replace('/(auth)/sign-in') },
        ]);
      } else {
        Alert.alert('Account created', 'Your consumer access request is awaiting administrator approval.', [
          { text: 'Continue', onPress: () => router.replace('/') },
        ]);
      }
    } catch (error) {
      Alert.alert('Unable to create account', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const fieldClass = 'h-14 rounded-2xl border border-input-border bg-input px-4 text-base text-text';
  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerClassName="grow justify-center px-6 py-10" keyboardShouldPersistTaps="handled">
        <View className="mx-auto w-full max-w-[460px]">
          <View className="mb-7">
            <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl bg-primary"><Zap size={27} color="#FFFFFF" strokeWidth={2.2} /></View>
            <Text className="font-jakarta text-3xl text-text">Create your account</Text>
            <Text className="mt-2 text-base leading-6 text-text-secondary">Register to request access to your consumer billing information.</Text>
          </View>
          <View className="gap-4 rounded-3xl border border-border bg-surface p-5">
            <View><View className="mb-2 flex-row items-center gap-2"><UserRound size={15} color="#8A6B8F" /><Text className="text-sm font-semibold text-text">Full name</Text></View><TextInput value={fullName} onChangeText={setFullName} autoCapitalize="words" placeholder="Your full name" placeholderTextColor="#897F85" className={fieldClass} /></View>
            <View><View className="mb-2 flex-row items-center gap-2"><Phone size={15} color="#8A6B8F" /><Text className="text-sm font-semibold text-text">Phone number</Text></View><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="03XX-XXXXXXX" placeholderTextColor="#897F85" className={fieldClass} /></View>
            <View><View className="mb-2 flex-row items-center gap-2"><Mail size={15} color="#8A6B8F" /><Text className="text-sm font-semibold text-text">Email address</Text></View><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="name@example.com" placeholderTextColor="#897F85" className={fieldClass} /></View>
            <View><View className="mb-2 flex-row items-center gap-2"><LockKeyhole size={15} color="#8A6B8F" /><Text className="text-sm font-semibold text-text">Password</Text></View><TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" placeholderTextColor="#897F85" className={fieldClass} /></View>
            <View><View className="mb-2 flex-row items-center gap-2"><LockKeyhole size={15} color="#8A6B8F" /><Text className="text-sm font-semibold text-text">Confirm password</Text></View><TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="Enter password again" placeholderTextColor="#897F85" className={fieldClass} /></View>
            <Pressable onPress={submit} disabled={busy} className="mt-2 h-14 flex-row items-center justify-center rounded-2xl bg-primary active:opacity-80">
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-semibold text-on-primary">Create account</Text>}
            </Pressable>
          </View>
          <View className="mt-7 flex-row justify-center gap-1"><Text className="text-text-secondary">Already registered?</Text><Link href="/(auth)/sign-in" className="font-semibold text-tertiary">Sign in</Link></View>
          <Text className="mt-6 text-center text-xs leading-5 text-text-muted">Registration never grants administrator privileges or immediate access to consumer records.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
