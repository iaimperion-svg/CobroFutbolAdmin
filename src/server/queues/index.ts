import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/server/config/env";

export const receiptProcessingQueueName = "receipt-processing";
export const outboundMessageQueueName = "outbound-message";

let queueConnection: IORedis | null = null;
let receiptProcessingQueue: Queue<{ receiptId: string }> | null = null;
let outboundMessageQueue: Queue<{ messageId: string }> | null = null;

export function getQueueConnection() {
  if (!queueConnection) {
    queueConnection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null
    });
  }

  return queueConnection;
}

export function getReceiptProcessingQueue() {
  if (!receiptProcessingQueue) {
    receiptProcessingQueue = new Queue<{ receiptId: string }>(receiptProcessingQueueName, {
      connection: getQueueConnection()
    });
  }

  return receiptProcessingQueue;
}

export function getOutboundMessageQueue() {
  if (!outboundMessageQueue) {
    outboundMessageQueue = new Queue<{ messageId: string }>(outboundMessageQueueName, {
      connection: getQueueConnection()
    });
  }

  return outboundMessageQueue;
}
