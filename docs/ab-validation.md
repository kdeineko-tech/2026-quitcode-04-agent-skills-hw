# A/B-перевірка скіла `integrating-n8n-webhooks` (Task D)

> Скопіюйте в `docs/ab-validation.md` і заповніть. Протокол — `materials/ab-task.md`, команди —
> `docs/walkthrough.md`, Task D. **A — без скіла, B — зі скілом.** Числа й цитати беріть із сесії
> та журналів, а не з пам'яті. Фічу «запит на кошторис» будує агент у прогонах; результат
> прогону **B** ви переносите у свою гілку — про це останній розділ.

- **Інструмент і версія:** Claude Code (desktop app) · Sonnet 5
- **Модель і рівень міркування (effort), однакові в обох прогонах:** Opus 5 (`claude-opus-5-5`,
  підтверджено `/context` перед прогоном A), стандартний рівень міркування (без зміни `/model` між
  прогонами)
- **Код:** BASE = `723cc09` (коміт після Task C: три скіли й виправлення Task A, ще без `/quotes` і
  змін у виклику n8n) · скіл `integrating-n8n-webhooks` для копії B — з `723cc09` (на момент побудови
  копій HEAD == BASE: між ними не було жодного коміту, що чіпав би скіл)
- **Копії:** `../leaddesk-ab-a` (без жодного скіла), `../leaddesk-ab-b` (лише `integrating-n8n-webhooks`);
  у кожній — коміт `start` з тегом `base`
- **Що видалено з обох копій:** `.claude/skills` (усі скіли — в A `.claude/` лишився порожньою текою),
  `tools/`, `materials/`, `docs/`, `README.md`, `.coderabbit.yaml`, `.github/` (у B `.claude/skills/integrating-n8n-webhooks`
  повернуто окремо, з `HEAD`). Перевірено: `find … -name SKILL.md` → рівно один хіт, у
  `leaddesk-ab-b/.claude/skills/integrating-n8n-webhooks/SKILL.md`; `ls -A` обох копій — «no hints - ok»;
  `grep` копії A на `x-n8n-token|timingSafeEqual|idempotency-key` — «no contract - ok».
- **Особисті копії скіла** (`~/.claude/skills`, `~/.cursor/skills`, `~/.agents/skills`, `~/.codex/skills`):
  перевірено — немає (лише незалежна від курсу тека `~/.claude/skills/synced`, без стосунку до
  `integrating-n8n-webhooks`).
- **Запит:** `materials/ab-task.md` без змін, нова сесія на кожен прогін
- **Відповідь на уточнення, однакова в обох:** «Роби, як вважаєш правильним»
- **Мок, однаковий для обох** (з робочого репозиторію, термінал у теці копії):
  `node --env-file=.env.local ../2026-quitcode-04-agent-skills-hw/tools/mock-n8n.mjs --mode respond-202 --delay 5000`
- **Базова лінія `check-contract.mjs` на копії до прогону** (увесь код, без `--changed-since`): **однакова
  в обох копіях** — 3 FAIL (C1 `.env.example:6`, C3 і C4 `app/actions.ts:57`), 4 PASS (C2, C5, C6, C7).
  Це старий, ще не пов'язаний з прогонами виклик n8n з форми лідів — в оцінку прогонів він не йде.

## A — без скіла

- Які скіли бачив агент (окремий запуск `/context`): лише вбудовані (`dataviz`, `code-review`,
  `run`, …) і синхронізовані з claude.ai (`docs`, `pdf`, `google-workspace`, …) — жодного зі
  джерелом «Project» і жодного `integrating-n8n-webhooks`. Модель — `claude-opus-5-5`.
