package com.hermes.command.infrastructure.eventstore;

import com.hermes.command.domain.aggregate.AggregateType;

/**
 * Utility for generating DynamoDB keys.
 */
public class DynamoDbKeys {
    public static String aggregatePk(AggregateType type, String id) {
        return "AGG#" + type.name() + "#" + id;
    }

    public static String eventSk(int sequence, String eventId) {
        return String.format("EVT#%010d#%s", sequence, eventId);
    }

    public static String metaSk() {
        return "META";
    }

    public static String snapshotSk(int sequence) {
        return String.format("SNAP#%010d", sequence);
    }
}
