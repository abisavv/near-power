import { getAccessRequest } from "./accessRequestService";
import { getConsumer } from "./consumerService";
import { getConsumerLedgers } from "./ledgerService";

export async function loadDashboard() {
  // 1. Check access request.
  const request = await getAccessRequest();
  if (!request) {
    return { status: 'no_request' };
  }

  if (request.status !== 'approved') {
    return {
      status: request.status,
    };
  }

  // 2. Retrieve assigned consumer.
  const consumer = await getConsumer(
    request.assigned_consumer_id
  );

  // 3. Retrieve billing history.
  const ledgers = await getConsumerLedgers(consumer.id);

  return {
    status: 'approved',
    consumer,
    ledgers,
  };
}