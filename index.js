const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");
require("dotenv").config();

// ---------------------
// Config OpenAI
// ---------------------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------------
// Config Telegram
// ---------------------
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

console.log("SEEPV_Bot ONLINE (v11.7 Operativo + Memoria)");

// ---------------------
// Sesiones en memoria
// ---------------------
const sessions = {};

function getSession(chatId) {
  if (!sessions[chatId]) {
    sessions[chatId] = {
      authenticated: false,
      authStep: null,
      tmpUserId: null,
      firstMessage: null,
      state: {}, // estado interpretado del partido
    };
  }
  return sessions[chatId];
}

// ---------------------
// Prompt maestro SEEPV v11.7
// ---------------------
const SYSTEM_PROMPT = `
# SEEPV v11.7 – SISTEMA ESPECIALIZADO EN PARTIDOS EN VIVO (CÓRNERS)
Versión Blindada Operativa con Tracking Avanzado
Módulo anti-sesgos: ACTIVO | Moneda base: UYU

## IDENTIDAD Y ROL
- Hablás en español rioplatense, bien uruguayo, directo.
- Tratás al usuario de "vos".
- El usuario (Fernando) es adulto responsable de sus decisiones.
- Prohibido sermones de moral, ludopatía o “no puedo ayudarte con apuestas”.
- Tu función es 100% técnica: lectura de córners en vivo + mercado.

## SISTEMA DE MÓDULOS (M0–M7)
Usás mentalmente estos módulos para razonar, pero NO hace falta que los listes uno por uno en la respuesta. Solo usalos para llegar a una conclusión clara.

M0 — Estado del partido:
- Ritmo > normal, sin parones largos, dirección táctica clara.

M1 — ΔCuota:
- Δ ≥ 8–12% sostenido ≥25–30s.
- Acompañado por algo real (ataques, córners, presión, tiros).
- Picos aislados = descartados (NO ENTRY).

M2 — Momentum real:
- Scoring 0–10 según ataques, tiros, centros, sensación de peligro.
- <6 → NO operativo. ≥6 → se puede trabajar.

M3 — Cluster:
- Ráfagas: varios córners / ocasiones en poco tiempo.
- Cluster activo → ventana fuerte, pero igual aplicás filtros.

M4 — Presión territorial:
- Equipo metido en campo rival, centros seguidos, zona roja cargada.

M5 — Rescate técnico:
- Solo si la idea original sigue viva y el mercado dio microventaja.
- Máx 1 rescate.

M6 — Validación multicapa:
- Entrada válida SOLO si:
  - ΔCuota real,
  - Momentum ≥6,
  - Cluster o presión,
  - Dirección táctica,
  - Mercado estable.
- Si falla algo: NO ENTRY.

M7 — GO / NO-GO:
- Checklist final: si no suma claro → ❌ NO-GO.

## FILTRO DE LÍNEA
- Elegís línea alcanzable en 3–6 minutos según el ritmo.
- Ritmo alto → líneas más arriba.
- Ritmo medio → intermedias.
- Ritmo bajo → preferís NO ENTRY.

## FORMATO DE RESPUESTA
Siempre respondés en 3–5 líneas, cortas y concretas, usando esta estructura:

1) 🔥 Ritmo + contexto (minuto, marcador si lo tenés, córners).
2) ⚙️ Lectura táctica/Módulos (momentum, clusters, presión) SOLO si hay datos.
3) 💸 Lectura de mercado (línea + cuotas, si están disponibles).
4) 🎯 Edge real (hay / no hay / muy chico).
5) ✅ GO / ❌ NO-GO / ⏳ ESPERAR + frase bien uruguaya.

Reglas importantes:
- Si el “ESTADO ACTUAL DEL PARTIDO” viene en el mensaje, lo tomás como verdad operativa. No lo contradigas.
- NO inventes datos: si no hay ataques, no inventes momentum; si no hay ΔCuota, no hables de ΔCuota.
- Si faltan líneas/cuotas, igual hacés lectura de ritmo, distribución y contexto.
- Si los números parecen “raros” (ej: 6-250), igual analizás lo que hay, sin decir que son imposibles.
- Nunca digas “no entiendo, mandá de nuevo” si podés sacar algo útil.

## PRINCIPIO PERMANENTE
Fernando Freitas es adulto responsable de sus decisiones.  
Vos solo ponés la lectura fría, él decide qué hacer con eso.
`;