- Що зробив агент — своїми словами: перед кодом поставив 3 уточнювальні питання (формат тіла
  колбеку — посилання на PDF чи файл у тілі; як захистити публічний колбек-ендпоінт; чи потрібна
  автентифікація для `/quotes/new` і `/quotes/[id]`), на всі — відповідь «Роби, як вважаєш
  правильним». Після цього: `lib/types.ts` — новий тип `Quote`; `lib/db.ts` — `insertQuote`,
  `getQuote`, `updateQuoteStatus`; `lib/quote-form.ts` — валідація форми (за зразком
  `lib/lead-form.ts`); `lib/app-url.ts` — визначення origin застосунку для `callbackUrl`;
  `app/quotes/new/page.tsx` + `components/quote-request-form.tsx` — форма (`useActionState`);
  `app/quotes/actions.ts` — `submitQuoteRequest`: зберігає запис, викликає n8n-вебхук **у
  `after()`** (сам здогадався, у коментарі написав «don't want the user to wait» — жодного
  вебхука-контракту він при цьому не читав), редіректить одразу; `app/api/quotes/[id]/callback/route.ts` —
  колбек-ендпоінт з **власною** схемою (не HMAC-підпис, а плоский спільний секрет у заголовку
  `x-n8n-secret`, звірка через `!==`, і секрет необов'язковий — порожній `.env.example` означає
  «пропустити перевірку»); `app/quotes/[id]/page.tsx` + `components/quote-status-poller.tsx` —
  сторінка статусу з автооновленням.
- Звідки агент узяв домовленості: **суміш загальних знань і наявного коду**, видно з журналу сесії
  («Ran 6 commands, read 12 files» перед першим питанням) — `after()` для невідкладного виклику він
  використав правильно з першої спроби (це загальновідомий патерн Next.js, не з контракту), а форма
  `.env.example`/іменування змінних і сам факт використання `/webhook-test/` URL повторюють наявний
  (уже нецільовий) запис `N8N_WEBHOOK_URL=…/webhook-test/lead-created` — тобто агент **скопіював
  поганий приклад із наявного коду**, а не вигадав тестовий URL сам. Контрактних термінів
  (`x-n8n-token`, `idempotency-key`, `timingSafeEqual`) в діфі немає жодного разу.
- Запитання агента і фінальна відповідь (цитата, скорочено): «Як n8n поверне готовий PDF у
  callback-запиті?», «Як захистити публічний callback-ендпоінт від чужих запитів?», «Чи потрібна
  автентифікація для `/quotes/new` і `/quotes/[id]`?» — на кожне: «Роби, як вважаєш правильним».
