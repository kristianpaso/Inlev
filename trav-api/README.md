# Trav API

Backend for the Trav application. The frontend is published by Netlify from
`public/trav` and calls this API on Render.

## Local development

1. Copy `.env.example` to `.env`.
2. Set `MONGODB_URI` if MongoDB is not running locally.
3. Run `npm install` and then `npm start`.

The local API is available at `http://localhost:4000/api/trav`.

## Render

Configure the existing Render web service with:

- Root Directory: `trav-api`
- Build Command: `npm ci`
- Start Command: `npm start`
- Environment variable: `MONGODB_URI`

The frontend currently uses `https://trav-api.onrender.com/api/trav` in
production.
