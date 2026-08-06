package com.hermes.admin.application;

import com.hermes.admin.domain.WorkflowVersionRegistry;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Reads workflow templates from the classpath/templates directory on application startup
 * and pre-seeds the {@link WorkflowVersionRegistry}.
 */
@Component
public class WorkflowTemplateLoader {

    private static final Logger log = LoggerFactory.getLogger(WorkflowTemplateLoader.class);

    private final WorkflowVersionRegistry registry;

    public WorkflowTemplateLoader(WorkflowVersionRegistry registry) {
        this.registry = registry;
    }

    @PostConstruct
    public void loadTemplatesOnStartup() {
        log.info("[TemplateLoader] Scanning for built-in workflow ASL templates...");
        try {
            var resolver = new PathMatchingResourcePatternResolver();
            Resource[] resources = resolver.getResources("classpath*:workflows/templates/*.json");

            if (resources.length == 0) {
                // Fallback scan location if loaded via file system in dev
                resources = resolver.getResources("file:workflows/templates/*.json");
            }

            for (Resource resource : resources) {
                String filename = resource.getFilename();
                if (filename == null) continue;

                try (InputStream is = resource.getInputStream()) {
                    String content = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                    parseAndRegister(filename, content);
                }
            }
            log.info("[TemplateLoader] Successfully loaded templates into WorkflowVersionRegistry. Registry size: {}", registry.size());
        } catch (Exception e) {
            log.warn("[TemplateLoader] Could not load external template files: {}. Defaulting to programmatic registration.", e.getMessage());
            registerProgrammaticDefaults();
        }
    }

    private void parseAndRegister(String filename, String content) {
        // Expected naming format: <name>-v<version>.json, e.g. document-pipeline-v2.json
        String baseName = filename.endsWith(".json") ? filename.substring(0, filename.length() - 5) : filename;
        int lastDashV = baseName.lastIndexOf("-v");

        String name = baseName;
        int version = 1;

        if (lastDashV > 0) {
            name = baseName.substring(0, lastDashV);
            try {
                version = Integer.parseInt(baseName.substring(lastDashV + 2));
            } catch (NumberFormatException ignored) {}
        }

        try {
            registry.registerDraft(name, version, content, "SYSTEM_INIT");
            registry.publish(name, version);
            log.info("[TemplateLoader] Loaded and published workflow template: {}:v{}", name, version);
        } catch (IllegalArgumentException e) {
            log.debug("[TemplateLoader] Template {}:v{} already registered: {}", name, version, e.getMessage());
        }
    }

    private void registerProgrammaticDefaults() {
        try {
            String defaultDocPipelineV1 = """
                    {"Comment":"document-pipeline v1","StartAt":"Validate","States":{"Validate":{"Type":"Pass","End":true}}}
                    """;
            registry.registerDraft("document-pipeline", 1, defaultDocPipelineV1, "SYSTEM_INIT");
            registry.publish("document-pipeline", 1);
        } catch (Exception ignored) {}
    }
}
