
# Entity Example - dyno-table with DynamoDB

This example demonstrates how to use dyno-table with DynamoDB to create, query, and manage entities using TypeScript and Zod for schema validation.

## Overview

This example implements a simple dinosaur management system using dyno-table with the following features:
- Entity definition with Zod schemas
- Type-safe CRUD operations
- Query and scan operations with filters
- Data validation
- Local DynamoDB integration

## Prerequisites

- Node.js (v16 or higher)
- pnpm package manager
- Docker and Docker Compose

## Setup and Running

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Start Local DynamoDB**

   Start the local DynamoDB and DynamoDB Admin interface using Docker Compose:
   ```bash
   pnpm docker
   ```

   This will start:
    - DynamoDB Local on port 8897
    - DynamoDB Admin GUI on port 8001

3. **Run the Application**
   ```bash
   pnpm start
   ```

## Available Services

### DynamoDB Local
- **URL**: http://localhost:8897
- **Description**: Local DynamoDB instance for development and testing

### DynamoDB Admin GUI
- **URL**: http://localhost:8001
- **Description**: Web-based GUI for browsing and managing DynamoDB data

## Development Scripts

- `pnpm start` - Run the example application
- `pnpm docker` - Start the Docker containers for DynamoDB Local and Admin GUI (required for the demo)

## Project Structure

The example demonstrates:
- Entity definition using Zod schemas (Valibot and ArkType are also supported)
- Constructing and building queries

