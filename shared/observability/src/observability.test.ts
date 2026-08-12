import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, log, logInfo, logError, LogContext } from './index';

describe('observability', () => {
  let consoleLogMock: any;
  const originalEnv = { ...process.env };
  
  beforeEach(() => {
    consoleLogMock = mock.method(console, 'log');
  });

  afterEach(() => {
    mock.restoreAll();
    process.env = { ...originalEnv };
  });

  const baseCtx: LogContext = { service: 'test-service' };

  test('createLogger() returns object with info, warn, error, critical methods', () => {
    const logger = createLogger(baseCtx);
    assert.ok(typeof logger.info === 'function');
    assert.ok(typeof logger.warn === 'function');
    assert.ok(typeof logger.error === 'function');
    assert.ok(typeof logger.critical === 'function');
  });

  test('info() emits JSON with level=INFO, service, message, timestamp', () => {
    const logger = createLogger(baseCtx);
    logger.info('test info');
    
    assert.equal(consoleLogMock.mock.callCount(), 1);
    const logOutput = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
    
    assert.equal(logOutput.level, 'INFO');
    assert.equal(logOutput.service, 'test-service');
    assert.equal(logOutput.message, 'test info');
    assert.ok(logOutput.timestamp);
    assert.match(logOutput.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('warn() emits JSON with level=WARN', () => {
    const logger = createLogger(baseCtx);
    logger.warn('test warn');
    
    const logOutput = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
    assert.equal(logOutput.level, 'WARN');
    assert.equal(logOutput.message, 'test warn');
  });

  test('error() with Error object includes error.message and error.stack', () => {
    const logger = createLogger(baseCtx);
    const err = new Error('test error msg');
    logger.error('test error', err);
    
    const logOutput = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
    assert.equal(logOutput.level, 'ERROR');
    assert.equal(logOutput.message, 'test error');
    assert.equal(logOutput.error.message, 'test error msg');
    assert.ok(logOutput.error.stack.includes('test error msg'));
  });

  test('error() with string error includes it as string', () => {
    const logger = createLogger(baseCtx);
    logger.error('test error', 'string error');
    
    const logOutput = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
    assert.equal(logOutput.level, 'ERROR');
    assert.equal(logOutput.error, 'string error');
  });

  test('error() with undefined error works', () => {
    const logger = createLogger(baseCtx);
    logger.error('test error', undefined);
    
    const logOutput = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
    assert.equal(logOutput.level, 'ERROR');
    assert.equal(logOutput.error, 'undefined');
  });

  test('critical() emits JSON with level=CRITICAL', () => {
    const logger = createLogger(baseCtx);
    logger.critical('test critical');
    
    const logOutput = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
    assert.equal(logOutput.level, 'CRITICAL');
    assert.equal(logOutput.message, 'test critical');
  });

  test('Context fields are included in output', () => {
    const fullCtx: LogContext = {
      service: 'test-service',
      correlationId: 'corr-1',
      executionId: 'exec-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      traceId: 'trace-1'
    };
    const logger = createLogger(fullCtx);
    logger.info('test context');
    
    const logOutput = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
    assert.equal(logOutput.correlationId, 'corr-1');
    assert.equal(logOutput.executionId, 'exec-1');
    assert.equal(logOutput.tenantId, 'tenant-1');
    assert.equal(logOutput.userId, 'user-1');
    assert.equal(logOutput.traceId, 'trace-1');
  });

  test('Extra fields merged into log entry', () => {
    const logger = createLogger(baseCtx);
    logger.info('test extra', { extraField: 'extraValue' });
    
    const logOutput = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
    assert.equal(logOutput.extraField, 'extraValue');
  });

  test('Timestamp is valid ISO-8601 format', () => {
    const logger = createLogger(baseCtx);
    logger.info('test date');
    
    const logOutput = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
    const date = new Date(logOutput.timestamp);
    assert.ok(!isNaN(date.getTime()));
    assert.equal(date.toISOString(), logOutput.timestamp);
  });

  test('traceId comes from context or _X_AMZN_TRACE_ID env var', () => {
    process.env._X_AMZN_TRACE_ID = 'env-trace-1';
    const loggerEnv = createLogger({ service: 's1', traceId: 'ctx-trace-1' });
    loggerEnv.info('test trace env');
    const outEnv = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
    assert.equal(outEnv.traceId, 'env-trace-1');

    delete process.env._X_AMZN_TRACE_ID;
    const loggerCtx = createLogger({ service: 's1', traceId: 'ctx-trace-2' });
    loggerCtx.info('test trace ctx');
    const outCtx = JSON.parse(consoleLogMock.mock.calls[1].arguments[0]);
    assert.equal(outCtx.traceId, 'ctx-trace-2');
  });

  test('log() backward compat function works for info, warn, error', () => {
    log('info', 'compat info', baseCtx, { c1: 1 });
    log('warn', 'compat warn', baseCtx, { c2: 2 });
    log('error', 'compat error', baseCtx, { c3: 3 });
    
    assert.equal(consoleLogMock.mock.callCount(), 3);
    
    const infoOut = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
    assert.equal(infoOut.level, 'INFO');
    assert.equal(infoOut.message, 'compat info');
    assert.equal(infoOut.c1, 1);
    
    const warnOut = JSON.parse(consoleLogMock.mock.calls[1].arguments[0]);
    assert.equal(warnOut.level, 'WARN');
    assert.equal(warnOut.message, 'compat warn');
    assert.equal(warnOut.c2, 2);
    
    const errOut = JSON.parse(consoleLogMock.mock.calls[2].arguments[0]);
    assert.equal(errOut.level, 'ERROR');
    assert.equal(errOut.message, 'compat error');
    assert.equal(errOut.c3, 3);
  });

  test('logInfo() shortcut works', () => {
    logInfo('shortcut info', baseCtx, { s1: 1 });
    const out = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
    assert.equal(out.level, 'INFO');
    assert.equal(out.message, 'shortcut info');
    assert.equal(out.s1, 1);
  });

  test('logError() shortcut works', () => {
    logError('shortcut error', baseCtx, { s2: 2 });
    const out = JSON.parse(consoleLogMock.mock.calls[0].arguments[0]);
    assert.equal(out.level, 'ERROR');
    assert.equal(out.message, 'shortcut error');
    assert.equal(out.s2, 2);
  });
});
