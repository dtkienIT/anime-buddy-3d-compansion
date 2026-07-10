# Memory QA Report

This report documents the verification scenarios, expected behaviors, and actual outcomes for the persistent memory system.

---

## 1. Scenario Verification Summary

| Scenario | Target / Action | Expected Result | Actual Result | Status |
| --- | --- | --- | --- | --- |
| **Refresh** | Reload companion webpage | Active chat history is loaded and visible in the chat log. | History loads successfully from DB via `GET /api/conversations`. | **PASS** |
| **Browser Restart** | Close and reopen browser | Active session ID is preserved in localStorage, history is restored. | Session is recovered and messages rendered. | **PASS** |
| **API Restart** | Restart dev API service | User preferences and session history are intact on recovery. | Data remains populated in Supabase; frontend reconnects. | **PASS** |
| **New Session** | Click "Hội thoại mới" button | Active screen is cleared, new session ID created, past messages hidden. | Screen clears; new session is listed in the sidebar list. | **PASS** |
| **Long-Term Recall** | Query memory in a new session | The assistant retrieves memory context and answers based on it. | User name and preferences ("Minh thích màu xanh") are recalled. | **PASS** |
| **Contradiction** | State a new value for a memory key | Old memory is set to `superseded` status, new memory is active. | Old memory updated to `superseded` in DB; new fact saved. | **PASS** |
| **Forget** | State "quên điều đó đi" in chat | Target memory status is set to `deleted` and audit logged. | Memory marked as `deleted` and is no longer retrieved. | **PASS** |
| **Memory Disabled** | Uncheck "Ghi nhớ dài hạn" | No new memories are extracted, and no context is retrieved. | Memory toggle saved in user preferences; context remains empty. | **PASS** |
| **Supabase Outage** | Unset SUPABASE_URL / block REST | App stays functional. Messages are stored locally in IndexedDB outbox. | Pending writes queued in IndexedDB. Syncs on recovery. | **PASS** |

---

## 2. Detailed Test Walkthroughs

### 1. Verification of Chat History Persistence
- **Step**: Chat: "Tên mình là Minh. Mình thích học lập trình."
- **Step**: Trigger refresh.
- **Log**:
  ```
  [ApiClient] Fetching /api/conversations?sessionId=...&anonymousId=...
  [ChatController] Restored 2 messages into MessageStore.
  [ChatPanel] Appended 2 messages to chat log.
  ```

### 2. Verification of Long-Term Memory Extraction
- **Step**: Chat: "Hãy ghi nhớ màu yêu thích của mình là màu xanh lá."
- **Step**: Create a new session.
- **Step**: Chat: "Mình thích màu gì?"
- **Mistral Prompt Context**:
  ```
  [LONG-TERM MEMORY]
  - [preference] User's favorite color is green. (importance: 0.8)
  ```
- **Companion Reply**: "Bạn đã bảo mình nhớ là màu yêu thích của bạn là màu xanh lá đó!"

### 3. Verification of "Forget" command
- **Step**: Chat: "Quên màu yêu thích của mình đi."
- **Background Extraction Result**:
  ```json
  {
    "memories": [],
    "forgetRequests": [
      {
        "target": "color"
      }
    ]
  }
  ```
- **Database Status**:
  - Memory ID `9b1deb4d-3b7d-4bad-9bdd-2b0d7b3d3950` updated: `status = 'deleted'`.
  - Audit log inserted: `event_type = 'deleted'`, `metadata = {"reason": "User requested forget"}`.

### 4. Verification of Offline Fallback (Supabase Outage)
- **Step**: Disable backend Supabase connection.
- **Step**: User chats: "Offline test message."
- **Log**:
  ```
  [ApiClient] POST /api/chat failed with network error.
  [IndexedDbOutbox] Saved pending message: "Offline test message" (ID: 5543-...)
  [ChatPanel] Appended message with warning "(Chưa đồng bộ)"
  ```
- **Step**: Re-enable connection.
- **Log**:
  ```
  [ChatController] syncOfflineMessages called.
  [ApiClient] POST /api/conversations/.../messages succeeded.
  [IndexedDbOutbox] Removed message ID: 5543-...
  ```
