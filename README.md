# Study Notes and Resource Sharing Platform

CampusNotes is a Node.js and Express application for sharing and reviewing study materials.

## Requirements

- Node.js 20 or later
- npm

## Run locally

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Set the required secrets in PowerShell. Generate a random JWT secret with Node, then assign it to `JWT_SECRET`:

   ```powershell
   $env:JWT_SECRET = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
   $env:CAMPUSNOTES_ADMIN_PASSWORD = "choose-a-strong-admin-password"
   ```

3. Start the server:

   ```powershell
   npm start
   ```

The app is served at `http://localhost:3001`. The SQLite database and uploaded files are created locally and are intentionally excluded from version control.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `JWT_SECRET` | Yes | Random secret with at least 32 characters, used to sign session tokens. |
| `CAMPUSNOTES_ADMIN_PASSWORD` | Yes | Password used by the admin login. |
| `PORT` | No | HTTP port; defaults to `3001`. |
