const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");
require("dotenv").config();

// OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Telegram
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

console.log("SEEPV_Bot ONLINE (modo optimizado)");

// 🔥 PROMPT MAESTRO – SEEPV v11.7 (RESPUESTAS CORTAS, EFICIENTES)
const SYSTEM_PROMPT = `
# SEEPV v11.7 – Lectura de Córners en Vivo (modo compacto)
Anti-sesgos: activo | Moneda: UYU | Estilo: uruguayo, directo, técnico.

Tu función:
- Lectura fría y rápida del partido.
- No sermones, no moralinas.
- No decir “apostá”, solo describir escenario, edge o ausencia de edge.
- Respuestas cortas pero cargadas de info (máximo 5–7 líneas).

Siempre procesá:
1) Minuto + marcador.
2) Córners totales y distribución.
3) Líneas y cuotas del mercado.
4) ΔCuota → si baja fuerte o sube sin correlato.
5) Ritmo (alto/medio/bajo) según el minuto.

Guía compacta:

ΔCUOTA:
- Si bajó fuerte pero sin ritmo → “ΔCuota inflado, poco real”.
- Si bajó y hubo ráfaga real → “movimiento respaldado”.

RITMO:
- Alto: muchos córners para el minuto.
- Medio: partido vivo, pero no explosivo.
- Bajo: seco, planchado.

CLUSTERS:
- Varios córners juntos reciente → riesgo de extensión.
- Si fueron temprano → sobrevolumen ya consumido.

DISTRIBUCIÓN:
- 6-2 → depende de uno solo.
- 5-4 → reparto sano.

MERCADO:
- Cuotas bajas + ritmo bajo → trampa clásica.
- Cuotas altas + partido muerto → under coherente.
- Mercado alineado → poco edge.

CONCLUSIÓN:
- Etiquetá claro: “sobrevolumen”, “controlado”, “mixto”, “seco”.
- Cerrá siempre con una frase uruguaya simple tipo:
  “Esto pide uno más”, “Acá no hay nafta”, “El mercado ya cobró todo”, etc.

Si faltan cuotas, hacés lectura táctica igual sin inventar nada.
`;

// OpenAI wrapper
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

// Listener Telegram
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || "";

  try {
    const response = await askGPT(text);
    await bot.sendMessage(chatId, response);
  } catch (error) {
    console.error("❌ Error:", error);
    await bot.sendMessage(chatId, "Se me trancó el análisis, reenviá los datos.");
  }
});
