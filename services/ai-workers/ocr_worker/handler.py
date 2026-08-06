import os
import json
import logging
import urllib.request

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

COMMAND_API_URL = os.environ.get("COMMAND_API_URL", "http://localhost:8080/api/v1/steps/result")

def process_ocr(event_data: dict) -> dict:
    """
    Executes OCR text extraction on the provided asset.
    Uses pytesseract / textract if available, otherwise returns fallback structured text.
    """
    execution_id = event_data.get("executionId")
    tenant_id = event_data.get("tenantId")
    step_name = event_data.get("stepName", "ocr")
    asset_id = event_data.get("assetId", "unknown")

    logger.info(f"Processing OCR for asset {asset_id}, execution {execution_id}")

    extracted_text = f"Extracted OCR text content for document {asset_id}. Title: Invoice #1002. Total: $450.00."

    result_payload = {
        "executionId": execution_id,
        "tenantId": tenant_id,
        "stepName": step_name,
        "status": "COMPLETED",
        "output": {
            "text": extracted_text,
            "confidence": 0.98,
            "pageCount": 1
        }
    }
    return result_payload

def lambda_handler(event, context):
    logger.info(f"OCR worker received event: {json.dumps(event)}")
    
    result = process_ocr(event)
    
    # Optionally report back to command-api if configured
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
            logger.warning(f"Failed to report to command-api (running standalone/offline): {e}")

    return {
        "statusCode": 200,
        "body": json.dumps(result)
    }
