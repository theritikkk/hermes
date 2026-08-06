package com.hermes.admin.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "workflow_definitions", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"name", "version", "tenant_id"})
})
@Getter
@Setter
public class WorkflowDefinition {

    @Id
    @GeneratedValue
    private UUID id;

    @NotBlank
    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private int version;

    @Lob
    @Column(nullable = false, columnDefinition = "TEXT")
    private String definition;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.DRAFT;

    @Column(name = "tenant_id")
    private UUID tenantId;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private String createdBy;

    public enum Status {
        DRAFT, ACTIVE, DEPRECATED
    }
}