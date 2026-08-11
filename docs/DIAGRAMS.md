# Hermes Platform  System Diagrams & Visual Models

This document contains Mermaid diagrams visualizing the execution mechanics, event-sourcing outbox pipeline, Saga state machine, and snapshot time-travel engine.

---

## 1. End-to-End Command-to-Projection Architecture Flow

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant API as Command API (Lambda)
    participant ES as DynamoDB Event Store
    participant Stream as DynamoDB Streams
    participant SQS as Outbox SQS Queue
    participant Pub as outbox-publisher Lambda
    participant EB as EventBridge
    participant SFN as Step Functions Engine
    participant Proj as execution-projection Lambda
    participant RM as DynamoDB Read Model

    Client->>API: POST /api/v1/executions (StartWorkflow)
    API->>ES: TransactWriteItems (META + EVT#1)
    ES-->>API: 200 OK (ExecutionId)
    API-->>Client: 202 Accepted { executionId }

    ES-->>Stream: CDC Stream Record
    Stream->>SQS: Forward Event Item
    SQS->>Pub: SQS Event Batch
    Pub->>EB: PutEvents (WorkflowExecutionStarted)
    Pub->>ES: Mark Event Status = PUBLISHED

    par Event Bridge Fan-Out
        EB->>SFN: Trigger State Machine (Native Target)
        EB->>Proj: Forward Event
    end

    Proj->>RM: UpdateExpression (Set status=RUNNING)
    SFN->>SFN: Execute Activity Steps...
```

---

## 2. Saga Compensation State Machine

```mermaid
stateDiagram-v2
    [*] --> RUNNING: Start Execution

    state RUNNING {
        [*] --> RecordForwardStep
        RecordForwardStep --> RecordForwardStep: StepCompleted
    }

    RUNNING --> COMPENSATING: StepFailed / Failure Trigger
    RUNNING --> COMPLETE: All Steps Completed

    state COMPENSATING {
        [*] --> FetchCompletedForwardSteps
        FetchCompletedForwardSteps --> ComputeLIFOOrder
        ComputeLIFOOrder --> ExecuteCompensationAction
        ExecuteCompensationAction --> RecordCompensationCompleted
        RecordCompensationCompleted --> ExecuteCompensationAction: Next Step in LIFO
        RecordCompensationCompleted --> AllCompensated: End of LIFO List
    }

    COMPENSATING --> COMPENSATED: AllCompensated
    COMPLETE --> [*]
    COMPENSATED --> [*]
```

---

## 3. Snapshot Time-Travel History Reconstruction

```mermaid
flowchart TB
    subgraph Storage["DynamoDB Single-Table"]
        direction TB
        E1["EVT#0000000001: WorkflowExecutionStarted"]
        E2["EVT#0000000002: StepCompleted (validate)"]
        S1["SNAP#0000000050: AggregateSnapshot (Seq 50)"]
        E51["EVT#0000000051: StepCompleted (ocr)"]
        E52["EVT#0000000052: StepCompleted (classify)"]
    end

    subgraph Reader["Snapshot-Aware EventStoreReader"]
        Query["Query SNAP# Descending (Limit 1)"]
        Hit{"Snapshot Found?"}
        LoadPartial["Load Events from Sequence 51+"]
        LoadAll["Load Events from Sequence 1+"]
    end

    subgraph ReplayEngine["ReplayService / Projector"]
        Project["ExecutionStateProjector.projectToEnd()"]
        Delta["Compute Replay Delta (Cached vs Re-dispatch)"]
    end

    Query --> Hit
    Hit -- Yes --> S1 --> LoadPartial
    Hit -- No --> LoadAll
    LoadPartial --> E51 & E52 --> Project
    LoadAll --> E1 & E2 & E51 & E52 --> Project
    Project --> Delta
```
