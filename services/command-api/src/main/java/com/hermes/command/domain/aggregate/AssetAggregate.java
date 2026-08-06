package com.hermes.command.domain.aggregate;

import com.hermes.command.domain.event.EventEnvelope;
import lombok.Getter;

/**
 * Asset Aggregate.
 */
@Getter
public class AssetAggregate {
    private String assetId;
    private String tenantId;
    private String s3Key;
    private String contentType;
    private String workflowName;
    private Integer workflowVersion;
    private boolean registered = false;
    private int version = 0;

    public void apply(EventEnvelope event) {
        this.version = event.sequence();
        if (event.eventType() == com.hermes.command.domain.event.DomainEventType.ASSET_REGISTERED) {
            this.assetId = event.aggregateId();
            this.tenantId = event.tenantId();
            this.s3Key = (String) event.payload().get("s3Key");
            this.contentType = (String) event.payload().get("contentType");
            this.workflowName = (String) event.payload().get("workflowName");
            this.workflowVersion = (Integer) event.payload().get("workflowVersion");
            this.registered = true;
        }
    }
}
