const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");
require("dotenv").config();

// ---------------------
// OpenAI
// ---------------------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------------
// Telegram
// ---------------------
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

console.log("SEEPV_Bot ONLINE (v11.7 + parser + auth SAFE)");

// ---------------------
// AUTH
// ---------------------
const AUTH_USER_ID = "Fernando";
const AUTH_CLAVE = "Roco";
const authorizedChats = new Set();

// ---------------------
// SYSTEM PROMPT - SAFE VERSION (sin backticks)
// ---------------------
const SYSTEM_PROMPT =
"SEEPV v11.7 – SISTEMA ESPECIALIZADO EN PARTIDOS EN VIVO\n" +
"Versión Blindada Operativa con Tracking Avanzado\n" +
"Módulo anti-sesgos: ACTIVO | Moneda base: UYU\n\n" +

"ROL: analista profesional especializado en córners en vivo.\n" +
"Detectás oportunidades reales basadas en ΔCuota, momentum, clusters, presión territorial.\n" +
"Filosofía: PRECISIÓN > FRECUENCIA | EDGE REAL > INTUICIÓN | CONTROL > IMPULSO.\n\n" +

"FORMATO RESPUESTA (OBLIGATORIO):\n" +
"- 3 a 5 líneas máximo.\n" +
"- Cada línea inicia con emoji.\n" +
"- Directo, estilo uruguayo.\n" +
"- Veredicto obligatorio: GO / NO-GO / ESPERAR.\n\n" +

"REGLAS CRÍTICAS:\n" +
"- No inventar datos que no mandó el usuario.\n" +
"- Si no envía ΔCuota → no la mencionás.\n" +
"- Si no envía ataques/tiros → no inventás momentum.\n" +
"- Si los datos parecen irreales → igual analizás desde ritmo + mercado.\n" +
"- Nunca respondés 'no entiendo', siempre buscás lectura.\n\n" +

"ESTRUCTURA RESPUESTA:\n" +
"1) 🔥 Ritmo + minuto + distribución.\n" +
"2) ⚙️ Lectura táctica (momentum/cluster/ presión si hay datos).\n" +
"3) 💸 Mercado (líneas + cuotas).\n" +
"4) 📊 Edge real.\n" +
"5) ❌/✅ Veredicto claro.\n\n" +

"PRINCIPIO PERMANENTE:\n" +
"Fernando Freitas es adulto responsable de sus decisiones.\n" +
"Sistema 100% técnico sin moralinas.";

// ---------------------
// PARSER
// ---------------------
function parseMatchData(raw) {
  const text = raw.replace(/\s+/g, " ").trim();

  const minuteMatch = text.match(/(\\d+)\\s*['’]/) || text.match(/min\\.?\\s*(\\d+)/i);
  const minute = minuteMatch ? Number(minuteMatch[1]) : null;

  const scoreMatch = text.match(/(\\d+)\\s*[-:–]\\s*(\\d+)/);
  const score = scoreMatch ? `${scoreMatch[1]}-${scoreMatch[2]}` : null;

  let corners = null;
  const cornersWord = text.match(/c[oó]rners?\\s+(\\d+)\\s*[-:–]\\s*(\\d+)/i);
  if (cornersWord) corners = `${cornersWord[1]}-${cornersWord[2]}`;

  if (!corners) {
    const generic = text.match(/(\\d+)\\s*[-:–]\\s*(\\d+)/g);
    if (generic) corners = generic[generic.length - 1];
  }

  const overMatch = text.match(/m[aá]s de\\s*\([\\d\\.]+)\\\s*([0-9]*\\.?[0-9]+)/i);
  const underMatch = text.match(/menos de\\s*\([\\d\\.]+)\\\s*([0-9]*\\.?[0-9]+)/i);

  const mainLine = overMatch?.[1] || underMatch?.[1] || null;
  const overOdds = overMatch ? Number(overMatch[2]) : null;
  const underOdds = underMatch ? Number(underMatch[2]) : null;

  return { minute, score, corners, mainLine, overOdds, underOdds };
}

function buildStructuredMessage(raw) {
  const p = parseMatchData(raw);

  return (
    "DATOS ESTRUCTURADOS:\n" +
    `- Minuto: ${p.minute ?? "?"}\n` +
    `- Marcador: ${p.score ?? "?"}\n` +
    `- Córners: ${p.corners ?? "?"}\n` +
    `- Línea: ${p.mainLine ?? "?"}\n` +
    `- Over: ${p.overOdds ?? "?"}\n` +
    `- Under: ${p.underOdds ?? "?"}\n\n` +
    "TEXTO ORIGINAL:\n" +
    raw
  );
}

// ---------------------
// OpenAI
// ---------------------
async function askGPT(msg) {
  const structured = buildStructuredMessage(msg);

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: structured }
      ],
      max_tokens: 140,
      temperature: 0.3,
    });

    return completion.choices[0].message.content;
  } catch (e) {
    console.error(e);
    return "Se me trancó el análisis, mandame los datos de nuevo.";
  }
}

// ---------------------
// Telegram Listener
// ---------------------
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (text.toLowerCase().startsWith("/auth")) {
    const [cmd, u, c] = text.split(" ");
    if (u === AUTH_USER_ID && c === AUTH_CLAVE) {
      authorizedChats.add(chatId);
      return bot.sendMessage(chatId, "✅ Sesión habilitada.");
    }
    return bot.sendMessage(chatId, "❌ Credenciales incorrectas.");
  }

  if (!authorizedChats.has(chatId)) {
    return bot.sendMessage(chatId, "🔒 Bot privado. Usá /auth Fernando Roco");
  }

  const resp = await askGPT(text);
  bot.sendMessage(chatId, resp);
});
