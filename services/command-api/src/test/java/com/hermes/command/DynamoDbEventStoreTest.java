package com.hermes.command;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hermes.command.domain.aggregate.AggregateType;
import com.hermes.command.domain.event.EventEnvelope;
import com.hermes.command.infrastructure.eventstore.AppendEventInput;
import com.hermes.command.infrastructure.eventstore.AppendResult;
import com.hermes.command.infrastructure.eventstore.ConcurrencyException;
import com.hermes.command.infrastructure.eventstore.DynamoDbEventStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.*;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class DynamoDbEventStoreTest {

    private DynamoDbClient dynamoDbClient;
    private ObjectMapper objectMapper;
    private DynamoDbEventStore eventStore;

    @BeforeEach
    void setUp() {
        dynamoDbClient = mock(DynamoDbClient.class);
        objectMapper = new ObjectMapper();
        eventStore = new DynamoDbEventStore(dynamoDbClient, "test-table", objectMapper);
    }

    @Test
    void append_Success() {
        when(dynamoDbClient.transactWriteItems(any(TransactWriteItemsRequest.class)))
                .thenReturn(TransactWriteItemsResponse.builder().build());

        AppendEventInput input = new AppendEventInput(
                AggregateType.ASSET,
                "asset-123",
                "tenant-1",
                "corr-1",
                "ASSET_REGISTERED",
                1,
                Map.of("key", "value"),
                0
        );

        AppendResult result = eventStore.append(input);

        assertNotNull(result);
        assertNotNull(result.event());
        assertEquals("ASSET_REGISTERED", result.event().eventType().name());
        assertEquals(1, result.event().sequence());
        assertFalse(result.wasIdempotent());

        ArgumentCaptor<TransactWriteItemsRequest> captor = ArgumentCaptor.forClass(TransactWriteItemsRequest.class);
        verify(dynamoDbClient).transactWriteItems(captor.capture());
        TransactWriteItemsRequest request = captor.getValue();
        assertEquals(2, request.transactItems().size());
    }

    @Test
    void append_ConcurrencyException() {
        CancellationReason reason = CancellationReason.builder().code("ConditionalCheckFailed").build();
        TransactionCanceledException ex = (TransactionCanceledException) TransactionCanceledException.builder()
                .cancellationReasons(List.of(reason))
                .message("Conflict")
                .build();
                
        when(dynamoDbClient.transactWriteItems(any(TransactWriteItemsRequest.class)))
                .thenThrow(ex);

        AppendEventInput input = new AppendEventInput(
                AggregateType.ASSET,
                "asset-123",
                "tenant-1",
                "corr-1",
                "ASSET_REGISTERED",
                1,
                Map.of(),
                1
        );

        assertThrows(ConcurrencyException.class, () -> eventStore.append(input));
    }
}
