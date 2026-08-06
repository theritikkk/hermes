import type { SQSEvent } from 'aws-lambda';

export const handler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    let originalMessage = record.body;
    let errorContext = null;
    let tenantId = 'unknown';

    try {
      const parsedBody = JSON.parse(record.body);
      originalMessage = parsedBody.originalMessage || record.body;
      errorContext = parsedBody.errorContext || null;
      
      const parsedOriginal = typeof originalMessage === 'string' ? JSON.parse(originalMessage) : originalMessage;
      if (parsedOriginal.tenantId) {
        tenantId = parsedOriginal.tenantId;
      }
    } catch (err) {
      // Body might not be JSON, ignore parsing errors
    }

    const sourceArn = record.eventSourceARN || '';
    const queueName = sourceArn.split(':').pop() || process.env.DLQ_NAME || 'unknown';

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'CRITICAL',
      service: 'dlq-handler',
      message: 'DLQ message received',
      queue: queueName,
      tenantId,
      messageId: record.messageId,
      originalMessage,
      errorContext,
    }));

    console.log(JSON.stringify({
      '_aws': {
        'Timestamp': Date.now(),
        'CloudWatchMetrics': [{
          'Namespace': 'Hermes/Operations',
          'Dimensions': [['queue', 'tenantId']],
          'Metrics': [{ 'Name': 'DLQMessageCount', 'Unit': 'Count' }]
        }]
      },
      'queue': queueName,
      'tenantId': tenantId,
      'DLQMessageCount': 1
    }));
  }
};
