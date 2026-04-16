import { Worker } from "bullmq";
import { env } from "@/server/config/env";
import { getQueueConnection, outboundMessageQueueName, receiptProcessingQueueName } from "@/server/queues";
import { handleOutboundMessage, handleReceiptProcessing } from "@/server/workers/handlers";

const connection = getQueueConnection();

const receiptWorker = new Worker(
  receiptProcessingQueueName,
  async (job) => {
    console.info("[worker][receipt] picked job", {
      jobId: job.id,
      receiptId: job.data.receiptId
    });
    await handleReceiptProcessing(job.data.receiptId);
  },
  {
    connection,
    concurrency: env.RECEIPT_WORKER_CONCURRENCY
  }
);

const outboundWorker = new Worker(
  outboundMessageQueueName,
  async (job) => {
    console.info("[worker][outbound] picked job", {
      jobId: job.id,
      messageId: job.data.messageId
    });
    await handleOutboundMessage(job.data.messageId);
  },
  {
    connection,
    concurrency: env.OUTBOUND_WORKER_CONCURRENCY
  }
);

receiptWorker.on("completed", (job) => {
  console.log(`[receipt-processing] completed ${job.id}`);
});

receiptWorker.on("failed", (job, error) => {
  console.error(`[receipt-processing] failed ${job?.id}: ${error.message}`);
});

outboundWorker.on("failed", (job, error) => {
  console.error(`[outbound-message] failed ${job?.id}: ${error.message}`);
});

console.log("CobroFutbol workers running");
