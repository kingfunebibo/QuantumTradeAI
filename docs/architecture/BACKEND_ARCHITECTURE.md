# QuantumTradeAI Backend Architecture

## Overview

QuantumTradeAI follows a modular, service-oriented architecture designed for scalability, maintainability, and security.

The backend is built with:

- Node.js
- Express.js
- TypeScript
- PostgreSQL
- Prisma ORM
- JWT Authentication

---

# High-Level Architecture

```
Frontend
    │
    ▼
REST API (Express)
    │
    ▼
Controllers
    │
    ▼
Services
    │
    ▼
Prisma ORM
    │
    ▼
PostgreSQL
```

---

# Project Structure

```
src/
│
├── admin/
├── ai/
├── auth/
├── cms/
├── config/
├── controllers/
├── errors/
├── exchanges/
├── market/
├── middleware/
├── notifications/
├── payments/
├── portfolio/
├── routes/
├── services/
├── subscriptions/
├── trading/
├── users/
├── utils/
│
├── app.ts
└── server.ts
```

---

# Layer Responsibilities

## Controllers

Controllers should:

- Receive requests
- Validate input
- Call services
- Return responses

Controllers must NOT contain business logic.

---

## Services

Services are responsible for:

- Business logic
- Database operations
- External APIs
- Exchange communication
- AI communication

---

## Middleware

Middleware handles:

- Authentication
- Authorization
- Logging
- Validation
- Error handling

---

## Database

Database access happens only through Prisma.

Controllers must never communicate directly with Prisma.

---

# Module Structure

Every feature module should follow:

```
feature/

feature.controller.ts

feature.service.ts

feature.routes.ts

feature.validation.ts

feature.types.ts
```

Optional:

```
feature.repository.ts

feature.constants.ts

feature.helpers.ts
```

---

# Authentication Flow

```
Login

↓

JWT Generated

↓

Client Stores Token

↓

Authorization Header

↓

Authentication Middleware

↓

Authorization Middleware

↓

Controller
```

---

# Authorization

Current Roles

- USER
- MODERATOR
- ADMIN
- SUPER_ADMIN

Future:

Permission-based access control will be added without changing the API structure.

---

# Error Flow

```
Controller

↓

Service

↓

Throw AppError

↓

Global Error Handler

↓

Standard JSON Response
```

---

# Logging

All incoming requests:

- Method
- Route
- Status
- Duration
- IP

Future additions:

- User ID
- Correlation ID
- Request ID

---

# Configuration

Configuration should be centralized.

Never read environment variables directly inside business logic.

Future:

```
config/

auth.ts

database.ts

exchange.ts

app.ts
```

---

# Security

Current

- JWT
- Password Hashing
- RBAC

Future

- 2FA
- Rate Limiting
- Refresh Tokens
- Session Management
- Audit Logs
- API Key Encryption

---

# Future Modules

The architecture supports:

- Spot Trading
- Futures Trading
- AI Trading
- Copy Trading
- Portfolio Management
- Exchange Integrations
- Payment Processing
- CMS
- Marketing
- Analytics
- Notifications
- Mobile API