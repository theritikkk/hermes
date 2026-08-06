package com.hermes.command.infrastructure.workflow;

import com.hermes.command.domain.workflow.WorkflowDefinition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * In-memory Phase 1 implementation of WorkflowRegistry.
 */
@Service
public class InMemoryWorkflowRegistry implements WorkflowRegistry {

    private static final Logger log = LoggerFactory.getLogger(InMemoryWorkflowRegistry.class);

    @Override
    public WorkflowDefinition load(String name, int version) {
        if ("document-pipeline".equals(name) && version == 1) {
            return WorkflowDefinition.documentPipelineV1();
        }
        
        log.warn("Unknown workflow requested: {}@{}, falling back to document-pipeline@1", name, version);
        return WorkflowDefinition.documentPipelineV1();
    }
}
