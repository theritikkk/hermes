import os
import json
import pytest

# Ensure HTTP report is skipped in tests
os.environ["SKIP_HTTP_REPORT"] = "1"

from ocr_worker.handler import process_ocr
from classify_worker.handler import process_classification
from embed_worker.handler import process_embeddings
from ner_worker.handler import process_ner
from ai_gateway.gateway import AIGateway

def test_ocr_worker():
    event = {"executionId": "exec-1", "tenantId": "t-1", "stepName": "ocr", "assetId": "asset-1"}
    res = process_ocr(event)
    assert res["status"] == "COMPLETED"
    assert "output" in res
    assert "text" in res["output"]

def test_classify_worker():
    event = {"executionId": "exec-1", "tenantId": "t-1", "stepName": "classify", "input": {"text": "Total Invoice $100"}}
    res = process_classification(event)
    assert res["status"] == "COMPLETED"
    assert res["output"]["documentType"] == "INVOICE"

def test_embed_worker():
    event = {"executionId": "exec-1", "tenantId": "t-1", "stepName": "embed", "input": {"text": "Vector text"}}
    res = process_embeddings(event)
    assert res["status"] == "COMPLETED"
    assert res["output"]["dimensions"] == 384

def test_ner_worker():
    event = {"executionId": "exec-1", "tenantId": "t-1", "stepName": "ner", "input": {"text": "Acme Corp"}}
    res = process_ner(event)
    assert res["status"] == "COMPLETED"
    assert len(res["output"]["entities"]) > 0

def test_ai_gateway():
    gateway = AIGateway()
    event = {"executionId": "exec-1", "tenantId": "t-1", "stepName": "ocr", "assetId": "asset-1"}
    res = gateway.route_request("ocr", event)
    assert res["status"] == "COMPLETED"
