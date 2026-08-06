import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DEFAULT_TENANT_ID } from '@hermes/domain';
import { logError } from '@hermes/observability';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const ctx = { service: 'query-api' };

  try {
    const executionId = event.pathParameters?.executionId;
    if (!executionId) {
      return json(400, { error: 'executionId required' });
    }

    const result = await doc.send(
      new GetCommand({
        TableName: process.env.EXECUTION_READ_MODEL_TABLE!,
        Key: {
          PK: `TENANT#${DEFAULT_TENANT_ID}`,
          SK: `EXEC#${executionId}`,
        },
      }),
    );

    if (!result.Item) {
      return json(404, { error: 'execution not found' });
    }

    return json(200, result.Item);
  } catch (err) {
    logError('query failed', ctx, { error: String(err) });
    return json(500, { error: 'internal error' });
  }
}
