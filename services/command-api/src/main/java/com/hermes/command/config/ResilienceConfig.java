package com.hermes.command.config;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
public class ResilienceConfig {

    @Bean
    public CircuitBreakerRegistry circuitBreakerRegistry() {
        CircuitBreakerConfig config = CircuitBreakerConfig.custom()
                .failureRateThreshold(50.0f)
                .waitDurationInOpenState(Duration.ofSeconds(5))
                .slidingWindowSize(20)
                .minimumNumberOfCalls(5)
                .build();

        return CircuitBreakerRegistry.of(config);
    }

    @Bean
    public CircuitBreaker dynamoDbCircuitBreaker(CircuitBreakerRegistry registry) {
        return registry.circuitBreaker("dynamoDbEventStore");
    }
}
