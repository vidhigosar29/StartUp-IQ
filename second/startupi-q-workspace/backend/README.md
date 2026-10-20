# StartupIQ Workspace API

Express + MongoDB backend starter.

## MongoDB Atlas setup
1. Create a MongoDB Atlas cluster and database user.
2. In Network Access, allow your current IP address for development.
3. Copy the Node.js connection URI.
4. Copy `.env.example` to `.env` and replace the URI placeholders.
5. Never commit `.env` or paste the URI into frontend code.

## Run
From the `backend` folder:

```bash
npm install
npm run dev
```

The API starts at `http://localhost:5000` after MongoDB connects. Test `GET http://localhost:5000/api/health`.

## Routes
- `POST /api/workspaces` body: `{ "businessName": "Cherry Bae", "businessType": "jewellery" }`
- `GET /api/workspaces/:workspaceId`
- `PATCH /api/workspaces/:workspaceId`
- `DELETE /api/workspaces/:workspaceId` (prototype reset; deletes associated records too)
- `GET /api/workspaces/:workspaceId/records?type=sales`
- `POST /api/workspaces/:workspaceId/records` body: `{ "type": "sales", "name": "Order #1", "amount": 1250, "quantity": 1, "status": "Paid" }`
- `PATCH /api/workspaces/:workspaceId/records/:recordId`
- `DELETE /api/workspaces/:workspaceId/records/:recordId`

Record types: `products`, `inventory`, `sales`, `expenses`, `customers`, `experiments`.

## Security note
No authentication is included because this is the local prototype. Keep it local. Workspace IDs are identifiers, not access control. Add authentication/authorization and enforce ownership on all routes before public deployment.
