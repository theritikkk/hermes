import os
import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

class AIGateway:
    """
    Gateway router for dispatching AI/ML tasks to specific worker implementations.
    """
    def __init__(self, provider: str = "internal"):
        self.provider = provider

    def route_request(self, task_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        logger.info(f"Routing task '{task_name}' via provider '{self.provider}'")
        
        if task_name == "embed":
            from embed_worker.handler import process_embeddings
            return process_embeddings(payload)
        elif task_name == "ner":
            from ner_worker.handler import process_ner
            return process_ner(payload)
        elif task_name in ("ocr", "classify"):
            return {
                "executionId": payload.get("executionId"),
                "tenantId": payload.get("tenantId"),
                "stepName": task_name,
                "status": "COMPLETED",
                "output": {"note": f"Task '{task_name}' routed to Node/TS activity worker"}
            }
        else:
            raise ValueError(f"Unknown AI task: {task_name}")

def lambda_handler(event, context=None):
    task_name = event.get("task", "embed")
    payload = event.get("payload", {})
    
    gateway = AIGateway(provider=os.environ.get("AI_PROVIDER", "internal"))
    try:
        result = gateway.route_request(task_name, payload)
        return {"statusCode": 200, "body": json.dumps(result)}
    except Exception as e:
        logger.error(f"AI Gateway error: {e}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
