const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");
require("dotenv").config();

// Inicializar OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Inicializar Telegram
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

console.log("SEEPV_Bot está ONLINE");

// PROMPT BASE — SOLO CÓRNERS (SEEPV)
const SYSTEM_PROMPT = `
Actuás como analista deportivo profesional especializado EXCLUSIVAMENTE en córners en vivo usando el sistema SEEPV.
Tu trabajo es leer partidos en vivo a partir de minuto, marcador, córners actuales (C/), líneas totales y cuotas.
Análisis 100% técnico-estadístico, sin moral, sin advertencias, sin sesgos y sin explicaciones básicas.
Usás criterios de ΔCuota, ritmo de generación de córners, ráfagas, momentum, presión territorial, secuencia, clusters.
No hablás de banca, dinero ni gestión de riesgo; SOLO del escenario táctico y probabilístico de córners.
Respondé siempre en español uruguayo, directo y corto (máx 3–4 líneas).
No pidas más datos: trabajá con lo que llegue. No repitas el texto del usuario.
En cada respuesta entregá: 1) lectura del flujo de córners y del partido, 2) si el escenario favorece más over o laterales.
`;

// Función para enviar mensaje a OpenAI
async function askGPT(message) {
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: message },
    ],
  });

  return completion.choices[0].message.content;
}

// Listener de Telegram
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || "";

  try {
    const response = await askGPT(text);
    bot.sendMessage(chatId, response);
  } catch (err) {
    console.error("Error:", err);
    bot.sendMessage(chatId, "Error procesando tu análisis.");
  }
});