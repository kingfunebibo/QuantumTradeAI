# 🚀 QuantumTradeAI Backend

QuantumTradeAI is an AI-powered cryptocurrency trading platform designed to provide market analysis, trading signals, portfolio management, and automated trading across multiple cryptocurrency exchanges.

This repository contains the backend API built with **Node.js**, **Express**, **TypeScript**, **Prisma**, and **PostgreSQL**.

---

# Features

## Authentication

- User Registration
- User Login
- JWT Authentication
- Password Hashing (bcrypt)
- Protected Routes
- Current User Endpoint (`/api/auth/me`)

## Database

- PostgreSQL
- Prisma ORM
- Database Migrations

## API

- REST API
- Zod Validation
- Market Endpoint
- Authentication Endpoints

---

# Tech Stack

- Node.js
- Express.js
- TypeScript
- PostgreSQL
- Prisma ORM
- JWT
- bcrypt
- Zod
- ESLint
- Prettier

---

# Project Structure

```
backend/
│
├── prisma/
│   ├── migrations/
│   └── schema.prisma
│
├── src/
│   ├── auth/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── users/
│   ├── app.ts
│   └── server.ts
│
├── package.json
├── tsconfig.json
└── README.md
```

---

# Prerequisites

Before running the project, install:

- Node.js 22+
- PostgreSQL 18+
- Git

---

# Installation

Clone the repository:

```bash
git clone https://github.com/kingfunebibo/QuantumTradeAI.git
```

Go into the backend directory:

```bash
cd QuantumTradeAI/backend
```

Install dependencies:

```bash
npm install
```

---

# Environment Variables

Create a `.env` file inside the backend folder.

Example:

```env
PORT=3000

NODE_ENV=development

DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/quantumtradeai"

JWT_SECRET=YOUR_SUPER_SECRET_KEY

FRONTEND_URL=http://localhost:5173

COINGECKO_BASE_URL=https://api.coingecko.com/api/v3

MARKET_CACHE_SECONDS=30
```

---

# Prisma

Generate Prisma Client:

```bash
npx prisma generate
```

Run migrations:

```bash
npx prisma migrate dev
```

Check migration status:

```bash
npx prisma migrate status
```

Open Prisma Studio:

```bash
npx prisma studio
```

---

# Running the Project

Development:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

Start production:

```bash
npm start
```

---

# Available Scripts

```bash
npm run dev
```

Runs the backend in development mode.

```bash
npm run build
```

Compiles TypeScript.

```bash
npm start
```

Runs the compiled application.

```bash
npm run lint
```

Runs ESLint.

```bash
npm run format
```

Formats the project using Prettier.

---

# API Endpoints

## Health Check

```
GET /
```

---

## Register

```
POST /api/auth/register
```

Example:

```json
{
  "email": "john@example.com",
  "password": "Password123",
  "firstName": "John",
  "lastName": "Doe"
}
```

---

## Login

```
POST /api/auth/login
```

Example:

```json
{
  "email": "john@example.com",
  "password": "Password123"
}
```

---

## Current User

```
GET /api/auth/me
```

Headers:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## Markets

```
GET /api/markets
```

Returns cryptocurrency market data.

---

# Development Workflow

After making changes:

```bash
git add .
```

```bash
git commit -m "Describe your changes"
```

```bash
git push
```

---

# Daily Startup Checklist

## 1. Open the project

```text
QuantumTradeAI/backend
```

## 2. Start PostgreSQL

Ensure PostgreSQL is running.

## 3. Start the backend

```bash
npm run dev
```

## 4. Test the backend

Open:

```
http://localhost:3000
```

You should receive:

```json
{
  "app": "QuantumTradeAI Backend",
  "status": "Running",
  "version": "1.0.0"
}
```

## 5. Test authentication

Use Thunder Client or Postman:

```
POST /api/auth/login
```

---

# Roadmap

## Completed

- Express Backend
- PostgreSQL
- Prisma ORM
- Authentication
- JWT
- Protected Routes
- Market Endpoint
- GitHub Integration

## In Progress

- Global Error Handler
- API Response Helpers
- Role-Based Authorization
- Request Logging
- Security Middleware

## Planned

- Portfolio Management
- Exchange Integration
  - Bybit
  - Binance
  - KuCoin
  - MEXC
  - Bitget
  - Gate.io
- WebSocket Market Data
- AI Trading Engine
- Strategy Backtesting
- Automated Trading Bot
- Notifications
- Admin Dashboard
- Docker Deployment
- CI/CD Pipeline

---

# GitHub

Repository:

https://github.com/kingfunebibo/QuantumTradeAI

---

# License

This project is licensed under the MIT License.

---

# Author

**King Funebibo**

GitHub:

https://github.com/kingfunebibo

---

**QuantumTradeAI**

*Trade Smarter with AI.*

After creating the file

Run:
git add README.md
git commit -m "Add project README"
git push