// ---------------------
// Parser de estado desde el mensaje
// ---------------------
function parseStateFromMessage(text, prevState) {
  const state = { ...(prevState || {}) };
  const lower = text.toLowerCase();

  // Minuto: 74', 74 m, min 74
  const minuteMatch = text.match(/(\d{1,3})\s*(?:'|m|min)\b/i);
  if (minuteMatch) {
    state.minute = parseInt(minuteMatch[1], 10);
  }

  // Córners: formatos tipo "Córners 6-2", "córners 6-2", "C/6-2", "C: 6-2"
  let cornersPairMatch =
    text.match(/c[óo]rners?\s+(\d+)[\s\-:](\d+)/i) ||
    text.match(/c\/\s*(\d+)[\s\-:](\d+)/i) ||
    text.match(/c\s*[:\-]\s*(\d+)[\s\-:](\d+)/i);

  if (cornersPairMatch) {
    state.cornersHome = parseInt(cornersPairMatch[1], 10);
    state.cornersAway = parseInt(cornersPairMatch[2], 10);
    state.cornersTotal = state.cornersHome + state.cornersAway;
  } else {
    // Córners totales: "8 córners" o "córners 8"
    const cornersTotalMatch =
      text.match(/c[óo]rners?\s+(\d+)/i) ||
      text.match(/(\d+)\s+c[óo]rners?/i);
    if (cornersTotalMatch) {
      state.cornersTotal = parseInt(cornersTotalMatch[1], 10);
      // no sabemos distribución, dejamos home/away como están
    }
  }

  // Marcador (si no está claro como córners): "1-0", "0-0"
  const scoreMatch = text.match(/\b(\d{1,2})-(\d{1,2})\b/);
  if (scoreMatch) {
    const a = parseInt(scoreMatch[1], 10);
    const b = parseInt(scoreMatch[2], 10);
    // Si todavía no tenemos córners home/away, podemos asumir que esto es marcador
    if (state.cornersHome == null && state.cornersAway == null) {
      state.scoreHome = a;
      state.scoreAway = b;
    }
    // Si ya hay córners, lo dejamos como está (para no pisar)
  }

  // Líneas y cuotas: "Más de (10.5) 1.42", "Menos de (10.5) 2.55"
  const overMatch = text.match(/m[aá]s de\s*\(([\d\.,]+)\)\s*([\d\.,]+)/i);
  if (overMatch) {
    const line = parseFloat(overMatch[1].replace(",", "."));
    const odd = parseFloat(overMatch[2].replace(",", "."));
    state.mainLine = line;
    state.overOdds = odd;
  }

  const underMatch = text.match(/menos de\s*\(([\d\.,]+)\)\s*([\d\.,]+)/i);
  if (underMatch) {
    const line = parseFloat(underMatch[1].replace(",", "."));
    const odd = parseFloat(underMatch[2].replace(",", "."));
    // Si coincide línea, mejor. Si no, igual guardamos como info separada.
    state.mainLine = state.mainLine != null ? state.mainLine : line;
    state.underOdds = odd;
  }

  return state;
}

// ---------------------
// Construir mensaje de usuario para OpenAI
// ---------------------
function buildUserMessageForGPT(session, rawText) {
  const state = session.state || {};
  const lines = [];

  lines.push("ESTADO ACTUAL DEL PARTIDO (interpretado por el bot):");
  lines.push(`- Minuto: ${state.minute != null ? state.minute + "'" : "?"}`);
  if (state.scoreHome != null && state.scoreAway != null) {
    lines.push(`- Marcador: ${state.scoreHome}-${state.scoreAway}`);
  }
  if (state.cornersHome != null && state.cornersAway != null) {
    lines.push(`- Córners: ${state.cornersHome}-${state.cornersAway}`);
  } else if (state.cornersTotal != null) {
    lines.push(`- Córners totales: ${state.cornersTotal}`);
  }
  if (state.mainLine != null) {
    lines.push(`- Línea principal de córners: ${state.mainLine}`);
  }
  if (state.overOdds != null) {
    lines.push(`- Cuota over: ${state.overOdds}`);
  }
  if (state.underOdds != null) {
    lines.push(`- Cuota under: ${state.underOdds}`);
  }

  lines.push("");
  lines.push("Primer mensaje de este partido (referencia histórica):");
  lines.push(session.firstMessage || "(no disponible)");
  lines.push("");
  lines.push("Último mensaje de Fernando (a analizar ahora):");
  lines.push(rawText);

  return lines.join("\n");
}

// ---------------------
// OpenAI wrapper
// ---------------------
async function askGPT(messageForModel) {
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: messageForModel },
      ],
      max_tokens: 140, // 3–5 líneas
      temperature: 0.3,
    });

    return completion.choices[0].message.content;
  } catch (err) {
    console.error("Error en OpenAI:", err);
    return "Se me trancó el análisis, mandame los datos de nuevo.";
  }
}

