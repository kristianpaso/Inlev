# rotation-api

Simple Express API for managing **Departments** and **Persons**.

## Run locally

```bash
cd rotation-api
npm install
npm run start
# API on http://localhost:5050
```

## Environment variables

- `PORT` (default 5050)
- `CORS_ORIGINS` comma-separated list. Example:
  - `http://localhost:8888,https://sage-vacherin-aa5cd3.netlify.app`
- `DB_PATH` optional path to JSON file.

## Endpoints

- `GET /api/health`
- `GET /api/departments`
- `POST /api/departments` body: `{ "name": "Pålastning" }`
- `GET /api/persons`
- `POST /api/persons` body: `{ "name": "Kristian", "departmentIds": ["..."] }`
- `PUT /api/persons/:id` body: `{ "name": "...", "departmentIds": [...] }`
- `GET /api/persons-expanded`

## Deploy to Render

- Create a new **Web Service**
- Root directory: `rotation-api`
- Build command: `npm install`
- Start command: `npm start`
- Add env var `CORS_ORIGINS`:
  - `https://sage-vacherin-aa5cd3.netlify.app,http://localhost:8888`

> Note: This demo uses a JSON file DB. On Render, file storage may reset on redeploy. If you want persistence, switch to MongoDB/Postgres.


## MongoDB

Create a `.env` file in `rotation-api/`:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@pasocluster.y7nqhop.mongodb.net/rotation-api?retryWrites=true&w=majority&appName=PasoCluster
PORT=5050
CORS_ORIGINS=http://localhost:8888,https://sage-vacherin-aa5cd3.netlify.app
```

Then:

```bash
npm install
npm start
```