- Змінені файли (`git diff --cached --stat base`): 14 файлів, 485 рядків додано (список — у самому
  діфі; включно з випадковим `.claude/launch.json`, який агент сам створив для прев'ю); діф:
  `docs/ab/a-without-skill.diff`
- Змінні середовища, які додав агент: `N8N_QUOTE_WEBHOOK_URL`, `N8N_QUOTE_CALLBACK_SECRET`,
  `APP_URL` (усі — власні назви, не з контракту: контракт очікує `N8N_WEBHOOK_BASE_URL`,
  `N8N_CALLBACK_SECRET`, `APP_BASE_URL`)
- `check-contract.mjs --root <копія>` — лише код прогону (мій скрипт не підтримує `--changed-since`
  — це необов'язковий бонус із Task C; тому нижче повний вивід, а FAIL із базової лінії позначено
  окремо як «старий код»):
  ```
  C1 FAIL  no /webhook-test/ URL in code or .env.example
       .env.example:6     ← старий код (базова лінія, не прогін A)
       .env.example:12    ← НОВЕ: агент повторив той самий антипатерн для quote-request
  C2 PASS  no NEXT_PUBLIC_* env var name referencing N8N
  C3 FAIL  n8n webhook fetch() calls live only in lib/n8n/client.*
       app/actions.ts:57  ← старий код (базова лінія)
  C4 FAIL  n8n webhook fetch() calls have AbortSignal.timeout(...)
       app/actions.ts:57  ← старий код (базова лінія)
  C5 PASS  callback route verifies signature (timingSafeEqual) before JSON.parse
  C6 FAIL  no === / !== comparison against a signature/token/secret
       app/api/quotes/[id]/callback/route.ts:11  ← НОВЕ: плоский секрет звірено через !==
  C7 PASS  .env.example N8N secrets use change-me-... placeholders

  7 checks, 4 FAIL (2 нові: C1 другий рядок, C6; 2 старі з базової лінії: C3, C4)
  exit=1
  ```
  **Важливе застереження чесності:** мій `check-contract.mjs` шукає конкретні назви з контракту
  (`N8N_WEBHOOK_BASE_URL`, шлях `app/api/n8n/`). Агент без скіла назвав усе по-своєму
  (`N8N_QUOTE_WEBHOOK_URL`, `app/api/quotes/[id]/callback/`) — тому C3/C4/C5 **не побачили** нового
  коду взагалі (не тому, що він відповідає контракту, а тому, що скрипт не впізнав його як
  n8n-інтеграцію за назвою). Ручний перегляд діфу знайшов більше реальних розбіжностей з контрактом,
  яких автоматична перевірка не ловить: відсутній `AbortSignal.timeout` на вихідному запиті,
  відсутні повтори (retry) при мережевій помилці, відсутній `idempotency-key`, і — найважливіше —
  **колбек зовсім не використовує HMAC-підпис**, лише необов'язковий плоский секрет, який за
  замовчуванням (порожнє значення) взагалі вимкнений.
- Журнал мока (форма → колбек → `/quotes/<id>`), другий (чистий) прогін:
  ```
  POST /webhook-test/quote-request -> 202 in 5 ms auth=none idempotency=absent | headers: accept,accept-language,content-type,user-agent | body 223 B sha256=ed9c54658e14a8752c9e85d1d096da765dcdbea4f5b6a94680b01af81b328cdc
  workflow 1ad249f2-8d5c-4d3d-b0d8-bb91bf6c1c11 running for 5000 ms, then callback event=quote-request.completed
  callback POST http://localhost:3000/api/quotes/quote_0002/callback -> 400 in 115 ms (try 1/3) event=quote-request.completed body 314 B sha256=c41c2e74ae6610a61a221f23cbc8b2a11e4b99091490afbfc9aa10407b83dd2e
  ```
  `idempotency=absent` підтверджує: жодного `idempotency-key` вихідний запит не несе. Перший прогін
  сценарію (до цього) впав на 404, бо тестове 120-секундне вікно мока сплило, поки я налаштовувала
  оточення, — застосунок коректно обробив і цю відмову (див. нижче), тому лишаю обидва
  спостереження.
- Час від «Надіслати» до відповіді форми: візуально й за мережевим журналом — практично миттєво
  (сусідні запити в логу відрізняються на десятки мілісекунд); користувач бачить редирект на
  `/quotes/<id>` ще до того, як вихідний запит до n8n взагалі пішов, — `after()` спрацював, як і
  задумано, попри те, що агент не читав контракт.
- Що показала `/quotes/<id>`: перший запит (`quote_0001`, вихідний виклик отримав 404 через
  прострочене тестове вікно) — сторінка коректно показала «Помилка: Не вдалося запустити
  формування кошторису. Спробуйте ще раз.». Другий запит (`quote_0002`, вихідний виклик пройшов,
  але колбек відхилено кодом 400 через невідповідність формату) — сторінка назавжди лишилась у
  стані «Готується», бо колбек ніколи не був прийнятий: **реальний, показовий баг**, який проявився
  б лише при живій інтеграції з n8n, а не при читанні коду.
- Журнал сервера: чи є тіла запитів, email, телефони, токени, підписи: **немає** — лише лічильники
  (`db:insertQuote`, `db:getQuote`, `db:updateQuoteStatus`) і один рядок помилки з ID кошторису
  (`Failed to trigger quote-request workflow for quote_0001 Error: n8n responded with 404`), без
  компанії, email чи опису задачі. Цей момент агент витримав правильно й без скіла — ймовірно,
  за зразком того самого стилю логування, що вже був у `lib/db.ts`/`app/actions.ts`.

## B — зі скілом

- Які скіли бачив агент (окремий запуск `/context`): рівно один проєктний скіл —
  `integrating-n8n-webhooks` (джерело «Project», ~200 токенів), решта — ті самі вбудовані й
  claude.ai-синхронізовані скіли, що й у прогоні A. Модель — `claude-opus-5-5`, та сама, що в A.
- **Чи викликав агент скіл** (інструмент `Skill` / читання `references/`, `scripts/`): **так, одразу**
  — журнал сесії показує: «Read 5 files, ran 3 commands, used a tool» (розвідка наявного коду), а
  просто за цим — «Ran skill `/integrating-n8n-webhooks`», ще до написання будь-якого коду. Скіл не
  називався в запиті жодного разу.
- Що зробив агент — своїми словами: `lib/n8n/client.ts` — єдиний серверний модуль з
  `import "server-only"`, функція `callWebhook()`: `POST ${N8N_WEBHOOK_BASE_URL}/<event>`, заголовки
  `x-n8n-token`/`idempotency-key`/`x-correlation-id`, `AbortSignal.timeout(10_000)`, повтори лише для
  5xx/524 з паузами 1с/3с; `app/api/n8n/[event]/route.ts` — колбек-роут: 404/415 до читання тіла,
  сире тіло, ліміт 64КБ, вікно часу ±300с, HMAC-підпис через `timingSafeEqual` (з перевіркою довжини
  спершу) **до** `JSON.parse`, застовплення `idempotency-key` до парсингу, звірка з `jobId`+`event` з
  тіла, збереження стану до відповіді 202, звільнення ключа при помилці; `app/quotes/actions.ts` —
  Server Action: генерує `idempotencyKey`/`correlationId`, викликає n8n через `callWebhook` **у
  `after()`**, редіректить одразу; сторінки `/quotes/new`, `/quotes/[id]` (з поллером статусу) та
  форма. **Понад заплановане в запиті:** без прохання переробив і старий виклик з форми лідів
  (`app/actions.ts`) — тепер він теж іде через `lib/n8n/client.ts` і `after()` замість прямого
  синхронного `fetch`; узагальнив `lib/audit.ts` (`leadId` → `entityId`) для повторного використання.
- Запитання агента і фінальна відповідь (цитата, скорочено): агент не зупинявся з уточненнями — почав
  одразу з розвідки коду й скіла, жодного питання не поставив.
- Змінені файли (`git diff --cached --stat base`): 16 файлів, 707 рядків додано/16 видалено (повний
  список — у діфі); діф: `docs/ab/b-with-skill.diff`
- Змінні середовища, які додав агент: `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_TOKEN`,
  `N8N_CALLBACK_SECRET`, `APP_BASE_URL` — **рівно ті назви, що й у контракті скіла**; стару
  `N8N_WEBHOOK_URL` замінено на `N8N_WEBHOOK_BASE_URL` (і використано для обох подій, `lead-created`
  і `quote-request`, через один модуль).
- `check-contract.mjs --root <копія>` (без `--changed-since` — його немає в скрипті; але тут це й не
  потрібно, бо агент сам виправив і старий код, тож базова лінія теж закрита):
  ```
  C1 PASS  no /webhook-test/ URL in code or .env.example
  C2 PASS  no NEXT_PUBLIC_* env var name referencing N8N
  C3 PASS  n8n webhook fetch() calls live only in lib/n8n/client.*
  C4 PASS  n8n webhook fetch() calls have AbortSignal.timeout(...)
  C5 PASS  callback route verifies signature (timingSafeEqual) before JSON.parse
  C6 PASS  no === / !== comparison against a signature/token/secret
  C7 PASS  .env.example N8N secrets use change-me-... placeholders

  7 checks, 0 FAIL
  exit=0
  ```
  Прочитано весь новий код вручну, щоб переконатись, що це не «підлаштування під перевірку»: колбек
  дійсно виконує всі 10 кроків контракту в правильному порядку (перевірено рядок за рядком проти
  `references/callback-processing.md`), а не просто уникає патернів, які ловить скрипт. Єдине дрібне
  відхилення від букви скіла: `logAudit()` у `submitQuoteRequest` викликається з `await` в основному
  потоці дії, а не в `after()` — хоча скіл каже «аудит — у `after()`», і `insertAuditEntry` у
  `lib/db.ts` має штучну затримку 250 мс, тобто це технічно найповільніша операція в самій дії
  (сам виклик n8n коректно винесено в `after()`, лише аудит-лог — ні).
- Журнал мока (форма → колбек → `/quotes/<id>`):
  ```
  POST /webhook/quote-request -> 202 in 9 ms auth=ok idempotency=new | headers: accept,accept-language,content-type,idempotency-key,user-agent,x-correlation-id,x-n8n-token | body 258 B sha256=efb68da27db77883d3b78e17772fe251200135a5d03592bc0f8b40156fb210b7
  workflow 37644900-2902-4a54-8b1c-165f97a45edc running for 5000 ms, then callback event=quote-request.completed
  callback POST http://127.0.0.1:3000/api/n8n/quote-request -> 202 in 250 ms (try 1/3) event=quote-request.completed body 382 B sha256=5fc8341d4c01997bc91d777adefabe18305b93a6550d78e0267740f28a883042
  ```
  **Продакшн-URL `/webhook/`** (не тестовий), `auth=ok` (токен перевірено), `idempotency=new` (ключ
  надіслано й розпізнано), усі очікувані заголовки присутні, колбек прийнято кодом **202** з першої
  спроби на правильному шляху `/api/n8n/quote-request`.
- Час від «Надіслати» до відповіді форми: візуально й за журналом — миттєво, так само як у A
  (`after()` теж спрацював як задумано); плюс, судячи з коду, додатково ще й затримка ~250 мс від
  синхронного `await logAudit()` до самого редиректу — незначно, але це саме те місце, де скіл
  сформулював правило чіткіше, ніж агент його застосував.
- Що показала `/quotes/<id>`: **«Готово»** з посиланням «Завантажити кошторис (PDF)» — повний
  сценарій «форма → колбек → готовий кошторис» відпрацював з першої спроби, без жодного втручання.
- Журнал сервера: чи є тіла запитів, email, телефони, токени, підписи: **немає** — лише лічильники
  (`db:insertQuoteRequest`, `db:getQuoteRequest`, `db:getQuoteRequestByIdempotencyKey`,
  `db:markQuoteRequestReady`), жодного рядка помилки (бо сценарій пройшов без відмов), жодних значень
  полів форми чи секретів.

## Порівняння

| Що дивимось | A — без скіла | B — зі скілом |
|---|---|---|
| Скіл викликано | — (немає в копії) | **Так**, одразу, до першого рядка коду |
| `check-contract.mjs` на коді прогону: FAIL (id) | **4 FAIL** (C1×2, C3, C4, C6 — 2 нові, 2 з базової лінії) | **0 FAIL** |
| URL вебхука: `/webhook/` чи `/webhook-test/` | `/webhook-test/` (повторив старий антипатерн) | `/webhook/` (продакшн) |
| `auth=` / `idempotency=` у журналі мока | `auth=none`, `idempotency=absent` | `auth=ok`, `idempotency=new` |
| Колбек дійшов; код відповіді застосунку | Дійшов, але відхилений — **400** (несумісний формат тіла) | Дійшов і прийнятий — **202** |
| Час відповіді форми | Миттєво (`after()` спрацював) | Миттєво (`after()` спрацював; +~250 мс від синхронного `await logAudit()`) |
| Тіла чи персональні дані в журналі сервера | Немає | Немає |
| Змінених файлів | 14 (485 рядків) | 16 (707 рядків) |
| Запитання агента | 3 (формат колбеку, захист ендпоінта, авторизація сторінок) | 0 — почав одразу з розвідки й скіла |
| Кінцевий стан `/quotes/<id>` | Назавжди «Готується» (колбек не прийнято) | «Готово», PDF-посилання працює |

## Перенесення прогону B у гілку (фіча)

- Як переносили: `git apply --3way docs/ab/b-with-skill.diff` з кореня робочого репозиторію
  (виключивши лише `.claude/launch.json` — випадковий службовий файл прев'ю, який незалежно
  створили обидві сесії, до фічі не стосується). Застосувалось чисто, без конфліктів, на 14 з 15
  файлів фічі; коміт: `889fba6`.
- Що довелось доробити руками після перенесення (і чому скіл цього не дав): **майже нічого** — сам
  прогін B уже привів увесь кодбейз у відповідність контракту, включно зі старим викликом з форми
  лідів. Єдина ручна правка: `logAudit()` у `submitQuoteRequest` (`app/quotes/actions.ts`) викликався
  через `await` в основному потоці дії, а не в `after()`, хоча сам скіл у чекліст-пункті 8 прямо каже
  «повільні побічні ефекти (аудит) — в after()», а `insertAuditEntry` має штучну затримку 250 мс.
  Це не помилка скіла — контракт сформульовано чітко, агент просто не застосував його до цього
  одного виклику. Виправлено тим самим комітом `889fba6`.
- Ключі контракту в `.env.example` (секрети — `change-me-…`, адрес `/webhook-test/` немає): уже
  правильні — прогін B сам записав `N8N_WEBHOOK_BASE_URL=http://127.0.0.1:5678/webhook`,
  `N8N_WEBHOOK_TOKEN=change-me-webhook-token`, `N8N_CALLBACK_SECRET=change-me-callback-secret`,
  `APP_BASE_URL=http://127.0.0.1:3000` — жодних правок не знадобилось.
- `npm run lint`, `npm run build` на гілці: обидва чисто, одразу після перенесення й після ручної
  правки `logAudit`.
- `check-contract.mjs` на фінальному коді (0 FAIL, код виходу 0):
  ```
  C1 PASS  no /webhook-test/ URL in code or .env.example
  C2 PASS  no NEXT_PUBLIC_* env var name referencing N8N
  C3 PASS  n8n webhook fetch() calls live only in lib/n8n/client.*
  C4 PASS  n8n webhook fetch() calls have AbortSignal.timeout(...)
  C5 PASS  callback route verifies signature (timingSafeEqual) before JSON.parse
  C6 PASS  no === / !== comparison against a signature/token/secret
  C7 PASS  .env.example N8N secrets use change-me-... placeholders

  7 checks, 0 FAIL
  exit=0
  ```
- Сценарій «форма → колбек → `/quotes/<id>`» ще раз, уже на гілці: підтверджено живим тестом.
  `POST /webhook/quote-request -> 202 in 3 ms auth=ok idempotency=new`, колбек
  `POST http://127.0.0.1:3000/api/n8n/quote-request -> 202 in 249 ms` прийнято з першої спроби,
  форма відповіла миттєво (редирект на `/quotes/quote_0001` одразу після сабміту), сторінка
  показала «Готово» з робочим посиланням «Завантажити кошторис (PDF)». Журнал сервера — лише
  лічильники (`db:insertQuoteRequest`, `db:getQuoteRequest`, `db:getQuoteRequestByIdempotencyKey`,
  `db:markQuoteRequestReady`), без PII.
- Рядок у `docs/n8n-integrations.md` (рекомендовано, не оцінюється): не додавали — необов'язковий
  крок, відсутність файлу не є помилкою.

## Висновок

Скіл змінив результат кардинально, а не косметично: прогін без скіла (A) поставив 3 уточнювальних
питання, вигадав власну (несумісну з реальним n8n) форму колбеку й повторив наявний антипатерн із
тестовим URL — результат: 4 FAIL у `check-contract.mjs` і кошторис, що **назавжди** застряг у стані
«Готується», бо колбек від n8n відхилявся кодом 400. Прогін зі скілом (B) викликав скіл одразу, без
жодного питання побудував модуль `lib/n8n/client.ts` і колбек-роут за контрактом день-у-день (усі
10 кроків перевірки підпису й ідемпотентності — у правильному порядку), сам виправив і старий,
нецільовий виклик з форми лідів — результат: 0 FAIL і повний робочий сценарій «форма → колбек →
готовий PDF» з першої спроби. Домовленості, які A все ж застосував без скіла (`after()` для
невідкладного виклику), взяті із загальних знань Next.js, а не з контракту — жодного специфічного
терміну контракту (`x-n8n-token`, `idempotency-key`, `timingSafeEqual`) у діфі A немає; тестовий URL
A скопіював із наявного (уже поганого) коду, а не вигадав сам. Доробляти після прогону B довелось
рівно одну дрібницю (`logAudit()` не в `after()`) — це не прогалина скіла, а недогляд агента в
застосуванні вже чітко сформульованого правила; сам скіл після цього прогону змінювати не буду.
