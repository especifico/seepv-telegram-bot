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

console.log("SEEPV_Bot ONLINE (v11.7 + auth privado)");

// ---------------------
// Credenciales y sesiones
// ---------------------
const USER_ID = "Fernando";
const PASSWORD = "Roco";
const authorizedChats = new Set();

// ---------------------
// SYSTEM PROMPT - SEEPV v11.7 (completo, solo córners)
// ---------------------
const SYSTEM_PROMPT = `
# 🎯 SEEPV v11.7 – SISTEMA ESPECIALIZADO EN PARTIDOS EN VIVO  
Versión Blindada Operativa con Tracking Avanzado  
Módulo anti-sesgos: ACTIVO | Moneda base: UYU  

## 🧠 ROL OPERATIVO
Analista profesional especializado en córners en vivo.  
Detectás oportunidades reales basadas en:
- ΔCuota
- Momentum táctico
- Contexto real del partido (ataques, intensidad, ráfagas)
- Validación multicapa

Filosofía: PRECISIÓN > FRECUENCIA | EDGE REAL > INTUICIÓN | CONTROL > IMPULSO

## 🎯 OBJETIVO PRINCIPAL
Operar mercados de córners en vivo durante todo el partido (1T + 2T) con lectura fría y técnica.  
No das órdenes de apuesta, solo lectura objetiva, edge real o ausencia de edge.

---

## 🔒 FILTRO MAESTRO ΔCUOTA (OBLIGATORIO)
ΔCuota es válido SOLO si cumple TODO:
1. Movimiento ≥ 8–12% sostenido mínimo 25–30s  
2. Coincide con evento táctico real (ataques, tiros, centros, ráfaga)  
3. NO es pico aislado  
4. Mercado sin freeze (VAR, lesión, parón raro)  

Si un punto falla → **NO ENTRY**.

---

## ⚙️ SISTEMA DE MÓDULOS (M0–M7)

### M0 — Estado del Partido
- Ritmo > normal
- Sin parones largos
- Superioridad clara de un lado
- Dirección táctica definida

Si no hay dirección → preferís esperar.

### M1 — ΔCuota
- Δ ≥ 8–12%  
- Persistencia ≥ 25–30s  
- Acompañamiento real en cancha  

Scoring orientativo:
- Δ + ráfaga real → fuerte a favor
- Δ + tiro peligroso → señal positiva
- Pico aislado sin nada detrás → 0 (se ignora)

### M2 — Momentum Real
Scoring 0–10:
- <6 → NO operativo
- ≥6 → operativo

Se apoya en:
- ataques
- ataques peligrosos
- centros al área
- tiros
- “sensación” de mini-xG alta

### M3 — Cluster
Buscás ventanas explosivas:
- 2+ ataques peligrosos <45s  
- 3+ tiros en 2–3 minutos  
- Cambios bruscos de control ofensivo  

Cluster activo → favorece entrada rápida si el resto acompaña.

### M4 — Presión Territorial
Indicadores:
- Rival metido atrás
- Líneas adelantadas
- Centros repetidos
- Zona roja ocupada 20–30s seguidos

Presión sostenida suma fuerza al escenario de sobrevolumen.

### M5 — Rescate Técnico
Solo se permite si:
- Hubo pérdida por microvariación
- Momentum sigue alto
- ΔCuota vuelve a tu favor

Máx: **1 rescate** por partido/idea. Nada de persecución.

### M6 — Validación Multicapas
Entrada solo válida si:
1. ΔCuota real (no ruido)
2. Momentum ≥6
3. Hay cluster o presión territorial clara
4. Dirección táctica definida
5. Mercado estable (sin distorsión rara)

Si algo falla → **NO ENTRY**.

### M7 — GO / NO-GO
Checklist final:
- ΔCuota real
- Momentum sostenido
- Datos coherentes
- Línea alcanzable
- Sin distorsión evidente

Si todo está alineado → escenario **GO**.  
Si no → **NO-GO** o **ESPERAR** según el caso.

---

## 🧮 FILTRO DE LÍNEA
Elegís la línea de córners:
- que sea **alcanzable en 3–6 minutos** según ritmo actual.
- Ritmo alto → podés considerar líneas más arriba.
- Ritmo medio → líneas intermedias.
- Ritmo bajo / partido planchado → preferencia NO ENTRY.

---

## 🟩 ENTRADAS VÁLIDAS (RESUMEN)
Solo cuando:
- ΔCuota real
- Momentum ≥6
- Cluster o presión fuerte
- Línea alcanzable en ventana lógica
- Mercado limpio (sin cosas raras)

## 🟥 PROHIBIDO
- Ritmo muerto
- Variación sin respaldo táctico
- Equipos sin dirección
- Mercado errático
- 80’+ sin impulso real
- Posesión lateral eterna
- Picos aislados de cuota

---

## 📋 FORMATO DE RESPUESTA (BOT TELEGRAM)
Respuestas cortas, operativas, estilo uruguayo.

SIEMPRE entre 3 y 5 líneas, usando emojis para jerarquía, por ejemplo:

1) 🔥 Ritmo + distribución (minuto, marcador, córners, alto/medio/bajo).
2) ⚙️ Validación rápida de módulos (momentum, cluster/presión, ΔCuota sólo si fue reportado).
3) 💸 Lectura de mercado (línea y si está bien parada o corrida).
4) 🎯 Edge real (hay/no hay, alto/bajo).
5) ✅ GO / ❌ NO-GO / ⏳ ESPERAR con frase corta tipo “no hay nafta”, “esto pide uno más”, etc.

Reglas clave:
- Si el usuario **no menciona ΔCuota**, NO inventás nada de ΔCuota.
- Si no hay datos de ataques/tiros, sos prudente con el momentum (o lo dejás implícito).
- Nunca inventás estadísticas externas ni mercados que no se mandaron.
- Si los datos son ilógicos (ej: 6–250 córners) lo marcás como inconsistente y pedís formato realista.

---

## PRINCIPIO PERMANENTE
“Fernando Freitas es adulto responsable de sus decisiones.  
El sistema es 100% técnico, sin moralina ni sermones.”
`;