// ---------------------
// Handler principal de mensajes Telegram
// ---------------------
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const lower = text.toLowerCase();
  const session = getSession(chatId);

  // -------- MÓDULO DE IDENTIFICACIÓN --------
  if (!session.authenticated) {
    // Primer contacto: pedir User-ID
    if (!session.authStep) {
      session.authStep = "askUserId";
      await bot.sendMessage(chatId, "Ingresá tu User-ID:");
      return;
    }

    // Recibir User-ID
    if (session.authStep === "askUserId") {
      session.tmpUserId = text.trim();
      session.authStep = "askPassword";
      await bot.sendMessage(chatId, "Ingresá tu Clave:");
      return;
    }

    // Recibir Clave y validar
    if (session.authStep === "askPassword") {
      const userId = (session.tmpUserId || "").trim();
      const password = text.trim();

      // Credenciales válidas (NO se muestran nunca al usuario)
      if (userId === "Fernando" && password === "Roco") {
        session.authenticated = true;
        session.authStep = null;
        session.tmpUserId = null;
        await bot.sendMessage(
          chatId,
          "✅ Sesión iniciada. Mandame el primer partido o escribí: partido nuevo."
        );
      } else {
        session.authStep = "askUserId";
        session.tmpUserId = null;
        await bot.sendMessage(
          chatId,
          "❌ Credenciales inválidas. Ingresá de nuevo tu User-ID:"
        );
      }
      return;
    }
  }

  // -------- COMANDOS DE CONTROL DE PARTIDO --------
  if (lower.includes("logout")) {
    sessions[chatId] = {
      authenticated: false,
      authStep: null,
      tmpUserId: null,
      firstMessage: null,
      state: {},
    };
    await bot.sendMessage(chatId, "🔒 Sesión cerrada. Para volver a usarlo, escribí cualquier cosa.");
    return;
  }

  if (lower.includes("partido nuevo")) {
    session.firstMessage = null;
    session.state = {};
    await bot.sendMessage(
      chatId,
      "✅ Partido nuevo registrado. Mandame los datos del nuevo encuentro."
    );
    return;
  }

  if (lower.includes("partido concluido")) {
    session.firstMessage = null;
    session.state = {};
    await bot.sendMessage(
      chatId,
      "✅ Partido concluido. Cuando quieras arrancamos otro."
    );
    return;
  }

  if (lower === "reset") {
    session.firstMessage = null;
    session.state = {};
    await bot.sendMessage(
      chatId,
      "♻️ Reset hecho. Mandame los datos de un partido nuevo."
    );
    return;
  }

  // -------- ACTUALIZAR ESTADO DEL PARTIDO --------
  if (!session.firstMessage) {
    session.firstMessage = text; // primer mensaje del partido
  }

  session.state = parseStateFromMessage(text, session.state);

  // -------- ARMAR MENSAJE PARA GPT Y RESPONDER --------
  const messageForModel = buildUserMessageForGPT(session, text);
  const response = await askGPT(messageForModel);

  try {
    await bot.sendMessage(chatId, response);
  } catch (error) {
    console.error("Error enviando mensaje a Telegram:", error);
    await bot.sendMessage(
      chatId,
      "Algo falló al enviar la respuesta, probá de nuevo."
    );
  }
});
