# Налаштування на боці n8n (словами — не експортуємо/імпортуємо JSON)

Воркфлоу клієнта — його власність; ми не будуємо й не змінюємо воркфлоу в редакторі, не
експортуємо й не імпортуємо JSON. Це опис для людини, яка робить це руками в n8n.

1. **Webhook**: HTTP Method `POST`, Path — назва події (`quote-request`). Authentication —
   **Header Auth**, credential з Name `x-n8n-token`, Value = `N8N_WEBHOOK_TOKEN`. Неправильний чи
   відсутній заголовок n8n відхиляє з **403** «Authorization data is wrong!» (не 401 — це для Basic
   Auth/JWT). Respond — `Using 'Respond to Webhook' Node` (для швидких подій — `Immediately`). Якщо
   в застосунку фіксовані IP — Options → IP(s) Allowlist (за reverse proxy — `N8N_PROXY_HOPS`).
   Вхідні дані в наступних вузлах — `$json.body`, заголовки — `$json.headers` (у нижньому регістрі).
2. **Remove Duplicates**: «Remove Items Processed in Previous Executions», значення —
   `{{ $json.headers['idempotency-key'] }}`.
3. **Respond to Webhook**: Respond With JSON, Response Code `202`, тіло
   `{"job_id": "{{ $execution.id }}"}`.
4. … робота воркфлоу (генерація документа тощо) …
5. **Edit Fields**: поле `ts` = `{{ Math.floor($now.toSeconds()) }}`, поле `body` =
   `{{ JSON.stringify({ version: 1, event: 'quote-request.completed', data: { jobId: $execution.id, ... } }) }}`.
   Підписуємо й відправляємо **одним і тим самим рядком**.
6. **Crypto** (v2): Action `Hmac`, Type `SHA256`, Encoding `HEX`, значення
   `{{ $json.ts + '.' + $json.body }}`, credential **Crypto** з Hmac Secret = `N8N_CALLBACK_SECRET`.
7. **HTTP Request**: `POST` на `callbackUrl` із запиту
   (`{{ $('Webhook').item.json.body.callbackUrl }}`). Заголовки: `x-n8n-timestamp`,
   `x-n8n-signature` (`sha256=` + результат Crypto), `idempotency-key`
   (`{{ $execution.id }}:quote-request.completed`), `x-correlation-id` (з вхідних заголовків). Body
   Content Type — **Raw**, `application/json`, Body — поле `body` (не «JSON → Using Fields Below» —
   документація n8n не гарантує байт-у-байт ту саму серіалізацію, що ми підписали). Options →
   Timeout `10000`. Settings → Retry On Fail, Max Tries `3`, Wait Between Tries `1000`. Якщо n8n у
   Docker, а застосунок на хості — `host.docker.internal`, не `localhost`.
8. **Save** і **Publish**. Після кожної зміни — Publish знову.
