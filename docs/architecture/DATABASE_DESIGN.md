# QuantumTradeAI Database Design

## Overview

QuantumTradeAI uses **PostgreSQL** as its primary relational database and **Prisma ORM** for database access.

The database is designed to be modular, scalable, and secure.

---

# Current Database

## User

| Field | Type | Description |
|--------|------|-------------|
| id | String | Primary Key (CUID) |
| email | String | Unique email address |
| password | String | Hashed password |
| firstName | String? | Optional first name |
| lastName | String? | Optional last name |
| role | Role | User role |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

---

# Current Enums

## Role

```
USER

MODERATOR

ADMIN

SUPER_ADMIN
```

---

# Planned Database Modules

## Authentication

- User Sessions
- Refresh Tokens
- Email Verification
- Password Reset
- Login History
- Device Management

---

## User Management

Future fields

- Avatar
- Phone Number
- Country
- Time Zone
- Language
- Status
- Last Login
- Email Verified
- Two-Factor Authentication

---

## Exchange Integration

Future tables

- Exchange
- ExchangeAccount
- ExchangeApiKey

Relationships

```
User

↓

ExchangeAccount

↓

Exchange
```

---

## Trading

Future tables

- Orders
- Positions
- Trades
- Trading Bots
- Trading Strategies

Relationships

```
User

↓

Trading Bot

↓

Orders

↓

Trades
```

---

## Portfolio

Future tables

- Portfolio
- Portfolio Asset
- Portfolio History
- Performance Snapshot

---

## AI

Future tables

- AI Signal
- AI Strategy
- AI Analysis
- AI Prompt History

---

## Subscription

Future tables

- Plan
- Subscription
- Coupon
- Invoice

---

## Payments

Future tables

- Payment
- Deposit
- Withdrawal
- Wallet

---

## Notifications

Future tables

- Notification
- Email Queue
- SMS Queue
- Push Queue

---

## CMS

Future tables

- Blog
- Category
- FAQ
- Announcement
- Popup
- Page

---

## Analytics

Future tables

- User Analytics
- Trade Analytics
- Revenue Analytics
- AI Analytics

---

# Database Principles

- UUID/CUID primary keys
- Foreign key relationships
- Soft delete where appropriate
- Indexed lookup fields
- Unique constraints
- Audit timestamps

---

# Migration Strategy

Every schema change must be introduced through a Prisma migration.

Never modify production tables manually.

---

# Backup Strategy

Future production database:

- Daily backup
- Point-in-time recovery
- Encrypted backups
- Automated restore verification

---

# Future ER Diagram

A complete Entity Relationship Diagram (ERD) will be maintained as the database grows.