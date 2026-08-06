package com.hermes.command.domain.workflow;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Definition of a workflow pipeline.
 */
@Getter
@AllArgsConstructor
public class WorkflowDefinition {
    private final String name;
    private final int version;
    private final List<StepDefinition> steps;
    private final Map<String, String> transitions;

    public boolean isTerminalStep(String stepName) {
        return "END".equals(transitions.get(stepName));
    }

    public Set<String> terminalSteps() {
        return transitions.entrySet().stream()
            .filter(e -> "END".equals(e.getValue()))
            .map(Map.Entry::getKey)
            .collect(Collectors.toSet());
    }

    public Optional<String> nextStep(String stepName) {
        String next = transitions.get(stepName);
        return "END".equals(next) ? Optional.empty() : Optional.ofNullable(next);
    }

    public Optional<String> compensationStep(String stepName) {
        return steps.stream()
            .filter(s -> s.name().equals(stepName))
            .findFirst()
            .flatMap(StepDefinition::compensationStep);
    }

    public static WorkflowDefinition documentPipelineV1() {
        return new WorkflowDefinition(
            "document-pipeline",
            1,
            List.of(
                new StepDefinition("validate", "validateActivity", 60, Optional.empty(), Optional.empty()),
                new StepDefinition("ocr", "ocrActivity", 300, Optional.of(new RetryConfig(3, 10, 2.0)), Optional.empty()),
                new StepDefinition("classify", "classifyActivity", 60, Optional.empty(), Optional.empty())
            ),
            Map.of(
                "validate", "ocr",
                "ocr", "classify",
                "classify", "END"
            )
        );
    }
}
