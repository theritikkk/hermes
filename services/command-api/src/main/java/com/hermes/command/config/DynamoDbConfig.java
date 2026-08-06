package com.hermes.command.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;

@Configuration
public class DynamoDbConfig {

    @Bean
    public DynamoDbClient dynamoDbClient() {
        return DynamoDbClient.builder()
                // Relies on DefaultCredentialsProvider chain (IAM roles, env vars, etc.)
                // Uses default region provider chain
                .build();
    }
}
