package com.hermes.admin.application;

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
}