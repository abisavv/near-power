import { supabase } from '@/utils/supabase';

export async function signIn(
  email: string,
  password: string
) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  // Ensure this account has an access request.
  await supabase.rpc('ensure_access_request');

  return data.user;
}