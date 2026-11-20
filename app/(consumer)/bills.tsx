import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { formatRupees } from '@/utils/billing';

export default function ConsumerBillsScreen() {
  const { session, billingRecords, isLoading } = useApp();
  const [expanded, setExpanded] = useState<string | null>(null);
  const bills = useMemo(() => billingRecords.filter(item => item.consumerId === session.consumerId)
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.billId.localeCompare(a.billId, undefined, { numeric: true })), [billingRecords, session.consumerId]);
  if (isLoading && !bills.length) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator/></View>;
  return <ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pb-32 pt-6">
    <Text className="text-xs font-semibold uppercase tracking-widest text-tertiary">NEAR POWER</Text><Text className="mt-2 text-2xl font-bold text-text">My bills</Text><Text className="mt-1 text-sm text-text-secondary">Current and previous billing records</Text>
    {bills.map(bill => {
      const remaining = Math.max(0, bill.totalRupees - bill.receivingAmount);
      const open = expanded === bill.billId;
      return <View key={bill.billId} className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
        <Pressable onPress={() => setExpanded(open ? null : bill.billId)} className="p-4"><View className="flex-row items-center justify-between"><Text className="text-base font-bold text-text">{bill.monthYear}</Text><Text className={`text-xs font-bold ${remaining === 0 ? 'text-success' : 'text-warning'}`}>{remaining === 0 ? 'PAID' : bill.receivingAmount > 0 ? 'PARTIAL' : 'UNPAID'}</Text></View><View className="mt-3 flex-row justify-between"><View><Text className="text-[10px] text-text-muted">TOTAL BILL</Text><Text className="mt-1 text-lg font-bold text-text">{formatRupees(bill.totalRupees)}</Text></View><View className="items-end"><Text className="text-[10px] text-text-muted">REMAINING</Text><Text className="mt-1 text-lg font-bold text-text">{formatRupees(remaining)}</Text></View></View><Text className="mt-2 text-xs text-tertiary">{open ? 'Hide breakdown' : 'View bill breakdown'}</Text></Pressable>
        {open ? <View className="border-t border-border bg-background p-4"><Line label="Old meter reading" value={`${bill.oldUnit}`} /><Line label="New meter reading" value={`${bill.newUnit}`} /><Line label="Units consumed" value={`${bill.unitsConsumed} kWh`} /><Line label="Rate per unit" value={formatRupees(bill.ratePerUnit)} /><Line label="Current energy charges" value={formatRupees(Math.max(0, bill.totalRupees - bill.arrears - bill.fine - bill.adjustmentRupees))} /><Line label="Previous arrears" value={formatRupees(bill.arrears)} /><Line label="Fine" value={formatRupees(bill.fine)} /><Line label="Adjustment" value={formatRupees(bill.adjustmentRupees)} /><Line label="Total bill" value={formatRupees(bill.totalRupees)} strong/><Line label="Payments received" value={formatRupees(bill.receivingAmount)} /><Line label="Outstanding" value={formatRupees(remaining)} strong/><Text className="mt-2 text-[10px] text-text-muted">Issued {bill.issueDate} · Due {bill.dueDate}</Text></View> : null}
      </View>;
    })}
    {!bills.length ? <Text className="mt-10 text-center text-sm text-text-muted">No billing records are available yet.</Text> : null}
  </ScrollView>;
}
function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <View className="mb-2 flex-row justify-between"><Text className={`text-xs ${strong ? 'font-bold text-text' : 'text-text-secondary'}`}>{label}</Text><Text className={`text-xs ${strong ? 'font-bold text-text' : 'font-medium text-text'}`}>{value}</Text></View>; }
