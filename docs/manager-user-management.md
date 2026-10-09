# Manager user management

Managers can edit users and hand over their own role. Admins keep full control.
All endpoints need `Authorization: Bearer <token>`. Role is read live from the database on every request, so a role change applies immediately.

## Who can do what

| Action | Admin | Manager | Agent |
|---|---|---|---|
| Edit name / phone / email / active flag | any user | any user except admins | no |
| Change someone's role | any role | not to or from `admin` | no |
| Hand over own role | no | yes | no |
| Create user (`POST /api/users`) | yes | no | no |
| Delete user (`DELETE /api/users/:userId`) | yes | no | no |

## Edit user

`PATCH /api/users/:userId`

Body (send only what changes): `name`, `phone`, `email`, `role` (`admin` | `manager` | `agent`), `is_active`.

```json
{ "email": "new.address@example.com", "name": "New Name", "role": "manager" }
```

Returns the updated user with `"updated": true`.

Rules:
- A manager cannot edit an admin or grant the `admin` role (403).
- `email` must be valid and not used by anyone else (400 `Email already registered`). The change is immediate: the person signs in with the new address using the emailed 6-digit code. The old address stops working.
- You cannot deactivate yourself or change your own role here (400). Managers use the hand-over below.
- No fields sent returns 400 `No fields to update`.
- Audit entries: `user.email_changed`, `user.role_changed`, `user.activated` / `user.deactivated`, `user.updated`.

## Hand over your manager role

`POST /api/users/:userId/handover` (no body)

The target becomes `manager` and the caller becomes `agent`, in one transaction. Leads and teams stay where they are; moving them is a separate step.

```json
{
  "handed_over": true,
  "from": { "id": 7, "role": "agent" },
  "to": { "id": 12, "email": "agent@example.com", "name": "Agent Name", "role": "manager" }
}
```

Rules:
- Only a manager can call it (403 otherwise).
- The target must be an active agent. Admin, manager, deactivated, or yourself is refused (400 / 409).
- Any custom role on either user is cleared, as with any system-role change.
- Audit: two `user.role_changed` entries with `via: "handover"`.

## Remove user (admin only)

`DELETE /api/users/:userId` — refused while the user still owns or is assigned leads, created teams, is the only active admin, or is you. Returns `{ deleted, id, email }`.

## Code

`backend-next/src/routes/userRoutes.js`, `controllers/UserController.js`, `services/UserService.js` (`update`, `handoverRole`, `remove`).
