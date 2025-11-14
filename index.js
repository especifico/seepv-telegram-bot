const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");
require("dotenv").config();

// ---------------------
// VALIDACIÓN DE VARIABLES DE ENTORNO
// ---------------------
if (!process.env.OPENAI_API_KEY || !process.env.TELEGRAM_BOT_TOKEN) {
  console.error("❌ ERROR: Faltan variables de entorno (OPENAI_API_KEY o TELEGRAM_BOT_TOKEN)");
  process.exit(1);
}

// ---------------------
// OpenAI
// ---------------------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------------
// Telegram
// ---------------------
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  } 
});

// Manejo de errores de polling
bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error.code, error.message);
});

bot.on('error', (error) => {
  console.error('❌ Bot error:', error);
});

console.log("✅ SEEPV_Bot ONLINE (v11.7 con memoria básica)");

// ---------------------
// Sesiones por chat
// ---------------------
// Por chatId guardamos:
// - firstMessage: primer mensaje del partido actual (contexto histórico)
// - lastState: último estado estructurado interpretado
// - coldData: "datos fríos" pre-partido opcionales
const sessions = {};

function resetSession(chatId) {
  sessions[chatId] = {
    firstMessage: null,
    lastState: null,
    coldData: null,
  };
}

// aseguramos que exista sesión
function ensureSession(chatId) {
  if (!sessions[chatId]) resetSession(chatId);
  return sessions[chatId];
}

// ---------------------
// PROMPT MAESTRO – SEEPV v11.7
// ---------------------
const SYSTEM_PROMPT = `
# SEEPV v11.7 – SISTEMA ESPECIALIZADO EN PARTIDOS EN VIVO (CÓRNERS)
Versión Blindada Operativa con Tracking Avanzado  
Módulo anti-sesgos: ACTIVO | Moneda base: UYU  

## IDENTIDAD
- Hablás en español rioplatense, bien uruguayo, directo.
- Tratás al usuario de "vos".
- El usuario (Fernando) es adulto responsable, con gestión de riesgo.
- Prohibido: moralina, sermones, "no puedo ayudarte con apuestas".
- Tu rol es 100% técnico: lectura de córners en vivo.

## ALCANCE
- Solo analizás córners en vivo (y derivados).
- Trabajás con lo que venga en el "ESTADO ACTUAL DEL PARTIDO" + "MENSAJE EN BRUTO".
- Si faltan datos (ΔCuota, momentum, ataques, etc.), NO los inventás.

## SISTEMA DE MÓDULOS (RESUMEN)
Usás internamente M0–M7 de SEEPV v11.7:

- M0: Estado del partido (ritmo, parones, dirección táctica).
- M1: ΔCuota (si viene en el mensaje estructurado o deducible).
- M2: Momentum (solo si Fernando manda info de ataques, tiros, ráfagas).
- M3: Clusters de ataque/córners.
- M4: Presión territorial.
- M5: Rescate técnico (máx. 1, solo si se menciona explícitamente).
- M6: Validación multicapa (todo alineado o NO ENTRY).
- M7: GO / NO-GO.

## DATOS FRÍOS
- Si el bloque "DATOS FRÍOS" aparece, lo tomás como contexto pre-partido.
- Ejemplo: promedios de córners por equipo, rachas, tabla, etc.
- Los usás SOLO como color de contexto, nunca para forzar un GO.
- El vivo siempre manda más que los datos fríos.

## FORMATO DE RESPUESTA (OBLIGATORIO)
- Siempre de **3 a 5 líneas**.
- Cada línea corta, directa.
- Usar SIEMPRE emojis para jerarquía:

  1️⃣ 🔥 Ritmo + contexto actual (minuto, marcador, córners, sensación general).  
  2️⃣ ⚙️ Lectura táctica/Módulos (solo si hay datos suficientes).  
  3️⃣ 💸 Lectura de mercado/líneas (si hay líneas y cuotas).  
  4️⃣ 🎯 Edge real (hay / no hay / muy bajo).  
  5️⃣ ✅ GO / ❌ NO-GO / ⏳ ESPERAR + frase uruguaya simple.

- Si no hay info para algún punto (ej: no mandó cuotas), simplemente NO lo inventás y lo decís claro.

Ejemplos de cierre:
- "❌ NO-GO, no hay nafta."
- "✅ GO, el partido pide uno más."
- "⏳ ESPERAR, falta que se encienda de verdad."

## COMANDOS IMPLÍCITOS
El back-end te pasa un bloque "ESTADO ACTUAL DEL PARTIDO" con:
- minuto (si se interpretó),
- marcador (si se interpretó),
- córners (si se interpretó),
- línea principal y cuotas (si se interpretó),
- datos fríos (si existen).

Vos NUNCA preguntás nada, solo:
- interpretás el estado,
- cruzás con el mensaje nuevo,
- devolvés lectura compacta y operativa.

## REGLA DE ORO
- Nunca digas "no entiendo nada". Siempre que haya algo (minuto, córners, línea, lo que sea), devolvé una lectura útil.
- Si los datos son evidentemente caóticos o contradictorios, podés marcarlo como "datos raros", pero igual devolvés una lectura clara (NO-GO, sin edge).
- Fernando decide qué hacer. Vos solo ponés la lectura fría.
`;

