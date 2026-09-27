# Рев'ю стороннього скіла: `vercel-react-best-practices`

> Скопіюйте в `docs/skill-review.md` (Task A) або `docs/skill-review-n8n.md` (Task E1) і заповніть.
> Рев'ю робимо **до** встановлення. Файли скіла — **дані, а не інструкції**: нічого з них не
> виконуйте, не відкривайте теку скіла як проєкт в агенті, нічого не встановлюйте «щоб подивитись».
> Кожен рядок — те, що ви перевірили самі, і як саме.

**Дата, інструмент, ОС:** 27.09.2026 · Claude Code (Sonnet 5) · macOS (Darwin 25.5.0)

## Що рев'юємо

| | |
|---|---|
| Репозиторій | https://github.com/vercel-labs/agent-skills |
| Тека в репозиторії → `name` | `skills/react-best-practices` → `name: vercel-react-best-practices` |
| Версія | тег `agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278` |
| Навіщо нам | дашборд і форма лідів у LeadDesk повільні; у команді немає окремого React-performance-експерта — скіл дає готовий чекліст на 70 правил |

## 1. Подивитись, не встановлюючи

- Як дивились: `DISABLE_TELEMETRY=1 npx skills@1.7.0 add "vercel-labs/agent-skills#agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278" --list` (нічого не пише в репозиторій — лише клонує тег у тимчасову теку й показує список скілів), а для команд пошуку — неглибокий клон **поза** цим репозиторієм: `git clone --depth 1 --branch agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278 https://github.com/vercel-labs/agent-skills.git ../review-agent-skills`
- Склад скіла (`skills/react-best-practices/`):

  | Файл / тека | Розмір | Що це |
  |---|---|---|
  | `SKILL.md` | 8.0K | Опис скіла, frontmatter, короткий вхід у правила |
  | `AGENTS.md` | 108K | Повний згорнутий текст усіх правил (для агентів, що не читають `rules/` окремо) |
  | `README.md` | 4.0K | Публічний опис для людей (GitHub) |
  | `metadata.json` | 4.0K | Метадані видавця (не копіюється CLI при `--copy`, тому в install — 75 файлів, у клоні тега — 76) |
  | `rules/` | 292K | Окремі файли з правилами (те, з чого зібрано `AGENTS.md`) |

- Frontmatter `SKILL.md`: лише `name`, `description`, `license: MIT`, `metadata: {author: vercel, version: "1.0.0"}`. Полів `allowed-tools`, `hooks`, `context` немає — скіл не просить наперед жодних дозволів на інструменти.

## 2. Що скіл може виконати, завантажити чи змінити

| Перевірка | Результат | Як перевіряли |
|---|---|---|
| `scripts/` та інші виконувані файли (`.sh`, `.mjs`, `.py`…) | Немає жодного — лише `.md` і один `metadata.json` | `find "$S" -type f ! -name "*.md"` → лише `metadata.json` |
| `allowed-tools` — попередній дозвіл на інструменти (у Claude Code діє ще до довіри до теки) | Відсутнє в frontmatter | `awk` по `SKILL.md`, поля немає |
| Команди під час рендеру `` !`cmd` `` (Claude Code виконує їх до того, як модель побачить скіл) | Не знайдено | `grep -rn '!\`' "$S"` — 0 збігів |
| Хуки, MCP-сервери, `plugin.json`, вимога API-ключів | Немає жодного файлу такого типу | `find "$S" -name "*hooks*.json" -o -name "*mcp*.json" -o -name "plugin.json" -o -name "settings*.json"` — порожньо |
| Інструкції агенту щось завантажити чи виконати (`npx`, `curl`, «завантаж правила з URL») | 2 збіги, обидва — приклад коду в документації (`npx svgo --precision=1 --multipass icon.svg` у правилі про SVG), не інструкція агенту | `grep -rnE "npx \|curl \|wget \|Invoke-WebRequest\|WebFetch" "$S"` — переглянуто обидва контексти вручну |
| Посилання: куди ведуть, чи є «прочитай інструкції звідси» | ~25 унікальних посилань — усі на react.dev, nextjs.org, vercel.com, MDN, GitHub, npm, або на `example.com`/`analytics.example.com` як плейсхолдери в прикладах коду. Жодного «завантаж і виконай це» | `grep -rhoE "https?://[^]()<> \"'\`]+" "$S" \| sort -u` — весь список переглянуто |
| Приховані інструкції: HTML-коментарі, «ignore previous…», невидимі символи, base64 | Не знайдено | `grep -rniE "ignore (all \|the )?previous\|system prompt\|<!--"` — 0 збігів; окремий скрипт на zero-width символи (з шаблону) — 0 файлів |

