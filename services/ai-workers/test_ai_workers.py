import os
import json
import pytest

# Ensure HTTP report is skipped in tests
os.environ["SKIP_HTTP_REPORT"] = "1"

from embed_worker.handler import process_embeddings, lambda_handler as embed_handler
from ner_worker.handler import process_ner, lambda_handler as ner_handler
from ai_gateway.gateway import AIGateway, lambda_handler as gateway_handler

def test_embed_worker_process():
    event = {"executionId": "exec-1", "tenantId": "t-1", "stepName": "embed", "input": {"text": "Vector text"}}
    res = process_embeddings(event)
    assert res["status"] == "COMPLETED"
    assert res["executionId"] == "exec-1"
    assert res["tenantId"] == "t-1"
    assert res["output"]["dimensions"] == 384
    assert res["output"]["model"] == "all-MiniLM-L6-v2"
    assert len(res["output"]["vector"]) == 384

def test_embed_worker_lambda_handler():
    event = {"executionId": "exec-2", "tenantId": "t-2", "stepName": "embed", "input": {"text": "Hello world"}}
    res = embed_handler(event, None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["status"] == "COMPLETED"
    assert body["output"]["dimensions"] == 384

def test_ner_worker_process():
    event = {"executionId": "exec-1", "tenantId": "t-1", "stepName": "ner", "input": {"text": "Acme Corp invoice for $450"}}
    res = process_ner(event)
    assert res["status"] == "COMPLETED"
    assert res["output"]["entityCount"] > 0
    assert len(res["output"]["entities"]) == 3

def test_ner_worker_lambda_handler():
    event = {"executionId": "exec-3", "tenantId": "t-3", "stepName": "ner", "input": {"text": "Test entity"}}
    res = ner_handler(event, None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["status"] == "COMPLETED"
    assert body["output"]["entityCount"] == 3

def test_ai_gateway_embed_route():
    gateway = AIGateway()
    payload = {"executionId": "exec-gw-1", "tenantId": "t-gw", "stepName": "embed", "input": {"text": "gateway embed"}}
    res = gateway.route_request("embed", payload)
    assert res["status"] == "COMPLETED"
    assert res["output"]["dimensions"] == 384

def test_ai_gateway_ner_route():
    gateway = AIGateway()
    payload = {"executionId": "exec-gw-2", "tenantId": "t-gw", "stepName": "ner", "input": {"text": "gateway ner"}}
    res = gateway.route_request("ner", payload)
    assert res["status"] == "COMPLETED"
    assert res["output"]["entityCount"] == 3

def test_ai_gateway_unknown_task():
    gateway = AIGateway()
    with pytest.raises(ValueError, match="Unknown AI task: invalid_task"):
        gateway.route_request("invalid_task", {})

def test_ai_gateway_lambda_handler_success():
    event = {
        "task": "embed",
        "payload": {"executionId": "exec-lh-1", "tenantId": "t-1", "input": {"text": "lambda test"}}
    }
    res = gateway_handler(event, None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["status"] == "COMPLETED"

def test_ai_gateway_lambda_handler_error():
    event = {"task": "unknown_task_xyz"}
    res = gateway_handler(event, None)
    assert res["statusCode"] == 500
    body = json.loads(res["body"])
    assert "Unknown AI task" in body["error"]
