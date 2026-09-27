import type {
  AuditEntry,
  Lead,
  LeadSource,
  LeadStats,
  LeadStatus,
  NewLead,
  SourceCount,
  User,
  Workspace,
} from "./types";
import { LEAD_SOURCES, LEAD_STATUSES } from "./types";

// In-memory stand-in for the agency's Postgres. Latencies mirror what the
// production database reports for the same queries on a busy workspace.

type Store = {
  workspaces: Workspace[];
  users: User[];
  leads: Lead[];
  audit: AuditEntry[];
  nextLeadNumber: number;
};

const LATENCY_MS = {
  getUserBySession: 100,
  getWorkspace: 100,
  getLeads: 400,
  getLeadStats: 1200,
  getSourceBreakdown: 400,
  getLead: 80,
  insertLead: 120,
  updateLeadStatus: 80,
  appendLeadNote: 80,
  deleteLead: 80,
  insertAuditEntry: 250,
  listUsers: 50,
  createSession: 50,
} as const;

type QueryName = keyof typeof LATENCY_MS;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function query<T>(name: QueryName, run: () => T): Promise<T> {
  console.count(`db:${name}`);
  await sleep(LATENCY_MS[name]);
  return run();
}

// ---------------------------------------------------------------------------
// Synthetic seed data (deterministic: same leads on every machine and restart)
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  "Olena", "Andrii", "Iryna", "Taras", "Sofiia", "Maksym", "Nataliia",
  "Bohdan", "Yuliia", "Dmytro", "Kateryna", "Oleh", "Anna", "Petro",
  "Mariia", "Yurii", "Daryna", "Ivan", "Oksana", "Roman", "Emma", "Lukas",
  "Zofia", "Marta",
];

const LAST_NAMES = [
  "Koval", "Bondarenko", "Tkachenko", "Kravets", "Melnyk", "Shevchuk",
  "Boiko", "Hnatiuk", "Moroz", "Lysenko", "Savchuk", "Rudenko", "Marchenko",
  "Petrenko", "Hrytsenko", "Fedoriv", "Novak", "Wiśniewska", "Hoffmann",
  "Danyliuk",
];

const COMPANIES = [
  "Nova Dental", "Karpaty Tours", "Lviv Coffee Lab", "Brick & Beam",
  "UrbanFit Studio", "Green Leaf Market", "Pixel Forge", "Svitlo Solar",
  "Artisan Bakery", "Metro Logistics", "Rynok Books", "Bloom Florists",
  "Vidnova Clinic", "North Wind Yachts", "Kvartal Realty", "Hutsul Crafts",
  "Smart Garage", "Poliana Wellness", "Stryi Auto Parts", "Kobzar Language School",
];

const JOB_TITLES = [
  "Owner", "Marketing Manager", "Head of Sales", "Founder", "Office Manager",
  "COO", "Brand Manager", "Operations Lead", "Clinic Administrator",
];

const CITIES: Array<[string, string]> = [
  ["Lviv", "UA"], ["Kyiv", "UA"], ["Odesa", "UA"], ["Dnipro", "UA"],
  ["Ivano-Frankivsk", "UA"], ["Ternopil", "UA"], ["Uzhhorod", "UA"],
  ["Lutsk", "UA"], ["Warsaw", "PL"], ["Kraków", "PL"], ["Vilnius", "LT"],
];

const MESSAGES = [
  "Потрібен новий сайт з онлайн-записом і інтеграцією з нашою CRM.",
  "Хочемо автоматизувати обробку заявок з Instagram і Facebook.",
  "Шукаємо підрядника на налаштування реклами на осінній сезон.",
  "Цікавить лендинг під нову послугу, запуск через місяць.",
  "Треба зв'язати форму на сайті з Google Sheets і Telegram.",
  "Плануємо редизайн і SEO. Бюджет обговорюється.",
  "Потрібна консультація щодо email-розсилок для постійних клієнтів.",
  "Маємо старий сайт на WordPress, хочемо перейти на щось швидше.",
  "Хочемо чат-бот для відповідей на типові питання клієнтів.",
];

const INTERNAL_NOTES = [
  "Двічі не взяв слухавку, просить писати на email.",
  "Бюджет гнучкий, якщо додамо SEO-пакет. Вирішує власник.",
  "Порівнює нас з двома іншими агенціями, важлива швидкість запуску.",
  "Колишній клієнт конкурента, незадоволений термінами.",
  "Просив не дзвонити до 11:00.",
  "Потенційно великий клієнт на рік, але довгий цикл погодження.",
  "Потрібен договір англійською, юрист клієнта в Польщі.",
  "",
  "",
];

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
];

