# API reference (all paths prefixed with `/api`)

All routes except `/health`, `/config`, `/public` and the auth routes require `Authorization: Bearer <token>`.

## Auth & session
`POST /auth/register` · `POST /auth/login` · `POST /auth/admin/login` · `POST /auth/logout` · `POST /auth/forgot-password` · `POST /auth/reset-password` · `POST /auth/verify-email` · `POST /auth/resend-verification` · `POST /auth/change-password` · `POST /auth/google` (only when configured) · `POST /auth/session` (Firebase profile sync) · `GET /auth/dev/outbox` (dev only)
`GET /me` · `PATCH /profile` · `POST /profile/avatar` · `POST /profile/delete-request` · `POST /profile/self-exclude` · `POST /uploads`

## Player
`GET /public` · `GET /tournaments` · `GET /tournaments/:id` · `POST /tournaments/:id/join` · `POST /registrations/:id/cancel`
`GET /my/matches` · `GET /my/results` · `GET /my/wins` · `GET /leaderboard?period=daily|weekly|monthly|all`
`GET /wallet` · `GET /wallet/transactions` · `POST /deposits` · `GET /deposits` · `POST /withdrawals` · `GET /withdrawals`
`GET /notifications` · `POST /notifications/read` · `GET /events` (SSE in local mode)
`GET /support/tickets` · `POST /support/tickets` · `GET /support/tickets/:id` · `POST /support/tickets/:id/reply`

## Admin (role-verified + audit logged)
`GET /admin/overview` · `GET /admin/users?q=` · `GET /admin/users/:id` · `POST /admin/users/:id/suspend` · `POST /admin/adjustments` · `GET /admin/transactions`
`GET|POST /admin/tournaments` · `PATCH|DELETE /admin/tournaments/:id` · `GET /admin/tournaments/:id/registrations` · `POST /admin/tournaments/:id/room` · `POST /admin/tournaments/:id/results`
`GET /admin/deposits` · `POST /admin/deposits/:id/review` · `GET /admin/withdrawals` · `POST /admin/withdrawals/:id/review`
`GET /admin/tickets` · `GET /admin/tickets/:id` · `POST /admin/tickets/:id/reply` · `POST /admin/tickets/:id/status`
`GET|PUT /admin/settings` · `GET|POST|PATCH|DELETE /admin/banners` · `GET|POST|DELETE /admin/announcements` · `POST /admin/notifications/broadcast` · `GET /admin/logs`

Money is always integer paise (₹1 = 100). Errors return `{ "error": "message" }` with an appropriate HTTP status.
