# Firestore Security Specification (RopeSum)

## 1. Data Invariants
1. Every `QuestionFolder` (`question_folders/{folderId}`) must have a valid ID (`^[a-zA-Z0-9_\-]+$`, `<= 128`), a verified authenticated `ownerId == request.auth.uid`, valid `groupType` (`'FOLDER'` or `'TOPIC'`), bounded `groupName` (`1..120`), `isPublicActive == (isActive && isPublished)`, and server timestamps (`createdAt == request.time`, `updatedAt == request.time`).
2. Every `CustomQuestion` (`custom_questions/{questionId}`) must reference an existing or batch-created parent `QuestionFolder` (`folderId`) owned by `request.auth.uid`, contain 2–4 valid choice maps, a valid `correctChoiceIndex` (`0 <= idx < choices.size()`), `isPublicActive == (isActive && isPublished)`, and contain zero PII fields.
3. No unauthenticated or non-owner user may create, update, or delete any folder or question, nor read inactive/unpublished (`isPublicActive == false`) folders or questions.

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. **Unauthenticated Create**: Create `/question_folders/f1` without `request.auth` -> `PERMISSION_DENIED`.
2. **Unverified Email Create**: Create `/question_folders/f1` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **Identity Spoofing**: Create `/question_folders/f1` with `ownerId: "victim-uid"` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Create `/question_folders/f1` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
5. **Path ID Poisoning**: Create `/question_folders/../../etc/passwd` or 500-char ID -> `PERMISSION_DENIED`.
6. **Client Timestamp Forgery**: Create `/question_folders/f1` with backdated `createdAt` (`!= request.time`) -> `PERMISSION_DENIED`.
7. **Orphan Question**: Create `/custom_questions/q1` referencing non-existent `folderId` -> `PERMISSION_DENIED`.
8. **Cross-Owner Folder Hijack**: Create `/custom_questions/q1` referencing another user's `folderId` -> `PERMISSION_DENIED`.
9. **Invariant Mismatch (`isPublicActive`)**: Create `/custom_questions/q1` with `isActive: false, isPublished: true, isPublicActive: true` -> `PERMISSION_DENIED`.
10. **Owner Immutability Bypass**: Update `ownerId` or `createdAt` on an owned `custom_questions/{id}` -> `PERMISSION_DENIED`.
11. **Value Poisoning on Update**: Update `groupName` to `""` or 500 chars -> `PERMISSION_DENIED`.
12. **Private Draft Read**: Unauthenticated or non-owner `get`/`list` where `isPublicActive == false` -> `PERMISSION_DENIED`.
