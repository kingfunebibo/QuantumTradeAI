# QuantumTradeAI API Standards

This document defines the standards that every QuantumTradeAI API must follow.

---

# Base URL

Development

```
http://localhost:3000/api
```

Production

```
https://api.quantumtradeai.com/api
```

Future API Versioning

```
/api/v1
```

---

# Authentication

Protected endpoints require:

```
Authorization: Bearer <JWT_TOKEN>
```

---

# Content Type

All requests and responses use JSON.

```
Content-Type: application/json
```

---

# Standard Success Response

```json
{
  "success": true,
  "message": "Operation completed successfully.",
  "data": {}
}
```

---

# Standard Error Response

```json
{
  "success": false,
  "message": "Something went wrong."
}
```

---

# Validation Error

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {}
}
```

---

# Pagination

All list endpoints should support:

```
?page=1
&limit=20
&search=
&sortBy=
&order=asc
```

Example

```
GET /api/admin/users?page=1&limit=20
```

---

# HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Validation Error |
| 500 | Internal Server Error |

---

# Naming Convention

Routes

```
/users
/users/:id
/admin/users
```

Never

```
/GetUsers
/CreateUser
```

---

# Controller Responsibilities

Controllers should only:

- Validate input
- Call services
- Return responses

Business logic belongs inside services.

---

# Service Responsibilities

Services should:

- Handle business logic
- Communicate with Prisma
- Throw AppError when necessary

---

# Database Access

Only services should communicate with Prisma.

Never access Prisma directly inside controllers.

---

# Authorization

Use middleware.

Example

```
authenticate

authorize(Role.ADMIN)

authorize(Role.SUPER_ADMIN)

authorize(Role.ADMIN, Role.SUPER_ADMIN)
```

---

# Logging

Every request should be logged.

Unexpected errors should be logged.

Sensitive information must never be logged.

Never log:

- Passwords
- JWT Secrets
- API Secrets
- Exchange API Keys

---

# Response Time Goal

Average endpoint response:

< 300ms

Trading endpoints:

< 500ms

---

# Security Rules

Always:

- Validate input
- Sanitize data
- Hash passwords
- Verify JWT
- Authorize roles
- Use HTTPS in production

---

# Future Standards

The following will be added later:

- Rate limiting
- API versioning
- Request IDs
- Correlation IDs
- Swagger/OpenAPI
- Webhooks
- Idempotency keys