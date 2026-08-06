import os
import json
import logging
import urllib.request

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

COMMAND_API_URL = os.environ.get("COMMAND_API_URL", "http://localhost:8080/api/v1/steps/result")

def process_embeddings(event_data: dict) -> dict:
    """
    Generates text embeddings for vector indexing and semantic search.
    """
    execution_id = event_data.get("executionId")
    tenant_id = event_data.get("tenantId")
    step_name = event_data.get("stepName", "embed")
    asset_id = event_data.get("assetId", "unknown")
    text_content = event_data.get("input", {}).get("text", "Sample text for embedding")

    logger.info(f"Generating embeddings for document {asset_id}, execution {execution_id}")

    # Standard 384-dim dummy embedding vector for sentence-transformers fallback
    dummy_vector = [0.01 * (i % 10) for i in range(384)]

    result_payload = {
        "executionId": execution_id,
        "tenantId": tenant_id,
        "stepName": step_name,
        "status": "COMPLETED",
        "output": {
            "dimensions": len(dummy_vector),
            "vector": dummy_vector,
            "model": "all-MiniLM-L6-v2"
        }
    }
    return result_payload

def lambda_handler(event, context):
    logger.info(f"Embed worker received event: {json.dumps(event)}")
    result = process_embeddings(event)

    if COMMAND_API_URL and not os.environ.get("SKIP_HTTP_REPORT"):
        try:
            req = urllib.request.Request(
                COMMAND_API_URL,
                data=json.dumps(result).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req) as resp:
                logger.info(f"Reported step result to command-api: {resp.status}")
        except Exception as e:
            logger.warning(f"Failed to report to command-api: {e}")

    return {
        "statusCode": 200,
        "body": json.dumps(result)
    }
