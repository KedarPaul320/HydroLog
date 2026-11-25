# HydroLog Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: Any unmatched path is strictly denied for both reads and writes.
2. **Trusted Admin Registry**: Admin privileges are granted ONLY to UIDs present in `/admins/{uid}` or the verified bootstrap owner configured in `firestore.rules` (with `email_verified == true`). Self-assigning `role: "admin"` or writing to `/admins/{uid}` by non-admins is impossible.
3. **PII Isolation**: `/users/{uid}` contains operator email addresses and is readable ONLY by the document owner (`uid == request.auth.uid`) or an Admin (`isAdmin()`). Listing `/users` is strictly Admin-only.
4. **Provisioned Active Membership**: Only active users provisioned in `/users/{uid}` (or Admins) may submit readings or read plant/motor configuration. Unprovisioned signups cannot access any data.
5. **Reading Ownership & Photo Integrity**: Creating a reading in `/readings/{readingId}` requires `submittedBy == request.auth.uid`, valid `waterFlow` (`0 < waterFlow <= 1000000`), valid `motorStatus` (`Running` or `Stopped`), server timestamps (`createdAt == request.time`, `updatedAt == request.time`), a 45-day `expiresAt` timestamp, and atomic creation of its paired `/reading_photos/{photoId}` document (`existsAfter`).
6. **Immutable Retention Window & Scoped Motor Stop**: `createdAt`, `expiresAt`, and `submittedBy` are immutable on updates. Only Admins may edit reading fields or delete readings; active members may perform only a one-way `Running` → `Stopped` status transition (`affectedKeys().hasOnly(['motorStatus', 'updatedAt'])`) when stopping a motor or triggering the single-motor interlock.
7. **Secure List Queries**: Field users can only list readings where `resource.data.submittedBy == request.auth.uid`; Admins can list all readings.
8. **Admin-Only Configuration**: Only Admins may create, rename, or delete `/plants/{plantId}` and `/motors/{motorId}`.
9. **Per-Plant Single-Motor Interlock**: `/plant_motor_states/{plantId}` stores non-PII live active motor state per plant (`activeMotorName`, `previousStoppedMotor`). Active members may read/list and update it with `updatedBy == request.auth.uid`, `updatedAt == request.time`, and verified parent plant existence (`exists(/plants/{plantId})`). Only Admins may delete state documents.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Read**: Anonymous client attempts `get` on `/readings/r1` or `/plants/p1`.
2. **Self-Admin Escalation**: Field user attempts `create` on `/admins/{ownUid}` with `{ uid, email, createdAt }`.
3. **Email Spoofing Attack**: Attacker matching the bootstrap owner email with `email_verified: false` attempts to write `/admins/{uid}` or `/plants/p1`.
4. **PII Cross-Read**: Field user A attempts `get` on `/users/{userB}` or `list` on `/users`.
5. **Role Tampering**: Field user attempts `update` on `/users/{ownUid}` setting `{ role: "admin" }`.
6. **Shadow Field Injection**: Field user creates `/readings/r1` with an extra ghost field `{ isVerified: true }`.
7. **Identity Spoofing on Reading**: Field user A creates `/readings/r1` with `submittedBy: "userB_uid"`.
8. **Orphaned Reading Without Photo**: Field user creates `/readings/r1` without creating `/reading_photos/{photoId}` in the same atomic batch.
9. **Client Timestamp Forgery**: Field user creates `/readings/r1` with a backdated `createdAt` or `expiresAt` set 365 days in the future.
10. **Retention Window Tampering on Update**: Admin updates `/readings/r1` attempting to extend `expiresAt` or alter `createdAt`.
11. **Field User Modifying Reading**: Field user attempts `delete` on `/readings/r1`, attempts to edit `waterFlow`/`review`/`plant`, or attempts to flip `motorStatus` from `Stopped` back to `Running`.
12. **Resource Poisoning / Invalid ID**: User attempts `create` on `/readings/invalid..id$$` or injects `waterFlow: -50` or a 2,000-character `review` string.