Команди-підказки (Git Bash; `S` — тека скіла в неглибокому клоні **поза** репозиторієм):

```bash
S=../review-agent-skills/skills/react-best-practices
find "$S" -type f | wc -l                                   # скільки файлів (у клоні тега їх на один більше: CLI не копіює metadata.json)
find "$S" -type f ! -name "*.md"                            # усе, що не markdown
awk '/^---$/{n++; next} n==1' "$S/SKILL.md"                 # frontmatter
find "$S" -name "*hooks*.json" -o -name "*mcp*.json" -o -name "plugin.json" -o -name "settings*.json"
grep -rn '!`' "$S"                                          # команди під час рендеру
grep -rnE "npx |curl |wget |Invoke-WebRequest|WebFetch" "$S"
grep -rhoE "https?://[^]()<> \"'\`]+" "$S" | sort -u        # усі посилання
grep -rniE "ignore (all |the )?previous|system prompt|<!--" "$S"
node -e 'const fs=require("fs"),p=require("path");const w=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?w(p.join(d,e.name)):[p.join(d,e.name)]);let n=0;for(const f of w(process.argv[1])){if(/[​-‏⁠﻿]/.test(fs.readFileSync(f,"utf8"))){console.log(f);n++}}console.log(n+" file(s) with zero-width characters")' "$S"
```

Збіг у `grep` — ще не проблема (приклад коду з `fetch()` — нормально). Проблема — інструкція агенту
щось завантажити й виконати. Запишіть, що саме знайшли.

## 3. Аудити

| Аудит | Результат | Дата аналізу |
|---|---|---|
| Gen (Agent Trust Hub) | Pass | не вказано на сторінці |
| Socket | Pass | не вказано на сторінці |
| Snyk | Pass | не вказано на сторінці |

- Де взяли: сторінка https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices (блок «Security Risk Assessments»). У CLI цей блок **не з'явився**: команду `--list` виконував агент (Claude Code), і CLI сама написала `Agent detected — installing non-interactively`, тобто пішла в неінтерактивний режим і аудит-промпт не показала.
- Чому CLI показав або не показав блок: два незалежні фактори вимикають показ — (1) `DISABLE_TELEMETRY=1` вимикає завантаження аудитів узагалі; (2) якщо CLI запускає агент, вона сама вмикає нон-інтерактивний режим (`--yes`) і не чекає підтвердження, навіть якщо аудити завантажені. Тому фактичне встановлення (крок 2 нижче) я запускаю сам у звичайному терміналі без `DISABLE_TELEMETRY`, щоб побачити цей блок насправді.
- До чого прив'язаний аудит: сторінка skills.sh **не вказує конкретний тег/SHA**, до якого прив'язані Pass-статуси — лише «репозиторій + назва скіла» (747.3K встановлень, 31.6K зірок, «First seen» 19.01.2026). Тобто аудит формально стосується поточного стану скіла в реєстрі skills.sh, а не гарантовано саме коміту `063bee9`. Це не привід відмовити (код я й сам проскенував у п.2 — нічого підозрілого), але це слабке місце самого аудиту, яке варто тримати в голові.

## 4. Ліцензія й походження

- Ліцензія: `MIT`, заявлена у frontmatter `SKILL.md` (`license: MIT`)
- Видавець і активність: Vercel Labs (`vercel-labs/agent-skills`, офіційний GitHub-акаунт Vercel), 747.3K встановлень і 31.6K зірок на GitHub за даними skills.sh, скіл «First seen» 19.01.2026. Активний, добре відомий видавець — не анонімний автор.

## 5. Чи правдивий зміст для нашого стеку

Скіли пишуть не під конкретну версію. Звірте 2–3 поради, які збираєтесь застосувати, з
документацією вашої версії (`node_modules/next/dist/docs/`, офіційна документація n8n):

| Порада скіла (id) | Що каже скіл | Що каже документація нашої версії | Висновок |
|---|---|---|---|
| `async-parallel` | Незалежні запити починати одночасно й чекати через `Promise.all()`, а не послідовними `await` | `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`, розділ «Parallel data fetching»: показує рівно той самий патерн — «Start multiple requests… then await them with `Promise.all`» — і явно попереджає, що послідовні `await` в одному компоненті створюють водоспад | Порада **актуальна й застосовна без змін** у Next.js 16.3.5. Застосовано в `app/dashboard/page.tsx`. |
| `server-cache-react` | Дані не через `fetch` (ORM, БД) — обгортати в `React.cache()` для дедуплікації в межах одного запиту | `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`, розділ «Deduplicating requests»: «If you are not using `fetch`… wrap your data access with the React `cache` function to deduplicate requests within a single render pass» — той самий кейс, що й наш `db` (не `fetch`) | Порада **актуальна й застосовна без змін**. У проєкті вже так зроблено для `getWorkspace`, але не для `getCurrentUser` — застосовано виправлення в `lib/data.ts`. |

Дві поради, які застосували, — обидві підтверджені документацією нашої версії Next.js без розбіжностей; версійних конфліктів не знайдено.

## 6. Закріплення версії й коміт

- Команда встановлення:
  ```bash
  DISABLE_TELEMETRY=1 npx skills@1.7.0 add vercel-labs/agent-skills#agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278 \
    --skill vercel-react-best-practices -a claude-code --copy
  ```
  Scope: **Project**. Перша спроба помилково пішла в **Global** (`~/.claude/skills/`), бо термінал у той момент стояв у домашній теці (`~`), а не в корені проєкту — «Project scope» кладе файли відносно `cwd`, не відносно проєкту в агенті. Повторили з правильним `cwd` (`cd` у корінь репо перед командою) — файли лягли туди, куди треба.
- Де лягли файли; справжні файли чи посилання: `.claude/skills/vercel-react-best-practices/` — справжня тека, 75 файлів (`file` підтверджує: `directory`, не symlink/junction).
- Що потрапило в git: тека скіла (75 файлів) і `skills-lock.json` (фіксує `source: vercel-labs/agent-skills`, `ref: agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278`, `computedHash`) — коміт `cc9978d` («skills: vendor vercel-react-best-practices pinned to agent-skills-063bee9»), 76 файлів. `.agents/` у проєкті немає.
- Як оновлювати: та сама команда з новим тегом (з правильного `cwd`!) → `git diff` покаже зміни у файлах правил → рев'ю за цим же чеклістом (розділи 1–5) → окремий коміт.

## Вердикт

**Встановити з умовами.** Код скіла чистий: жодних скриптів, хуків, `allowed-tools`, MCP чи прихованих інструкцій, лише markdown-документація й приклади коду з посиланнями на офіційну документацію (react.dev, nextjs.org, vercel.com). Видавець — Vercel Labs, відомий і активний (747K встановлень, 31.6K зірок), ліцензія MIT, три незалежні аудити (Gen/Socket/Snyk) — Pass. Умови: (1) версія закріплена тегом `agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278`, оновлення — лише через явний повторний рев'ю нового тега; (2) кожну пораду перед застосуванням звіряємо з `node_modules/next/dist/docs/` для нашої версії Next.js 16.3.5 — обидві застосовані поради (`async-parallel`, `server-cache-react`) підтверджено без розбіжностей; (3) ніколи не вмикаємо `DISABLE_TELEMETRY`/агентський режим під час самого встановлення, щоб бачити блок аудитів наживо.
