# Task: Automated Activity Retries

Implementation of an automated retry mechanism for failed system activities with frontend orchestration and visual feedback.

- [x] Backend: Create centralized activity service
    - [x] Create `src/services/activity-service.ts`
    - [x] Refactor `src/app/api/activity/[id]/retry/route.ts` to use the service
- [x] Frontend: Implement retry orchestration in ActivityTable
    - [x] Track pending retries and countdown state
    - [x] Implement Batch Toast logic for multiple failures
    - [x] Trigger retry API after 10s delay
- [x] UI: Visual updates
    - [x] Update `ActivityTable.tsx` to show "Reintentando..." status
    - [x] Update `upload-progress-card.tsx` with retry visual states
- [x] Verification
    - [x] Test single failure retry flow
    - [x] Test batch failure grouping
    - [x] Test 3rd attempt disclaimer