const TAGS = ["seo", "ads", "website", "crm", "automation", "urgent", "retainer"];
const BUDGETS = [500, 1000, 1500, 2500, 5000, 10000, null];
const TEST_NETS = ["192.0.2", "198.51.100", "203.0.113"];

const UTM_BY_SOURCE: Record<LeadSource, [string | null, string | null]> = {
  website: [null, null],
  "google-ads": ["google", "cpc"],
  "facebook-ads": ["facebook", "paid_social"],
  linkedin: ["linkedin", "paid_social"],
  referral: ["partner", "referral"],
  webinar: ["webinar", "email"],
};

const CAMPAIGNS = ["autumn-2026", "dental-q3", "brand-search", "retargeting", "webinar-sept"];

// Reference "now" for the seed so dates do not drift between runs.
const SEED_NOW = Date.parse("2026-09-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function leadId(n: number) {
  return `lead_${String(n).padStart(4, "0")}`;
}

function seedLeads(count: number, workspaces: Workspace[], users: User[]): Lead[] {
  const random = mulberry32(20260921);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const leads: Lead[] = [];

  for (let n = 1; n <= count; n++) {
    const workspace = n % 7 === 0 ? workspaces[1] : workspaces[0];
    const managers = users.filter((u) => u.workspaceSlug === workspace.slug);
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const company = pick(COMPANIES);
    const [city, country] = pick(CITIES);
    const source = pick(LEAD_SOURCES);
    const [utmSource, utmMedium] = UTM_BY_SOURCE[source];
    const utmCampaign = utmSource ? pick(CAMPAIGNS) : null;
    const statusRoll = random();
    const status: LeadStatus =
      statusRoll < 0.35 ? "new"
      : statusRoll < 0.6 ? "contacted"
      : statusRoll < 0.78 ? "qualified"
      : statusRoll < 0.9 ? "won"
      : "lost";
    const createdAt = new Date(SEED_NOW - Math.floor(random() * 90 * DAY_MS));
    const updatedAt = new Date(createdAt.getTime() + Math.floor(random() * 5 * DAY_MS));
    const email = `${slugify(firstName)}.${slugify(lastName)}${n}@example.test`;
    const phone = `+380 00 ${String(100 + Math.floor(random() * 900))} ${String(10 + Math.floor(random() * 90))} ${String(10 + Math.floor(random() * 90))}`;
    const ipAddress = `${pick(TEST_NETS)}.${1 + Math.floor(random() * 254)}`;
    const userAgent = pick(USER_AGENTS);
    const budget = pick(BUDGETS);
    const message = pick(MESSAGES);
    const website = `https://${slugify(company)}.example.test`;
    const consentMarketing = random() < 0.6;

    leads.push({
      id: leadId(n),
      workspaceId: workspace.id,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      email,
      phone,
      company,
      jobTitle: pick(JOB_TITLES),
      website,
      city,
      country,
      source,
      utmSource,
      utmMedium,
      utmCampaign,
      budget,
      message,
      status,
      score: Math.floor(random() * 101),
      assignedTo: status === "new" ? null : pick(managers).name,
      tags: TAGS.filter(() => random() < 0.2),
      consentMarketing,
      ipAddress,
      userAgent,
      rawPayload: {
        form: {
          id: "contact-main",
          version: "2026-07",
          fields: { firstName, lastName, email, phone, company, website, budget, message, consentMarketing },
        },
        tracking: {
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          gclid: source === "google-ads" ? `Cj0KCQjw${Math.floor(random() * 1e9).toString(36)}` : null,
          fbclid: source === "facebook-ads" ? `IwAR${Math.floor(random() * 1e9).toString(36)}` : null,
          landingPage: `https://${workspace.slug}.example.test/${source === "website" ? "" : "promo"}`,
        },
        request: {
          ip: ipAddress,
          userAgent,
          acceptLanguage: country === "UA" ? "uk-UA,uk;q=0.9,en;q=0.8" : "pl-PL,pl;q=0.9,en;q=0.7",
          receivedAt: createdAt.toISOString(),
        },
      },
      internalNotes: status === "new" ? "" : pick(INTERNAL_NOTES),
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  }

  return leads;
}

function createStore(): Store {
  const workspaces: Workspace[] = [
    { id: "ws_studio_nova", slug: "studio-nova", name: "Studio Nova", plan: "growth", timezone: "Europe/Kyiv" },
    { id: "ws_brightline", slug: "brightline", name: "Brightline Fitness", plan: "starter", timezone: "Europe/Warsaw" },
  ];
  const users: User[] = [
    { id: "u_olena", name: "Olena Marchenko", email: "olena@studio-nova.example.test", role: "owner", workspaceSlug: "studio-nova" },
    { id: "u_taras", name: "Taras Hnatiuk", email: "taras@studio-nova.example.test", role: "manager", workspaceSlug: "studio-nova" },
    { id: "u_marta", name: "Marta Novak", email: "marta@brightline.example.test", role: "manager", workspaceSlug: "brightline" },
  ];
  const leads = seedLeads(200, workspaces, users);
  return { workspaces, users, leads, audit: [], nextLeadNumber: leads.length + 1 };
}

// One store per server process (also survives module reloads in `next dev`).
const globalForStore = globalThis as unknown as { leadDeskStore?: Store };
const store = (globalForStore.leadDeskStore ??= createStore());

const SESSION_PREFIX = "demo-";

export const db = {
  listUsers() {
    return query("listUsers", () => store.users.map((user) => ({ ...user })));
  },

  createSession(userId: string) {
    return query("createSession", () =>
      store.users.some((user) => user.id === userId) ? `${SESSION_PREFIX}${userId}` : null,
    );
  },

  getUserBySession(sessionId: string) {
    return query("getUserBySession", () => {
      const userId = sessionId.startsWith(SESSION_PREFIX) ? sessionId.slice(SESSION_PREFIX.length) : "";
      const user = store.users.find((u) => u.id === userId);
      return user ? { ...user } : null;
    });
  },

  getWorkspace(slug: string) {
    return query("getWorkspace", () => {
      const workspace = store.workspaces.find((w) => w.slug === slug);
      return workspace ? { ...workspace } : null;
    });
  },

  getLeads(workspaceId: string) {
    return query("getLeads", () =>
      store.leads
        .filter((lead) => lead.workspaceId === workspaceId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((lead) => structuredClone(lead)),
    );
  },

  getLead(id: string) {
    return query("getLead", () => {
      const lead = store.leads.find((l) => l.id === id);
      return lead ? structuredClone(lead) : null;
    });
  },

  getLeadStats(workspaceId: string) {
    return query("getLeadStats", (): LeadStats => {
      const leads = store.leads.filter((lead) => lead.workspaceId === workspaceId);
      const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
      for (const lead of leads) byStatus[lead.status]++;
      const weekAgo = SEED_NOW - 7 * DAY_MS;
      const budgets = leads.map((lead) => lead.budget).filter((b): b is number => b !== null);
      const closed = byStatus.won + byStatus.lost;
      return {
        total: leads.length,
        byStatus,
        last7Days: leads.filter((lead) => Date.parse(lead.createdAt) >= weekAgo).length,
        conversionRate: closed === 0 ? 0 : byStatus.won / closed,
        averageBudget: budgets.length === 0 ? 0 : Math.round(budgets.reduce((a, b) => a + b, 0) / budgets.length),
      };
    });
  },

  getSourceBreakdown(workspaceId: string) {
    return query("getSourceBreakdown", (): SourceCount[] =>
      LEAD_SOURCES.map((source) => ({
        source,
        count: store.leads.filter((lead) => lead.workspaceId === workspaceId && lead.source === source).length,
      })),
    );
  },

  insertLead(input: NewLead) {
    return query("insertLead", (): Lead => {
      const now = new Date().toISOString();
      const lead: Lead = {
        ...input,
        id: leadId(store.nextLeadNumber++),
        fullName: `${input.firstName} ${input.lastName}`,
        status: "new",
        score: 0,
        assignedTo: null,
        tags: [],
        internalNotes: "",
        createdAt: now,
        updatedAt: now,
      };
      store.leads.push(lead);
      return structuredClone(lead);
    });
  },

  updateLeadStatus(id: string, status: LeadStatus) {
    return query("updateLeadStatus", () => {
      const lead = store.leads.find((l) => l.id === id);
      if (!lead) return false;
      lead.status = status;
      lead.updatedAt = new Date().toISOString();
      return true;
    });
  },

  appendLeadNote(id: string, note: string) {
    return query("appendLeadNote", () => {
      const lead = store.leads.find((l) => l.id === id);
      if (!lead) return false;
      lead.internalNotes = lead.internalNotes ? `${lead.internalNotes}\n\n${note}` : note;
      lead.updatedAt = new Date().toISOString();
      return true;
    });
  },

  deleteLead(id: string) {
    return query("deleteLead", () => {
      const index = store.leads.findIndex((l) => l.id === id);
      if (index === -1) return false;
      store.leads.splice(index, 1);
      return true;
    });
  },

  insertAuditEntry(entry: AuditEntry) {
    return query("insertAuditEntry", () => {
      store.audit.push(entry);
    });
  },
};
