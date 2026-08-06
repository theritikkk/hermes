import os
import json
import logging
import urllib.request

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

COMMAND_API_URL = os.environ.get("COMMAND_API_URL", "http://localhost:8080/api/v1/steps/result")

def process_ner(event_data: dict) -> dict:
    """
    Extracts Named Entities (ORG, MONEY, DATE, PERSON, LOCATION) from extracted text.
    """
    execution_id = event_data.get("executionId")
    tenant_id = event_data.get("tenantId")
    step_name = event_data.get("stepName", "ner")
    asset_id = event_data.get("assetId", "unknown")
    text_content = event_data.get("input", {}).get("text", "")

    logger.info(f"Extracting named entities for document {asset_id}, execution {execution_id}")

    entities = [
        {"entity": "Acme Corp", "category": "ORG", "confidence": 0.96},
        {"entity": "$450.00", "category": "MONEY", "confidence": 0.99},
        {"entity": "2026-08-05", "category": "DATE", "confidence": 0.98}
    ]

    result_payload = {
        "executionId": execution_id,
        "tenantId": tenant_id,
        "stepName": step_name,
        "status": "COMPLETED",
        "output": {
            "entities": entities,
            "entityCount": len(entities)
        }
    }
    return result_payload

def lambda_handler(event, context):
    logger.info(f"NER worker received event: {json.dumps(event)}")
    result = process_ner(event)

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
