package com.hermes.command.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.services.eventbridge.EventBridgeClient;

@Configuration
public class AwsConfig {

    @Bean
    public EventBridgeClient eventBridgeClient() {
        return EventBridgeClient.builder()
                // Relies on DefaultCredentialsProvider and region provider chains
                .build();
    }
}
