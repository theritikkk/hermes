package com.hermes.command.domain;

import org.springframework.util.Assert;
import java.util.UUID;

/**
 * Value object representing an Asset ID.
 */
public record AssetId(UUID value) {
    public AssetId {
        Assert.notNull(value, "Asset ID must not be null");
    }

    public static AssetId generate() {
        return new AssetId(UUID.randomUUID());
    }

    public static AssetId fromString(String uuid) {
        return new AssetId(UUID.fromString(uuid));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
