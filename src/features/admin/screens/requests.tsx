import React, {
  useCallback,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  useFocusEffect,
  useRouter,
} from 'expo-router';

import {
  ArrowLeft,
  Bell,
  Check,
  ChevronDown,
  RefreshCw,
  Search,
  X,
} from 'lucide-react-native';

import { supabase } from '@/utils/supabase';
import { useApp } from '@/context/AppContext';

type AccessRequest = {
  id: string;
  user_id: string;
  requested_email: string | null;
  display_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  reviewed_at?: string | null;
  assigned_consumer_id: string | null;
};

type Consumer = {
  id: string;
  meter_number: string;
  serial_number?: string;
  full_name?: string;
  is_active: boolean;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Date unavailable';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getErrorMessage = (error: unknown) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  ) {
    return String(error.message);
  }

  return error instanceof Error
    ? error.message
    : 'An unexpected error occurred.';
};

export default function AccessRequestsScreen() {
  const router = useRouter();

  const { isDarkMode, isOnline } = useApp();

  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [consumers, setConsumers] = useState<Consumer[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [consumerError, setConsumerError] = useState<string | null>(null);

  const [busyUser, setBusyUser] = useState<string | null>(null);

  const [selected, setSelected] =
    useState<AccessRequest | null>(null);

  const [chosenConsumer, setChosenConsumer] =
    useState<Consumer | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(
    async (showRefresh = false) => {
      if (!isOnline) {
        setLoading(false);
        setRefreshing(false);
        setLoadError('You are offline. Connect to the internet to load access requests.');
        return;
      }

      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setLoadError(null);
      setConsumerError(null);

      try {
        // Requests are the primary data.
        // A consumer-list error should not hide existing requests.
        const requestResult = await supabase
          .from('access_requests')
          .select(
            'id,user_id,requested_email,display_name,status,requested_at,reviewed_at,assigned_consumer_id',
          )
          .order('requested_at', { ascending: false });

        if (requestResult.error) {
          throw requestResult.error;
        }

        setRequests(
          (requestResult.data ?? []) as AccessRequest[],
        );

        // Load consumers separately.
        const consumerResult = await supabase
          .from('consumers')
          .select(
            'id,meter_number,serial_number,full_name,is_active',
          )
          .order('meter_number', { ascending: true });

        if (consumerResult.error) {
          setConsumerError(consumerResult.error.message);
          setConsumers([]);
        } else {
          const sorted = (
            (consumerResult.data ?? []) as Consumer[]
          ).sort((a, b) =>
            String(a.meter_number).localeCompare(
              String(b.meter_number),
              undefined,
              { numeric: true, sensitivity: 'base' },
            ),
          );

          setConsumers(sorted);
        }
      } catch (error) {
        setLoadError(getErrorMessage(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isOnline],
  );

  // Reload whenever the Requests screen becomes active.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const pendingRequests = useMemo(
    () =>
      requests.filter(
        request =>
          String(request.status).toLowerCase() === 'pending',
      ),
    [requests],
  );

  const processedRequests = useMemo(
    () =>
      requests.filter(
        request =>
          String(request.status).toLowerCase() !== 'pending',
      ),
    [requests],
  );

  const filteredConsumers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return consumers.filter(consumer => {
      if (!query) return true;

      return [
        consumer.id,
        consumer.meter_number,
        consumer.serial_number,
        consumer.full_name,
      ].some(value =>
        String(value ?? '').toLowerCase().includes(query),
      );
    });
  }, [consumers, search]);

  const userLabel = (request: AccessRequest) => {
    return (
      request.display_name ||
      request.requested_email ||
      request.user_id ||
      'Unknown account'
    );
  };

  const closeReview = () => {
    setSelected(null);
    setChosenConsumer(null);
    setPickerOpen(false);
    setSearch('');
  };

  const choose = async (
    decision: 'approved' | 'rejected',
  ) => {
    if (!selected) return;

    if (
      decision === 'approved' &&
      !chosenConsumer
    ) {
      Alert.alert(
        'Select a consumer',
        'Choose the consumer record (C-ID) to link to this account.',
      );

      return;
    }

    const userId = selected.user_id;

    setBusyUser(userId);

    try {
      const result =
        decision === 'approved'
          ? await supabase.rpc('approve_access_request', {
              p_request_id: selected.id,
              p_consumer_id: chosenConsumer!.id,
            })
          : await supabase.rpc('reject_access_request', {
              p_request_id: selected.id,
            });

      if (result.error) {
        throw result.error;
      }

      Alert.alert(
        decision === 'approved'
          ? 'Account approved'
          : 'Request declined',
        decision === 'approved'
          ? `The account is now linked to ${chosenConsumer!.id}.`
          : 'The access request was declined.',
      );

      closeReview();

      await load(true);
    } catch (error) {
      Alert.alert(
        'Action failed',
        getErrorMessage(error),
      );
    } finally {
      setBusyUser(null);
    }
  };

  const renderConsumerPicker = () => (
    <Modal
      visible={pickerOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setPickerOpen(false)}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="max-h-[85%] rounded-t-3xl bg-surface p-4">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-text">
              Choose consumer
            </Text>

            <Pressable
              onPress={() => setPickerOpen(false)}
              className="h-9 w-9 items-center justify-center rounded-xl bg-surface-secondary"
            >
              <X size={19} color="#8A6B8F" />
            </Pressable>
          </View>

          <View className="mb-3 h-12 flex-row items-center rounded-xl border border-border bg-background px-3">
            <Search size={17} color="#8A6B8F" />

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search C-ID, meter or name"
              placeholderTextColor="#897F85"
              className="ml-2 flex-1 text-sm text-text"
            />
          </View>

          {filteredConsumers.length === 0 ? (
            <Text className="py-8 text-center text-sm text-text-muted">
              No matching consumers found.
            </Text>
          ) : (
            <ScrollView>
              {filteredConsumers.map(consumer => (
                <Pressable
                  key={consumer.id}
                  onPress={() => {
                    setChosenConsumer(consumer);
                    setPickerOpen(false);
                    setSearch('');
                  }}
                  className="border-b border-border py-3"
                >
                  <Text className="text-sm font-semibold text-text">
                    {consumer.id} · Meter {consumer.meter_number}
                  </Text>

                  <Text className="mt-1 text-xs text-text-secondary">
                    {consumer.full_name ?? 'Unnamed consumer'}
                    {consumer.serial_number
                      ? ` · Serial ${consumer.serial_number}`
                      : ''}
                  </Text>

                  {!consumer.is_active && (
                    <Text className="mt-1 text-[10px] font-semibold text-warning">
                      INACTIVE CONSUMER
                    </Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-4">
        <Pressable
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface"
        >
          <ArrowLeft
            size={19}
            color={isDarkMode ? '#E8DDEB' : '#493A4D'}
          />
        </Pressable>

        <View className="flex-1">
          <Text className="text-xl font-bold text-text">
            Access requests
          </Text>

          <Text className="text-xs text-text-secondary">
            Review and link consumer accounts
          </Text>
        </View>

        <Pressable
          onPress={() => void load(true)}
          disabled={loading || refreshing}
          className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface"
        >
          <RefreshCw
            size={17}
            color="#8A6B8F"
          />
        </Pressable>
      </View>

      {/* Main content */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator
            size="large"
            color="#8A6B8F"
          />

          <Text className="mt-3 text-sm text-text-secondary">
            Loading access requests...
          </Text>
        </View>
      ) : loadError ? (
        <View className="m-4 rounded-2xl border border-danger/30 bg-danger-bg p-4">
          <Text className="font-bold text-danger">
            Unable to load access requests
          </Text>

          <Text className="mt-2 text-sm text-text">
            {loadError}
          </Text>

          <Pressable
            onPress={() => void load(true)}
            className="mt-4 min-h-11 items-center justify-center rounded-xl bg-primary"
          >
            <Text className="font-semibold text-on-primary">
              Try again
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="p-4 pb-32"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
            />
          }
        >
          {/* Summary */}
          <View className="mb-4 flex-row gap-3">
            <View className="flex-1 rounded-2xl border border-border bg-surface p-4">
              <Text className="text-xs text-text-muted">
                PENDING
              </Text>

              <Text className="mt-1 text-2xl font-bold text-warning">
                {pendingRequests.length}
              </Text>
            </View>

            <View className="flex-1 rounded-2xl border border-border bg-surface p-4">
              <Text className="text-xs text-text-muted">
                PROCESSED
              </Text>

              <Text className="mt-1 text-2xl font-bold text-success">
                {processedRequests.length}
              </Text>
            </View>

            <View className="flex-1 rounded-2xl border border-border bg-surface p-4">
              <Text className="text-xs text-text-muted">
                TOTAL
              </Text>

              <Text className="mt-1 text-2xl font-bold text-text">
                {requests.length}
              </Text>
            </View>
          </View>

          {consumerError ? (
            <View className="mb-4 rounded-xl border border-warning/30 bg-warning-bg p-3">
              <Text className="text-xs text-text">
                Consumer records could not be loaded: {consumerError}
              </Text>
            </View>
          ) : null}

          {/* Pending requests */}
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base font-bold text-text">
              Pending requests
            </Text>

            <Text className="text-xs text-text-muted">
              {pendingRequests.length} requests
            </Text>
          </View>

          {pendingRequests.length === 0 ? (
            <View className="items-center rounded-2xl border border-border bg-surface p-8">
              <Bell size={30} color="#8A6B8F" />

              <Text className="mt-3 font-semibold text-text">
                No pending requests
              </Text>

              <Text className="mt-1 text-center text-sm text-text-secondary">
                New account requests will appear here when users submit them.
              </Text>
            </View>
          ) : (
            pendingRequests.map(request => (
              <View
                key={request.id}
                className="mb-3 rounded-2xl border border-border bg-surface p-4"
              >
                <Text className="text-base font-bold text-text">
                  {userLabel(request)}
                </Text>

                <Text className="mt-1 text-xs text-text-secondary">
                  {request.requested_email ?? ''}
                </Text>

                <Text className="mt-3 text-[11px] text-text-muted">
                  User ID: {request.user_id}
                </Text>

                <Text className="mt-1 text-[11px] text-text-muted">
                  Submitted: {formatDate(request.requested_at)}
                </Text>

                <Pressable
                  onPress={() => {
                    setSelected(request);
                    setChosenConsumer(null);
                  }}
                  className="mt-4 min-h-11 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4"
                >
                  <Check size={16} color="#FFFFFF" />

                  <Text className="font-semibold text-on-primary">
                    Review request
                  </Text>
                </Pressable>
              </View>
            ))
          )}

          {/* Previously processed */}
          <Text className="mb-3 mt-6 text-base font-bold text-text">
            Previously processed
          </Text>

          {processedRequests.length === 0 ? (
            <View className="rounded-2xl border border-border bg-surface p-4">
              <Text className="text-center text-sm text-text-muted">
                No processed requests yet.
              </Text>
            </View>
          ) : (
            processedRequests.map(request => {
              const approved =
                request.status === 'approved';

              return (
                <View
                  key={request.id}
                  className="mb-2 flex-row items-center justify-between rounded-xl border border-border bg-surface p-3"
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-semibold text-text">
                      {userLabel(request)}
                    </Text>

                    <Text className="mt-1 text-xs text-text-muted">
                      {request.assigned_consumer_id
                        ? `Linked to ${request.assigned_consumer_id}`
                        : 'No consumer linked'}
                    </Text>

                    <Text className="mt-1 text-[10px] text-text-muted">
                      {formatDate(request.requested_at)}
                    </Text>
                  </View>

                  <Text
                    className={`text-xs font-bold ${
                      approved
                        ? 'text-success'
                        : 'text-danger'
                    }`}
                  >
                    {request.status.toUpperCase()}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Review request modal */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={closeReview}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="rounded-t-3xl bg-surface p-5">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-text">
                Review account
              </Text>

              <Pressable
                onPress={closeReview}
                className="h-9 w-9 items-center justify-center rounded-xl bg-surface-secondary"
              >
                <X size={19} color="#8A6B8F" />
              </Pressable>
            </View>

            <Text className="text-sm font-semibold text-text">
              {selected ? userLabel(selected) : ''}
            </Text>

            <Text className="mt-1 text-xs text-text-muted">
              {selected?.requested_email ?? ''}
            </Text>

            <Text className="mb-2 mt-5 text-sm font-semibold text-text">
              Assign consumer C-ID
            </Text>

            <Pressable
              onPress={() => setPickerOpen(true)}
              className="min-h-12 flex-row items-center justify-between rounded-xl border border-border bg-background px-4"
            >
              <Text
                numberOfLines={2}
                className="flex-1 pr-2 text-sm text-text"
              >
                {chosenConsumer
                  ? `${chosenConsumer.id} · Meter ${chosenConsumer.meter_number} · ${chosenConsumer.full_name ?? ''}`
                  : 'Select consumer account'}
              </Text>

              <ChevronDown size={18} color="#8A6B8F" />
            </Pressable>

            <Pressable
              disabled={!!busyUser}
              onPress={() => void choose('approved')}
              className="mt-5 min-h-12 items-center justify-center rounded-xl bg-primary disabled:opacity-50"
            >
              {busyUser ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="font-bold text-on-primary">
                  Approve and link account
                </Text>
              )}
            </Pressable>

            <Pressable
              disabled={!!busyUser}
              onPress={() =>
                Alert.alert(
                  'Decline request?',
                  'This account will not be linked to a consumer.',
                  [
                    {
                      text: 'Cancel',
                      style: 'cancel',
                    },
                    {
                      text: 'Decline',
                      style: 'destructive',
                      onPress: () => void choose('rejected'),
                    },
                  ],
                )
              }
              className="mt-2 min-h-12 items-center justify-center rounded-xl border border-danger"
            >
              <Text className="font-semibold text-danger">
                Decline request
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {renderConsumerPicker()}
    </View>
  );
}
