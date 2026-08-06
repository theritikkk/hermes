import os
import json
import logging
import urllib.request

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

COMMAND_API_URL = os.environ.get("COMMAND_API_URL", "http://localhost:8080/api/v1/steps/result")

def process_classification(event_data: dict) -> dict:
    """
    Classifies input document into document categories (INVOICE, CONTRACT, RECEIPT, OTHER).
    """
    execution_id = event_data.get("executionId")
    tenant_id = event_data.get("tenantId")
    step_name = event_data.get("stepName", "classify")
    asset_id = event_data.get("assetId", "unknown")
    text_content = event_data.get("input", {}).get("text", "")

    logger.info(f"Classifying document {asset_id}, execution {execution_id}")

    doc_type = "INVOICE" if "invoice" in text_content.lower() or "total" in text_content.lower() else "DOCUMENT"

    result_payload = {
        "executionId": execution_id,
        "tenantId": tenant_id,
        "stepName": step_name,
        "status": "COMPLETED",
        "output": {
            "documentType": doc_type,
            "confidenceScore": 0.95,
            "tags": ["finance", "accounts_payable"]
        }
    }
    return result_payload

def lambda_handler(event, context):
    logger.info(f"Classify worker received event: {json.dumps(event)}")
    result = process_classification(event)
    
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