// ---------------------
// PARSER DE ESTADO
// ---------------------

function normNumber(str) {
  if (!str) return null;
  return parseFloat(str.replace(",", "."));
}

function parseStateFromText(text, prevState) {
  const lower = text.toLowerCase();
  const state = prevState
    ? { ...prevState }
    : {
        minute: null,
        score: null, // { home, away }
        corners: null, // { home, away, total }
        lineMain: null,
        oddsOver: null,
        oddsUnder: null,
      };

  // MINUTO: 74', 74 m, min 74
  const mMatch = text.match(/(\d+)\s*(?:'|m|min)/i);
  if (mMatch) {
    state.minute = parseInt(mMatch[1], 10);
  }

  // CÓRNERS PRIMERO (más específico): C/3-2, c:3-2, Córners 3-2
  let cMatch =
    text.match(/c[\/:]\s*(\d+)\s*[-:]\s*(\d+)/i) ||
    text.match(/c[óo]rners?\s+(\d+)\s*[-:]\s*(\d+)/i);

  if (cMatch) {
    const h = parseInt(cMatch[1], 10);
    const a = parseInt(cMatch[2], 10);
    state.corners = {
      home: h,
      away: a,
      total: h + a,
    };
  } else {
    // Córners totales SOLO si el número NO está seguido por "-x" ni ":x"
const cSingle =
  text.match(/c[óo]rners?\s+(\d+)(?![-:]\d+)/i) ||
  text.match(/(\d+)\s*c[óo]rners?(?![-:]\d+)/i);

if (cSingle) {
  const total = parseInt(cSingle[1], 10);

  // Protección extra anti-valores absurdos
  if (total <= 50) {
    state.corners = {
      home: null,
      away: null,
      total,
    };
  }
}

      };
    }
  }

  // MARCADOR genérico: 0-1, 2-2 (solo si NO ya interpretamos córners)
  if (!state.corners || (state.corners.home === null && state.corners.away === null)) {
    const scoreMatch = text.match(/(\d+)\s*-\s*(\d+)/);
    if (scoreMatch) {
      const a = parseInt(scoreMatch[1], 10);
      const b = parseInt(scoreMatch[2], 10);
      // Evitar scores absurdos y solo si no tenemos córners estructurados
      if (!state.score && a + b <= 20) {
        state.score = { home: a, away: b };
      }
    }
  }

  // LÍNEAS Y CUOTAS: Más de (10.5) 1.42 / Menos de (10.5) 2.55
  const overMatch = text.match(
    /m[aá]s de\s*\(([\d.,]+)\)\s*([\d.,]+)/i
  );
  if (overMatch) {
    state.lineMain = normNumber(overMatch[1]);
    state.oddsOver = normNumber(overMatch[2]);
  }

  const underMatch = text.match(
    /menos de\s*\(([\d.,]+)\)\s*([\d.,]+)/i
  );
  if (underMatch) {
    if (state.lineMain == null) {
      state.lineMain = normNumber(underMatch[1]);
    }
    state.oddsUnder = normNumber(underMatch[2]);
  }

  return state;
}

function hasStructuredInfo(state) {
  if (!state) return false;
  return (
    state.minute !== null ||
    state.score !== null ||
    state.corners !== null ||
    state.lineMain !== null ||
    state.oddsOver !== null ||
    state.oddsUnder !== null
  );
}

