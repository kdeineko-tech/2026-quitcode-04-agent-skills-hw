# Контракт: змінні, виклик n8n, хто викликає

## Змінні середовища (усі лише серверні — без префікса `NEXT_PUBLIC_`)

| Змінна | Що це | Локальне значення |
|---|---|---|
| `N8N_WEBHOOK_BASE_URL` | База production-URL, закінчується на `/webhook` | `http://127.0.0.1:5678/webhook` |
| `N8N_WEBHOOK_TOKEN` | Значення заголовка `x-n8n-token` (Header Auth credential в n8n) | `change-me-webhook-token` |
| `N8N_CALLBACK_SECRET` | HMAC-секрет для колбеків (Hmac Secret у Crypto credential) | `change-me-callback-secret` |
| `APP_BASE_URL` | Адреса застосунку, за якою n8n бачить колбек | `http://127.0.0.1:3000` |

Справжні значення — лише в `.env.local` і в налаштуваннях хостингу. У `.env.example` — тільки
`change-me-…` для секретів і локальні адреси з `/webhook` (ніколи `/webhook-test/`). Секрет
генерується, не вигадується: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Секрет ніколи не йде в query string, Client Component чи журнал.

## Виклик n8n (Next.js → n8n)

Один модуль, наприклад `lib/n8n/client.ts`, перший рядок — `import 'server-only'`. Жодних прямих
`fetch` до n8n поза цим модулем.

`POST ${N8N_WEBHOOK_BASE_URL}/<path>`, `<path>` — kebab-case назва події (`lead-created`,
`quote-request`). Один шлях = один вебхук у n8n.

| Заголовок | Значення |
|---|---|
| `content-type` | `application/json` |
| `x-n8n-token` | `N8N_WEBHOOK_TOKEN` |
| `idempotency-key` | UUID, створений один раз на бізнес-операцію й збережений разом із записом; при повторі — той самий |
| `x-correlation-id` | UUID ланцюжка дій; той самий пишемо в журнали обох систем |

Тіло — конверт:
```json
{ "version": 1, "event": "quote-request", "data": { "quoteId": "q_0042" }, "callbackUrl": "https://app.example.test/api/n8n/quote-request" }
```
`data` — мінімум, потрібний воркфлоу (не весь запис з бази: без IP, user agent, внутрішніх нотаток).
`callbackUrl` — лише для асинхронних воркфлоу.

**Таймаут:** кожна спроба — `fetch(url, { signal: AbortSignal.timeout(10_000) })`.

**Повтори:** максимум 2 (3 спроби разом), пауза 1с потім 3с, лише для мережевої помилки, таймауту,
5xx і 524 — завжди з тим самим `idempotency-key`. 4xx не повторюємо (403 — неправильний токен,
404 — неопублікований чи тестовий URL: виправляти, не повторювати).

**Відповідь n8n:** дивимось лише на код статусу, текст повідомлення не парсимо (n8n документація і
код n8n самі не збігаються в формулюванні).

## Хто викликає

- UI-дія → Server Action: сесія/права/валідація всередині (`server-auth-actions`). Дія зберігає
  запис (напр. статус `queued`), повертає лише `{ status, id }`; виклик n8n (з повторами) — в
  `after()` (`server-after-nonblocking`) — і не лише заради швидкості: Server Actions одного клієнта
  виконуються по одній, довге очікування блокує наступну дію того ж користувача.
- Не-React клієнт (інший сервіс, cron) → Route Handler.
- Ніколи `export const runtime = 'edge'` — потрібен `node:crypto`.
