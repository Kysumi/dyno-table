# Installation Guide

Get dyno-table up and running in your project.

## Prerequisites

- **Node.js** 16.0 or higher
- **TypeScript** 4.0 or higher (recommended)
- **AWS Account** with DynamoDB access (or local DynamoDB)

## Basic Installation

### Install dyno-table

```bash
# Using npm
npm install dyno-table @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# Using yarn
yarn add dyno-table @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# Using pnpm
pnpm add dyno-table @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

### Add Schema Validation

Choose your preferred validation library, this is required if you want to use the Entity based approach

```bash
# Zod (most popular, included in examples)
npm install zod

# ArkType (performance-focused)
npm install arktype

# Valibot (lightweight)
npm install valibot
```

## Framework Integration

### Next.js

```ts
// lib/db.ts
import { table } from "../db/config";
export { table };

// pages/api/dinosaurs/[id].ts
import { table } from "../../../lib/db";
import { dinoRepo } from "../../../entities/dinosaur";

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "GET") {
    const dinosaur = await dinoRepo.get({ id });
    res.json(dinosaur);
  }
}
```

### Express.js

```ts
// routes/dinosaurs.ts
import express from "express";
import { dinoRepo } from "../entities/dinosaur";

const router = express.Router();

router.get("/:id", async (req, res) => {
  try {
    const dinosaur = await dinoRepo.get({ id: req.params.id });
    res.json(dinosaur);
  } catch (error) {
    res.status(404).json({ error: "Dinosaur not found" });
  }
});

export default router;
```

### NestJS

```ts
// dinosaur.service.ts
import { Injectable } from "@nestjs/common";
import { dinoRepo } from "./entities/dinosaur";

@Injectable()
export class DinosaurService {
  async findOne(id: string) {
    return dinoRepo.get({ id });
  }

  async findByDiet(diet: string) {
    return dinoRepo.query
      .getDinosaursByDiet({ diet })
      .execute();
  }
}
```

## Troubleshooting

### Common Installation Issues

**TypeScript errors?**
```bash
# Make sure you have the right TypeScript version
npm install -D typescript@^4.0.0

# Check your tsconfig.json includes the right settings
```

**AWS credentials not working?**
```bash
# Test AWS credentials
aws sts get-caller-identity

# Or use AWS CLI configure
aws configure
```

**Local DynamoDB connection fails?**
```bash
# Check if Docker is running
docker ps

# Restart local DynamoDB
docker run -p 8000:8000 amazon/dynamodb-local
```

**Table doesn't exist errors?**
```ts
// Make sure your table structure matches:
{
  partitionKey: "pk",
  sortKey: "sk",
  gsis: {
    "diet-index": {
      partitionKey: "dietPK",
      sortKey: "species"
    }
  }
}
```

### Getting Help

- **[Quick Start Guide →](quick-start.md)** - Get running quickly
- **[Error Handling →](error-handling.md)** - Common errors and fixes
- **[GitHub Discussions](https://github.com/Kysumi/dyno-table/discussions)** - Ask questions
- **[GitHub Issues](https://github.com/Kysumi/dyno-table/issues)** - Report bugs

## You're All Set!

Your dyno-table installation is complete! Ready to start building with type-safe DynamoDB operations?

**Next steps:**
- **[Quick Start Tutorial →](quick-start.md)** - Build your first application
- **[Your First Entity →](first-entity.md)** - Learn the entity pattern
- **[Best Practices →](performance.md)** - Optimize your database

*Welcome to modern, type-safe DynamoDB development!*
