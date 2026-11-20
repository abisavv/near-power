import { consumerService } from './consumerService';
import { ledgerService } from './ledgerService';
import { offlineMutationService } from './offlineMutationService';

export const databaseService = {
  // Reads are RLS-filtered cloud reads. The bootstrap service handles caching.
  getConsumers: consumerService.getAll,
  getConsumerById: consumerService.getById,

  // Every application write is local-first and queued for synchronization.
  insertConsumer: offlineMutationService.addConsumer,
  updateConsumer: offlineMutationService.updateConsumer,
  softDeleteConsumer: offlineMutationService.vacateConsumer,

  getBillingRecords: ledgerService.getAll,
  getBillingRecordsByConsumer: ledgerService.getByConsumer,
  getBillingRecordById: ledgerService.getById,
  insertBillingRecord: offlineMutationService.addBillingRecord,
  updateBillingStatus: offlineMutationService.updatePaymentStatus,
};
