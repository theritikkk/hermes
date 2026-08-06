import os

base_dir = "/Users/ritikraj/Documents/GitHub/hermes/services/admin-service"

files = {
    "pom.xml": """<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.4</version>
        <relativePath/> <!-- lookup parent from repository -->
    </parent>

    <groupId>com.hermes</groupId>
    <artifactId>admin-service</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <name>hermes-admin-service</name>
    <description>Hermes Admin Service</description>

    <properties>
        <java.version>25</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-core</artifactId>
        </dependency>
        <dependency>
            <groupId>io.micrometer</groupId>
            <artifactId>micrometer-registry-cloudwatch2</artifactId>
        </dependency>
        <dependency>
            <groupId>io.micrometer</groupId>
            <artifactId>micrometer-tracing-bridge-otel</artifactId>
        </dependency>
        <dependency>
            <groupId>ch.qos.logback.contrib</groupId>
            <artifactId>logback-json-classic</artifactId>
            <version>0.1.5</version>
        </dependency>
        <dependency>
            <groupId>ch.qos.logback.contrib</groupId>
            <artifactId>logback-jackson</artifactId>
            <version>0.1.5</version>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.mockito</groupId>
            <artifactId>mockito-core</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>""",
    "src/main/resources/application.yml": """server:
  port: 8083

spring:
  application:
    name: hermes-admin-service
  datasource:
    url: ${DATABASE_URL:jdbc:postgresql://localhost:5432/hermes}
    username: ${DATABASE_USER:hermes}
    password: ${DATABASE_PASSWORD:hermes}
    driver-class-name: org.postgresql.Driver
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
        jdbc:
          time_zone: UTC
  flyway:
    enabled: true
    locations: classpath:db/migration
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: ${COGNITO_ISSUER_URI:https://cognito-idp.us-east-1.amazonaws.com/us-east-1_placeholder}

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics""",
    "Dockerfile": """FROM amazoncorretto:25-alpine as builder
WORKDIR /app
COPY . .
RUN ./mvnw clean package -DskipTests

FROM amazoncorretto:25-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8083
ENTRYPOINT ["java", "-jar", "app.jar"]""",
    "src/main/resources/db/migration/V1__create_tenants.sql": """CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    plan VARCHAR(50) NOT NULL DEFAULT 'STARTER',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    api_rate_limit_per_second INT NOT NULL DEFAULT 50,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(255) NOT NULL
);
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);""",
    "src/main/resources/db/migration/V2__create_workflow_definitions.sql": """CREATE TABLE workflow_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    version INT NOT NULL,
    definition TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    tenant_id UUID REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(255) NOT NULL,
    UNIQUE(name, version, tenant_id)
);
CREATE INDEX idx_wf_definitions_name_status ON workflow_definitions(name, status);
CREATE INDEX idx_wf_definitions_tenant ON workflow_definitions(tenant_id);""",
    "src/main/resources/db/migration/V3__create_activity_descriptors.sql": """CREATE TABLE activity_descriptors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    version INT NOT NULL,
    runtime VARCHAR(50) NOT NULL,
    lambda_arn VARCHAR(1000) NOT NULL,
    timeout_seconds INT NOT NULL DEFAULT 300,
    retry_config TEXT,
    compensation_lambda_arn VARCHAR(1000),
    input_schema TEXT,
    output_schema TEXT,
    is_platform BOOLEAN NOT NULL DEFAULT false,
    tenant_id UUID REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(255) NOT NULL,
    UNIQUE(name, version, tenant_id)
);
CREATE INDEX idx_activities_platform ON activity_descriptors(is_platform) WHERE is_platform = true;""",
    "src/main/java/com/hermes/admin/HermesAdminApplication.java": """package com.hermes.admin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class HermesAdminApplication {
    public static void main(String[] args) {
        SpringApplication.run(HermesAdminApplication.class, args);
    }
}""",
    "src/main/java/com/hermes/admin/domain/Tenant.java": """package com.hermes.admin.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "tenants")
@Getter
@Setter
public class Tenant {

    @Id
    @GeneratedValue
    private UUID id;

    @NotBlank
    @Column(nullable = false)
    private String name;

    @NotBlank
    @Column(nullable = false, unique = true)
    private String slug;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Plan plan = Plan.STARTER;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.ACTIVE;

    @Column(nullable = false)
    private int apiRateLimitPerSecond = 50;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private Instant updatedAt;

    @Column(nullable = false)
    private String createdBy;

    public enum Plan {
        STARTER, PROFESSIONAL, ENTERPRISE
    }

    public enum Status {
        ACTIVE, SUSPENDED, DELETED
    }
}""",
    "src/main/java/com/hermes/admin/domain/WorkflowDefinition.java": """package com.hermes.admin.domain;

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
}""",
    "src/main/java/com/hermes/admin/domain/ActivityDescriptor.java": """package com.hermes.admin.domain;

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
}""",
    "src/main/java/com/hermes/admin/infrastructure/persistence/TenantRepository.java": """package com.hermes.admin.infrastructure.persistence;

import com.hermes.admin.domain.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TenantRepository extends JpaRepository<Tenant, UUID> {
    Optional<Tenant> findBySlug(String slug);
    List<Tenant> findByStatus(Tenant.Status status);
}""",
    "src/main/java/com/hermes/admin/infrastructure/persistence/WorkflowDefinitionRepository.java": """package com.hermes.admin.infrastructure.persistence;

import com.hermes.admin.domain.WorkflowDefinition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface WorkflowDefinitionRepository extends JpaRepository<WorkflowDefinition, UUID> {
    Optional<WorkflowDefinition> findByNameAndVersionAndTenantId(String name, int version, UUID tenantId);
    List<WorkflowDefinition> findByNameAndStatus(String name, WorkflowDefinition.Status status);
    Optional<WorkflowDefinition> findTopByNameAndStatusOrderByVersionDesc(String name, WorkflowDefinition.Status status);
    List<WorkflowDefinition> findByName(String name);
}""",
    "src/main/java/com/hermes/admin/infrastructure/persistence/ActivityDescriptorRepository.java": """package com.hermes.admin.infrastructure.persistence;

import com.hermes.admin.domain.ActivityDescriptor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ActivityDescriptorRepository extends JpaRepository<ActivityDescriptor, UUID> {
    Optional<ActivityDescriptor> findByNameAndVersionAndTenantId(String name, int version, UUID tenantId);
    List<ActivityDescriptor> findByIsPlatformTrue();
}""",
    "src/main/java/com/hermes/admin/api/NotFoundException.java": """package com.hermes.admin.api;

public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) {
        super(message);
    }
}""",
    "src/main/java/com/hermes/admin/api/GlobalExceptionHandler.java": """package com.hermes.admin.api;

import jakarta.validation.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<String> handleNotFound(NotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ex.getMessage());
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<String> handleConstraintViolation(ConstraintViolationException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ex.getMessage());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<String> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body("Duplicate record or conflict: " + ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<String> handleException(Exception ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ex.getMessage());
    }
}""",
    "src/main/java/com/hermes/admin/application/command/CreateTenantCommand.java": """package com.hermes.admin.application.command;

import com.hermes.admin.domain.Tenant;

public record CreateTenantCommand(
        String name,
        String slug,
        Tenant.Plan plan,
        String createdBy
) {}""",
    "src/main/java/com/hermes/admin/application/command/RegisterWorkflowCommand.java": """package com.hermes.admin.application.command;

import java.util.UUID;

public record RegisterWorkflowCommand(
        String name,
        String definitionJson,
        UUID tenantId,
        String createdBy
) {}""",
    "src/main/java/com/hermes/admin/application/command/RegisterActivityCommand.java": """package com.hermes.admin.application.command;

import java.util.UUID;

public record RegisterActivityCommand(
        String name,
        int version,
        String runtime,
        String lambdaArn,
        int timeoutSeconds,
        String retryConfigJson,
        String compensationLambdaArn,
        String inputSchemaJson,
        String outputSchemaJson,
        boolean isPlatform,
        UUID tenantId,
        String createdBy
) {}""",
    "src/main/java/com/hermes/admin/application/TenantService.java": """package com.hermes.admin.application;

import com.hermes.admin.api.NotFoundException;
import com.hermes.admin.application.command.CreateTenantCommand;
import com.hermes.admin.domain.Tenant;
import com.hermes.admin.infrastructure.persistence.TenantRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class TenantService {
    private final TenantRepository tenantRepository;

    public TenantService(TenantRepository tenantRepository) {
        this.tenantRepository = tenantRepository;
    }

    public Tenant create(CreateTenantCommand cmd) {
        Tenant tenant = new Tenant();
        tenant.setName(cmd.name());
        tenant.setSlug(cmd.slug());
        tenant.setPlan(cmd.plan() != null ? cmd.plan() : Tenant.Plan.STARTER);
        tenant.setStatus(Tenant.Status.ACTIVE);
        tenant.setCreatedBy(cmd.createdBy());
        try {
            return tenantRepository.save(tenant);
        } catch (DataIntegrityViolationException e) {
            throw new IllegalArgumentException("Tenant with slug " + cmd.slug() + " already exists.");
        }
    }

    public Tenant findBySlug(String slug) {
        return tenantRepository.findBySlug(slug)
                .orElseThrow(() -> new NotFoundException("Tenant not found with slug: " + slug));
    }

    public Tenant suspend(UUID tenantId) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new NotFoundException("Tenant not found"));
        tenant.setStatus(Tenant.Status.SUSPENDED);
        return tenantRepository.save(tenant);
    }

    public List<Tenant> listActive() {
        return tenantRepository.findByStatus(Tenant.Status.ACTIVE);
    }
}""",
    "src/main/java/com/hermes/admin/application/WorkflowDefinitionService.java": """package com.hermes.admin.application;

import com.hermes.admin.api.NotFoundException;
import com.hermes.admin.application.command.RegisterWorkflowCommand;
import com.hermes.admin.domain.WorkflowDefinition;
import com.hermes.admin.infrastructure.persistence.WorkflowDefinitionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class WorkflowDefinitionService {
    private final WorkflowDefinitionRepository repository;

    public WorkflowDefinitionService(WorkflowDefinitionRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public WorkflowDefinition register(RegisterWorkflowCommand cmd) {
        WorkflowDefinition latest = repository.findTopByNameAndStatusOrderByVersionDesc(cmd.name(), WorkflowDefinition.Status.ACTIVE)
                .orElse(null);
        int nextVersion = 1;
        
        List<WorkflowDefinition> existing = repository.findByName(cmd.name());
        for (WorkflowDefinition def : existing) {
            if ((cmd.tenantId() == null && def.getTenantId() == null) ||
                (cmd.tenantId() != null && cmd.tenantId().equals(def.getTenantId()))) {
                if (def.getVersion() >= nextVersion) {
                    nextVersion = def.getVersion() + 1;
                }
            }
        }

        WorkflowDefinition def = new WorkflowDefinition();
        def.setName(cmd.name());
        def.setVersion(nextVersion);
        def.setDefinition(cmd.definitionJson());
        def.setTenantId(cmd.tenantId());
        def.setStatus(WorkflowDefinition.Status.DRAFT);
        def.setCreatedBy(cmd.createdBy());
        return repository.save(def);
    }

    @Transactional
    public WorkflowDefinition activate(UUID id) {
        WorkflowDefinition def = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("Workflow not found"));
                
        List<WorkflowDefinition> existing = repository.findByNameAndStatus(def.getName(), WorkflowDefinition.Status.ACTIVE);
        for (WorkflowDefinition active : existing) {
             if ((def.getTenantId() == null && active.getTenantId() == null) ||
                 (def.getTenantId() != null && def.getTenantId().equals(active.getTenantId()))) {
                 if (!active.getId().equals(def.getId())) {
                     active.setStatus(WorkflowDefinition.Status.DEPRECATED);
                     repository.save(active);
                 }
             }
        }
        
        def.setStatus(WorkflowDefinition.Status.ACTIVE);
        return repository.save(def);
    }

    public WorkflowDefinition deprecate(UUID id) {
        WorkflowDefinition def = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("Workflow not found"));
        def.setStatus(WorkflowDefinition.Status.DEPRECATED);
        return repository.save(def);
    }

    public Optional<WorkflowDefinition> findLatestActive(String name) {
        return repository.findTopByNameAndStatusOrderByVersionDesc(name, WorkflowDefinition.Status.ACTIVE);
    }

    public WorkflowDefinition findByNameAndVersion(String name, int version, UUID tenantId) {
        return repository.findByNameAndVersionAndTenantId(name, version, tenantId)
                .orElseThrow(() -> new NotFoundException("Workflow not found"));
    }
    
    public List<WorkflowDefinition> findByName(String name) {
        return repository.findByName(name);
    }
}""",
    "src/main/java/com/hermes/admin/application/ActivityRegistryService.java": """package com.hermes.admin.application;

import com.hermes.admin.api.NotFoundException;
import com.hermes.admin.application.command.RegisterActivityCommand;
import com.hermes.admin.domain.ActivityDescriptor;
import com.hermes.admin.infrastructure.persistence.ActivityDescriptorRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class ActivityRegistryService {
    private final ActivityDescriptorRepository repository;

    public ActivityRegistryService(ActivityDescriptorRepository repository) {
        this.repository = repository;
    }

    public ActivityDescriptor register(RegisterActivityCommand cmd) {
        if (cmd.lambdaArn() == null || !cmd.lambdaArn().startsWith("arn:aws:lambda:")) {
            throw new IllegalArgumentException("Invalid Lambda ARN format");
        }

        ActivityDescriptor descriptor = new ActivityDescriptor();
        descriptor.setName(cmd.name());
        descriptor.setVersion(cmd.version());
        descriptor.setRuntime(cmd.runtime());
        descriptor.setLambdaArn(cmd.lambdaArn());
        descriptor.setTimeoutSeconds(cmd.timeoutSeconds());
        descriptor.setRetryConfig(cmd.retryConfigJson());
        descriptor.setCompensationLambdaArn(cmd.compensationLambdaArn());
        descriptor.setInputSchema(cmd.inputSchemaJson());
        descriptor.setOutputSchema(cmd.outputSchemaJson());
        descriptor.setPlatform(cmd.isPlatform());
        descriptor.setTenantId(cmd.tenantId());
        descriptor.setCreatedBy(cmd.createdBy());

        return repository.save(descriptor);
    }

    public Optional<ActivityDescriptor> findActivity(String name, int version, UUID tenantId) {
        return repository.findByNameAndVersionAndTenantId(name, version, tenantId);
    }

    public List<ActivityDescriptor> listPlatformActivities() {
        return repository.findByIsPlatformTrue();
    }
}""",
    "src/main/java/com/hermes/admin/api/TenantController.java": """package com.hermes.admin.api;

import com.hermes.admin.application.TenantService;
import com.hermes.admin.application.command.CreateTenantCommand;
import com.hermes.admin.domain.Tenant;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/tenants")
public class TenantController {
    private final TenantService tenantService;

    public TenantController(TenantService tenantService) {
        this.tenantService = tenantService;
    }

    @PostMapping("/")
    public ResponseEntity<Tenant> create(@RequestBody CreateTenantCommand cmd) {
        Tenant tenant = tenantService.create(cmd);
        return ResponseEntity.status(HttpStatus.CREATED).body(tenant);
    }

    @GetMapping("/{slug}")
    public ResponseEntity<Tenant> getBySlug(@PathVariable String slug) {
        return ResponseEntity.ok(tenantService.findBySlug(slug));
    }

    @GetMapping("/")
    public ResponseEntity<List<Tenant>> listActive() {
        return ResponseEntity.ok(tenantService.listActive());
    }

    @PostMapping("/{id}/suspend")
    public ResponseEntity<Tenant> suspend(@PathVariable UUID id) {
        return ResponseEntity.ok(tenantService.suspend(id));
    }
}""",
    "src/main/java/com/hermes/admin/api/WorkflowRegistryController.java": """package com.hermes.admin.api;

import com.hermes.admin.application.WorkflowDefinitionService;
import com.hermes.admin.application.command.RegisterWorkflowCommand;
import com.hermes.admin.domain.WorkflowDefinition;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/workflows")
public class WorkflowRegistryController {
    private final WorkflowDefinitionService workflowService;

    public WorkflowRegistryController(WorkflowDefinitionService workflowService) {
        this.workflowService = workflowService;
    }

    @PostMapping("/")
    public ResponseEntity<WorkflowDefinition> register(@RequestBody RegisterWorkflowCommand cmd) {
        WorkflowDefinition def = workflowService.register(cmd);
        return ResponseEntity.status(HttpStatus.CREATED).body(def);
    }

    @PostMapping("/{id}/activate")
    public ResponseEntity<WorkflowDefinition> activate(@PathVariable UUID id) {
        return ResponseEntity.ok(workflowService.activate(id));
    }

    @PostMapping("/{id}/deprecate")
    public ResponseEntity<WorkflowDefinition> deprecate(@PathVariable UUID id) {
        return ResponseEntity.ok(workflowService.deprecate(id));
    }

    @GetMapping("/")
    public ResponseEntity<List<WorkflowDefinition>> listWorkflows(@RequestParam String name) {
        return ResponseEntity.ok(workflowService.findByName(name));
    }
}""",
    "src/main/java/com/hermes/admin/api/ActivityRegistryController.java": """package com.hermes.admin.api;

import com.hermes.admin.application.ActivityRegistryService;
import com.hermes.admin.application.command.RegisterActivityCommand;
import com.hermes.admin.domain.ActivityDescriptor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/activities")
public class ActivityRegistryController {
    private final ActivityRegistryService activityService;

    public ActivityRegistryController(ActivityRegistryService activityService) {
        this.activityService = activityService;
    }

    @PostMapping("/")
    public ResponseEntity<ActivityDescriptor> register(@RequestBody RegisterActivityCommand cmd) {
        ActivityDescriptor desc = activityService.register(cmd);
        return ResponseEntity.status(HttpStatus.CREATED).body(desc);
    }

    @GetMapping("/")
    public ResponseEntity<List<ActivityDescriptor>> listPlatformActivities() {
        return ResponseEntity.ok(activityService.listPlatformActivities());
    }

    @GetMapping("/find")
    public ResponseEntity<ActivityDescriptor> findActivity(
            @RequestParam String name,
            @RequestParam int version,
            @RequestParam(required = false) UUID tenantId) {
        return activityService.findActivity(name, version, tenantId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}""",
    "src/main/java/com/hermes/admin/infrastructure/security/TenantContext.java": """package com.hermes.admin.infrastructure.security;

public class TenantContext {
    private static final ThreadLocal<String> CURRENT_TENANT = new ThreadLocal<>();

    public static void setTenantId(String tenantId) {
        CURRENT_TENANT.set(tenantId);
    }

    public static String getTenantId() {
        return CURRENT_TENANT.get();
    }

    public static void clear() {
        CURRENT_TENANT.remove();
    }
}""",
    "src/main/java/com/hermes/admin/infrastructure/security/TenantContextHolder.java": """package com.hermes.admin.infrastructure.security;

public class TenantContextHolder {
    public static String getTenantId() {
        return TenantContext.getTenantId();
    }
}""",
    "src/main/java/com/hermes/admin/infrastructure/security/HermesJwtAuthenticationConverter.java": """package com.hermes.admin.infrastructure.security;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;

@Component
public class HermesJwtAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        String tenantId = jwt.getClaimAsString("custom:tenantId");
        if (tenantId != null && !tenantId.isBlank()) {
            TenantContext.setTenantId(tenantId);
        }

        Collection<GrantedAuthority> authorities = extractAuthorities(jwt);
        return new JwtAuthenticationToken(jwt, authorities);
    }

    private Collection<GrantedAuthority> extractAuthorities(Jwt jwt) {
        List<String> cognitoGroups = jwt.getClaimAsStringList("cognito:groups");
        if (cognitoGroups != null) {
            return cognitoGroups.stream()
                    .map(group -> new SimpleGrantedAuthority("ROLE_" + group.toUpperCase()))
                    .collect(Collectors.toList());
        }
        return List.of();
    }
}""",
    "src/main/java/com/hermes/admin/infrastructure/security/TenantContextClearingFilter.java": """package com.hermes.admin.infrastructure.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@Order(Integer.MAX_VALUE)
public class TenantContextClearingFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        try {
            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }
}""",
    "src/main/java/com/hermes/admin/config/SecurityConfig.java": """package com.hermes.admin.config;

import com.hermes.admin.infrastructure.security.HermesJwtAuthenticationConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, HermesJwtAuthenticationConverter jwtConverter) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .authorizeHttpRequests(authz -> authz
                .requestMatchers("/actuator/**", "/internal/**").permitAll()
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtConverter))
            );
        return http.build();
    }
}""",
    "src/main/java/com/hermes/admin/config/ObservabilityConfig.java": """package com.hermes.admin.config;

import org.springframework.context.annotation.Configuration;

@Configuration
public class ObservabilityConfig {
    // Add any necessary micrometer/observability beans here
}""",
    "src/test/java/com/hermes/admin/application/WorkflowDefinitionServiceTest.java": """package com.hermes.admin.application;

import com.hermes.admin.application.command.RegisterWorkflowCommand;
import com.hermes.admin.domain.WorkflowDefinition;
import com.hermes.admin.infrastructure.persistence.WorkflowDefinitionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class WorkflowDefinitionServiceTest {

    private WorkflowDefinitionRepository repository;
    private WorkflowDefinitionService service;

    @BeforeEach
    void setUp() {
        repository = mock(WorkflowDefinitionRepository.class);
        service = new WorkflowDefinitionService(repository);
    }

    @Test
    void registerIncrementsVersion() {
        UUID tenantId = UUID.randomUUID();
        
        WorkflowDefinition v1 = new WorkflowDefinition();
        v1.setName("wf1");
        v1.setVersion(1);
        v1.setTenantId(tenantId);
        
        when(repository.findByName("wf1")).thenReturn(List.of(v1));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        RegisterWorkflowCommand cmd = new RegisterWorkflowCommand("wf1", "{}", tenantId, "user1");
        WorkflowDefinition res = service.register(cmd);

        assertEquals(2, res.getVersion());
        assertEquals(WorkflowDefinition.Status.DRAFT, res.getStatus());
    }

    @Test
    void activateDeprecatesExistingActive() {
        UUID id = UUID.randomUUID();
        UUID tenantId = UUID.randomUUID();
        
        WorkflowDefinition activeWf = new WorkflowDefinition();
        activeWf.setId(UUID.randomUUID());
        activeWf.setName("wf1");
        activeWf.setVersion(1);
        activeWf.setTenantId(tenantId);
        activeWf.setStatus(WorkflowDefinition.Status.ACTIVE);
        
        WorkflowDefinition draftWf = new WorkflowDefinition();
        draftWf.setId(id);
        draftWf.setName("wf1");
        draftWf.setVersion(2);
        draftWf.setTenantId(tenantId);
        draftWf.setStatus(WorkflowDefinition.Status.DRAFT);
        
        when(repository.findById(id)).thenReturn(Optional.of(draftWf));
        when(repository.findByNameAndStatus("wf1", WorkflowDefinition.Status.ACTIVE))
                .thenReturn(List.of(activeWf));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.activate(id);

        assertEquals(WorkflowDefinition.Status.DEPRECATED, activeWf.getStatus());
        assertEquals(WorkflowDefinition.Status.ACTIVE, draftWf.getStatus());
        verify(repository, times(2)).save(any(WorkflowDefinition.class));
    }
}""",
    "src/test/java/com/hermes/admin/application/TenantServiceTest.java": """package com.hermes.admin.application;

import com.hermes.admin.application.command.CreateTenantCommand;
import com.hermes.admin.domain.Tenant;
import com.hermes.admin.infrastructure.persistence.TenantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class TenantServiceTest {

    private TenantRepository repository;
    private TenantService service;

    @BeforeEach
    void setUp() {
        repository = mock(TenantRepository.class);
        service = new TenantService(repository);
    }

    @Test
    void createThrowsOnDuplicateSlug() {
        when(repository.save(any())).thenThrow(new DataIntegrityViolationException("duplicate"));
        
        CreateTenantCommand cmd = new CreateTenantCommand("T1", "t1", Tenant.Plan.STARTER, "user1");
        assertThrows(IllegalArgumentException.class, () -> service.create(cmd));
    }

    @Test
    void suspendChangesStatus() {
        UUID id = UUID.randomUUID();
        Tenant t = new Tenant();
        t.setId(id);
        t.setStatus(Tenant.Status.ACTIVE);
        
        when(repository.findById(id)).thenReturn(Optional.of(t));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Tenant res = service.suspend(id);
        
        assertEquals(Tenant.Status.SUSPENDED, res.getStatus());
    }
}"""
}

for rel_path, content in files.items():
    full_path = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w") as f:
        f.write(content)
print("Files generated successfully.")
