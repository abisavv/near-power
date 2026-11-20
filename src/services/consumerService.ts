import { supabase } from '@/utils/supabase';
import type { ConsumerModel } from '@/types';

type ConsumerRow = {
  id: string;
  serial_number: string;
  meter_number: string;
  full_name: string;
  cnic: string;
  phone: string;
  address: string;
  security_deposit: number;
  is_active: boolean;
  left_date: string | null;
  connection_date: string;
  phase_type: string | null;
  created_at?: string;
  updated_at?: string;
};

type VersionedConsumer = ConsumerModel & { updatedAt?: string };

function mapConsumer(row: ConsumerRow): ConsumerModel {
  const mapped: VersionedConsumer = {
    id: row.id,
    serialNumber: row.serial_number,
    meterNumber: row.meter_number,
    fullName: row.full_name,
    cnic: row.cnic,
    phone: row.phone,
    address: row.address,
    securityDeposit: Number(row.security_deposit),
    isActive: row.is_active,
    leftDate: row.left_date,
    connectionDate: row.connection_date,
    phaseType: row.phase_type as ConsumerModel['phaseType'],
    updatedAt: row.updated_at,
  };
  return mapped;
}

function toDatabaseRow(consumer: ConsumerModel) {
  return {
    id: consumer.id,
    serial_number: consumer.serialNumber,
    meter_number: consumer.meterNumber,
    full_name: consumer.fullName,
    cnic: consumer.cnic,
    phone: consumer.phone,
    address: consumer.address,
    security_deposit: consumer.securityDeposit,
    is_active: consumer.isActive,
    left_date: consumer.leftDate ?? null,
    connection_date: consumer.connectionDate,
    phase_type: consumer.phaseType ?? null,
  };
}

export const consumerService = {
  async getAll(): Promise<ConsumerModel[]> {
    const pageSize = 1000;
    const rows: ConsumerRow[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase.from('consumers').select('*')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const page = (data ?? []) as ConsumerRow[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows.map(mapConsumer).sort((a, b) =>
      a.meterNumber.localeCompare(b.meterNumber, undefined, { numeric: true, sensitivity: 'base' }),
    );
  },

  async getById(id: string): Promise<ConsumerModel | null> {
    const { data, error } = await supabase.from('consumers').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapConsumer(data as ConsumerRow) : null;
  },

  // Kept for server-side sync and trusted admin workflows. UI mutations use
  // offlineMutationService through databaseService instead.
  async create(consumer: Omit<ConsumerModel, 'id'>): Promise<ConsumerModel> {
    const newConsumer = { ...consumer, id: `c-${Date.now()}-${Math.floor(Math.random() * 100000)}` } as ConsumerModel;
    const { data, error } = await supabase.from('consumers').insert(toDatabaseRow(newConsumer)).select().single();
    if (error) throw error;
    return mapConsumer(data as ConsumerRow);
  },

  async update(id: string, changes: Partial<ConsumerModel>): Promise<ConsumerModel> {
    const updateData: Record<string, unknown> = {};
    if (changes.serialNumber !== undefined) updateData.serial_number = changes.serialNumber;
    if (changes.meterNumber !== undefined) updateData.meter_number = changes.meterNumber;
    if (changes.fullName !== undefined) updateData.full_name = changes.fullName;
    if (changes.cnic !== undefined) updateData.cnic = changes.cnic;
    if (changes.phone !== undefined) updateData.phone = changes.phone;
    if (changes.address !== undefined) updateData.address = changes.address;
    if (changes.securityDeposit !== undefined) updateData.security_deposit = changes.securityDeposit;
    if (changes.isActive !== undefined) updateData.is_active = changes.isActive;
    if (changes.leftDate !== undefined) updateData.left_date = changes.leftDate;
    if (changes.connectionDate !== undefined) updateData.connection_date = changes.connectionDate;
    if (changes.phaseType !== undefined) updateData.phase_type = changes.phaseType;
    const { data, error } = await supabase.from('consumers').update(updateData).eq('id', id).select().single();
    if (error) throw error;
    return mapConsumer(data as ConsumerRow);
  },

  async softDelete(id: string, leftDate = new Date().toISOString().slice(0, 10)): Promise<ConsumerModel> {
    return this.update(id, { isActive: false, leftDate });
  },
};