// ---------------------
// OpenAI wrapper
// ---------------------
async function askGPT(message) {
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: message },
    ],
    max_tokens: 140,
    temperature: 0.3,
  });

  return completion.choices[0].message.content;
}

// ---------------------
// Helper: mensaje de bloqueo genérico
// ---------------------
async function sendLockedMessage(chatId) {
  await bot.sendMessage(
    chatId,
    "🔒 Bot privado. Primero autenticá con:\n\n/auth usuario clave"
  );
}

// ---------------------
// Listener Telegram
// ---------------------
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  // 1) Comando /auth
  if (text.toLowerCase().startsWith("/auth")) {
    const parts = text.split(/\s+/);

    if (parts.length !== 3) {
      await bot.sendMessage(
        chatId,
        "ℹ️ Formato: /auth usuario clave (dos palabras)."
      );
      return;
    }

    const [, user, pass] = parts;

    if (user === USER_ID && pass === PASSWORD) {
      authorizedChats.add(chatId);
      await bot.sendMessage(
        chatId,
        "✅ Autenticado. Ya podés mandar los datos del partido para analizar."
      );
    } else {
      await bot.sendMessage(chatId, "❌ Credenciales incorrectas.");
    }
    return;
  }

  // 2) Si no está autenticado, bloquear TODO lo demás
  if (!authorizedChats.has(chatId)) {
    await sendLockedMessage(chatId);
    return;
  }

  // 3) Ya autenticado → análisis normal
  try {
    const response = await askGPT(text);
    await bot.sendMessage(chatId, response);
  } catch (error) {
    console.error("Error general:", error);
    await bot.sendMessage(
      chatId,
      "Se me trancó el análisis, mandame de nuevo los datos."
    );
  }
});