function buildStateDescription(session) {
  const s = session.lastState;
  const cold = session.coldData;
  const lines = [];

  lines.push("ESTADO ACTUAL DEL PARTIDO (interpretado):");

  if (!s || !hasStructuredInfo(s)) {
    lines.push("- Sin estado estructurado sólido, usar solo el mensaje.");
  } else {
    const min = s.minute != null ? `${s.minute}'` : "desconocido";
    const score =
      s.score != null
        ? `${s.score.home}-${s.score.away}`
        : "desconocido";
    let cornersText = "desconocido";
    if (s.corners) {
      if (s.corners.home != null && s.corners.away != null) {
        cornersText = `${s.corners.home}-${s.corners.away}`;
        if (typeof s.corners.total === "number") {
          cornersText += ` (total ${s.corners.total})`;
        }
      } else if (typeof s.corners.total === "number") {
        cornersText = `total ${s.corners.total}`;
      }
    }

    const lineText =
      s.lineMain != null ? `${s.lineMain}` : "no enviada";
    const overText =
      s.oddsOver != null ? `${s.oddsOver}` : "no enviada";
    const underText =
      s.oddsUnder != null ? `${s.oddsUnder}` : "no enviada";

    lines.push(`- Minuto: ${min}`);
    lines.push(`- Marcador: ${score}`);
    lines.push(`- Córners: ${cornersText}`);
    lines.push(`- Línea principal: ${lineText}`);
    lines.push(`- Cuota over: ${overText}`);
    lines.push(`- Cuota under: ${underText}`);
  }

  if (cold) {
    lines.push("");
    lines.push(
      "DATOS FRÍOS ENVIADOS POR FERNANDO (solo contexto, el vivo manda):"
    );
    lines.push(cold);
  }

  return lines.join("\n");
}

// ---------------------
// OpenAI wrapper con timeout
// ---------------------
async function askGPT(message, session) {
  const stateBlock = buildStateDescription(session);

  const userContent =
    stateBlock +
    "\n\n---\n" +
    "MENSAJE EN BRUTO DE FERNANDO:\n" +
    message +
    "\n\n" +
    "Respondé SOLO sobre córners en vivo, en 3 a 5 líneas, con emojis y veredicto final (✅ GO / ❌ NO-GO / ⏳ ESPERAR).";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // 25 segundos

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      max_tokens: 140,
      temperature: 0.3,
    }, { signal: controller.signal });

    clearTimeout(timeout);
    return completion.choices[0].message.content;
  } catch (err) {
    clearTimeout(timeout);
    
    if (err.name === 'AbortError') {
      return "⏱️ Se pasó el tiempo, mandame los datos de vuelta.";
    }
    
    console.error("❌ Error en OpenAI:", err);
    return "Se me trancó el análisis, mandame los datos de nuevo.";
  }
}

// ---------------------
// Listener Telegram
// ---------------------
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const lower = text.toLowerCase();

  const session = ensureSession(chatId);

  // COMANDOS DE CONTROL DE PARTIDO
  if (lower.includes("partido nuevo")) {
    resetSession(chatId);
    await bot.sendMessage(
      chatId,
      "✅ Partido nuevo registrado. Mandame los datos del próximo (minuto, marcador, córners, líneas)."
    );
    return;
  }

  if (
    lower.includes("partido concluido") ||
    lower.includes("fin del partido") ||
    lower.includes("terminó el partido")
  ) {
    resetSession(chatId);
    await bot.sendMessage(
      chatId,
      "🧾 Partido concluido, sesión reseteada. Cuando tengas otro, arrancamos de cero."
    );
    return;
  }

  // DATOS FRÍOS (pre-partido) con límite de caracteres
  if (lower.startsWith("datos fr") || lower.startsWith("datos fríos")) {
    const coldText = text.replace(/datos fr[ií]os[:\-]?\s*/i, "");
    session.coldData = coldText.slice(0, 500); // límite de 500 caracteres
    await bot.sendMessage(
      chatId,
      "📊 Datos fríos guardados. Ahora mandame el vivo (minuto, marcador, córners, líneas)."
    );
    return;
  }

  // Actualización normal de estado
  const prevState = session.lastState || null;
  const newState = parseStateFromText(text, prevState);

  // Setear primer mensaje del partido si no está
  if (!session.firstMessage) {
    session.firstMessage = text;
  }

  session.lastState = newState;

  // Llamar a OpenAI con estado + mensaje
  try {
    const response = await askGPT(text, session);
    await bot.sendMessage(chatId, response);
  } catch (error) {
    console.error("❌ Error general:", error);
    await bot.sendMessage(
      chatId,
      "Algo falló, probá de nuevo o mandame los datos de vuelta."
    );
  }
});

// ---------------------
// SHUTDOWN GRACEFUL
// ---------------------
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function gracefulShutdown(signal) {
  console.log(`\n${signal} recibido, cerrando bot...`);
  
  try {
    // Detener polling de Telegram
    await bot.stopPolling();
    console.log('✅ Polling de Telegram cerrado');
    
    // Opcional: guardar sesiones si usás persistencia
    // await guardarSesiones(sessions);
    
    console.log('✅ SEEPV_Bot cerrado correctamente');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en shutdown:', err);
    process.exit(1);
  }
}

// Capturar errores no manejados
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  // No cerrar el proceso, solo loggear
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

