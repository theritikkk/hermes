# Hermes — Capacity Planning & Resource Calculations

This document details mathematical capacity planning for running **1,000,000 Workflows per Day** on AWS.

---

## 1. Workload Parameters
- **Daily Workflows**: 1,000,000 workflows / day
- **Events per Workflow**: 8 events (AssetRegistered, WorkflowExecutionStarted, StepCompleted x3, WorkflowExecutionCompleted, UsageUpdated, OpenSearchIndexed)
- **Daily Total Events**: $1,000,000 \times 8 = 8,000,000 \text{ events / day}$
- **Average Event Payload Size**: 1.5 KB / event

---

## 2. Throughput & Partition Math

### Write Capacity Units (WCU)
- **Average Write Rate**: $8,000,000 / 86,400 \text{ seconds} \approx \mathbf{92.6 \text{ writes/sec}}$
- **Peak Write Rate (3x Peak Multiplier)**: $92.6 \times 3 \approx \mathbf{278 \text{ peak writes/sec}}$
- **WCU Calculation** (1 WCU = 1 write up to 1 KB): 1.5 KB payload requires **2 WCU / write**.
- **Required Peak WCU**: $278 \times 2 = \mathbf{556 \text{ WCU}}$

### Read Capacity Units (RCU)
- **Daily Read Queries**: 2,000,000 queries / day
- **Peak Read Rate**: $2,000,000 / 86,400 \times 3 \approx \mathbf{70 \text{ peak reads/sec}}$
- **Required Peak RCU**: 1 RCU per 4 KB eventual consistent read = **70 RCU**.

### Storage & Growth Math
- **Daily Event Store Growth**: $8,000,000 \times 1.5 \text{ KB} = \mathbf{12 \text{ GB / day}}$
- **Monthly Storage Growth**: $12 \text{ GB} \times 30 = \mathbf{360 \text{ GB / month}}$
- **Annual Storage Growth**: $360 \text{ GB} \times 12 = \mathbf{4.32 \text{ TB / year}}$
