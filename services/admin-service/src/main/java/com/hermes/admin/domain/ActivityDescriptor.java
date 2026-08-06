package com.hermes.admin.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "activity_descriptors", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"name", "version", "tenant_id"})
})
@Getter
@Setter
public class ActivityDescriptor {

    @Id
    @GeneratedValue
    private UUID id;

    @NotBlank
    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private int version;

    @Column(nullable = false)
    private String runtime;

    @NotBlank
    @Column(nullable = false)
    private String lambdaArn;

    @Column(nullable = false)
    private int timeoutSeconds = 300;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String retryConfig;

    @Column
    private String compensationLambdaArn;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String inputSchema;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String outputSchema;

    @Column(nullable = false)
    private boolean isPlatform = false;

    @Column(name = "tenant_id")
    private UUID tenantId;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private String createdBy;
}