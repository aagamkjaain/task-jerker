// server.ts
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import path from "path";
import axios from "axios";
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";

// src/services/supabase.ts
import { createClient } from "@supabase/supabase-js";
var supabaseUrl = typeof process !== "undefined" && process.env?.SUPABASE_URL || // @ts-ignore
import.meta.env?.VITE_SUPABASE_URL || // @ts-ignore
import.meta.env?.SUPABASE_URL || (typeof localStorage !== "undefined" ? localStorage.getItem("SUPABASE_URL") : null) || "";
var supabaseKey = typeof process !== "undefined" && process.env?.SUPABASE_KEY || // @ts-ignore
import.meta.env?.VITE_SUPABASE_KEY || // @ts-ignore
import.meta.env?.SUPABASE_KEY || (typeof localStorage !== "undefined" ? localStorage.getItem("SUPABASE_KEY") : null) || "";
var supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder"
);
function isSupabaseConfigured() {
  return supabaseUrl !== "" && supabaseUrl !== "placeholder" && supabaseKey !== "" && supabaseKey !== "placeholder";
}
async function getUserByPhoneNumber(phoneNumber) {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase client is not configured. Please add SUPABASE_URL and SUPABASE_KEY to your environment/settings.");
  }
  const normPhone = phoneNumber.trim().replace("whatsapp:", "");
  const { data: user, error } = await supabase.from("users").select("*").eq("phone_number", normPhone).single();
  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }
  return user;
}
async function createGoal(userId, title, project, estimatedHours, difficulty, impact, subtasks) {
  const taskSubtasks = subtasks.map((text) => ({ text, completed: false }));
  const { data: newTask, error } = await supabase.from("tasks").insert({
    user_id: userId,
    title,
    project: project || "Default Project",
    status: impact >= 8 ? "critical" : "normal",
    countdown_seconds: estimatedHours * 3600,
    difficulty,
    impact,
    postponed_count: 0,
    progress: 0,
    subtasks: taskSubtasks
  }).select().single();
  if (error) throw error;
  return newTask;
}
async function getTasksByUserId(userId) {
  const { data: tasks, error } = await supabase.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return tasks || [];
}
async function updateSubtaskStatus(taskId, subtaskIndex, completed) {
  const { data: currentTask, error: fetchErr } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (fetchErr) throw fetchErr;
  const task = currentTask;
  if (!task.subtasks || task.subtasks.length === 0) {
    throw new Error("Task has no subtasks.");
  }
  const updatedSubtasks = [...task.subtasks];
  if (subtaskIndex >= 0 && subtaskIndex < updatedSubtasks.length) {
    updatedSubtasks[subtaskIndex] = {
      ...updatedSubtasks[subtaskIndex],
      completed
    };
  }
  const completedCount = updatedSubtasks.filter((st) => st.completed).length;
  const progress = Math.round(completedCount / updatedSubtasks.length * 100);
  const { data: updatedTask, error: updateErr } = await supabase.from("tasks").update({
    subtasks: updatedSubtasks,
    progress
  }).eq("id", taskId).select().single();
  if (updateErr) throw updateErr;
  return updatedTask;
}
async function updateTaskSubtasks(taskId, subtasks) {
  const completedCount = subtasks.filter((st) => st.completed).length;
  const progress = subtasks.length > 0 ? Math.round(completedCount / subtasks.length * 100) : 0;
  const { data: updatedTask, error } = await supabase.from("tasks").update({ subtasks, progress }).eq("id", taskId).select().single();
  if (error) throw error;
  return updatedTask;
}
async function postponeTask(taskId) {
  const { data: currentTask, error: fetchErr } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (fetchErr) throw fetchErr;
  const task = currentTask;
  const { data: updatedTask, error: updateErr } = await supabase.from("tasks").update({
    postponed_count: task.postponed_count + 1,
    countdown_seconds: task.countdown_seconds + 3600
    // Delay by 1 hour
  }).eq("id", taskId).select().single();
  if (updateErr) throw updateErr;
  return updatedTask;
}
async function saveMessageLog(userId, direction, messageText) {
  const { error } = await supabase.from("messages").insert({
    user_id: userId,
    direction,
    message: messageText
  });
  if (error) console.error("Failed to log message to DB:", error);
}
async function updateWhatsAppSession(userId) {
  const { error } = await supabase.from("whatsapp_sessions").upsert({
    user_id: userId,
    last_interaction: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (error) console.error("Failed to upsert whatsapp session:", error);
}
async function saveRiskRecord(userId, riskScore, riskLevel, reason) {
  const { error } = await supabase.from("risk_analysis").insert({
    user_id: userId,
    risk_score: riskScore,
    risk_level: riskLevel,
    reason
  });
  if (error) console.error("Failed to log risk analysis:", error);
}
async function getLatestRisk(userId) {
  const { data, error } = await supabase.from("risk_analysis").select("*").eq("user_id", userId).order("timestamp", { ascending: false }).limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

// src/services/gemini.ts
import { GoogleGenAI } from "@google/genai";
function getApiKey() {
  if (typeof process !== "undefined" && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  if (typeof localStorage !== "undefined") {
    const localKey = localStorage.getItem("GEMINI_API_KEY");
    if (localKey) return localKey;
  }
  const viteKey = typeof import.meta !== "undefined" && import.meta.env?.VITE_GEMINI_API_KEY;
  if (viteKey) return viteKey;
  const envKey = typeof import.meta !== "undefined" && import.meta.env?.GEMINI_API_KEY;
  if (envKey) return envKey;
  if (typeof window !== "undefined") {
    const windowKey = window.GEMINI_API_KEY;
    if (windowKey) return windowKey;
  }
  return "";
}
var cachedKey = "";
var cachedClient = null;
function getGeminiClient() {
  const key = getApiKey();
  if (!key) return null;
  if (key !== cachedKey || !cachedClient) {
    cachedKey = key;
    cachedClient = new GoogleGenAI({ apiKey: key });
  }
  return cachedClient;
}
async function generateTaskPlan(prompt) {
  const client = getGeminiClient();
  if (!client) {
    throw new Error("Gemini API Key is missing. Please set it in Settings.");
  }
  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Please break down the following goal/task into a structured plan: "${prompt}"`,
    config: {
      systemInstruction: "You are DeadlineOS AI Task Brain. Decompose the goal into subtasks (3 to 6 tasks), estimate the effort required in hours, estimate the difficulty (1 to 10), and estimate the impact (1 to 10). Output ONLY valid JSON matching the specified schema.",
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          goal: { type: "STRING", description: "A short capitalized title for the goal" },
          subtasks: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "List of specific actionable subtasks to accomplish the goal"
          },
          estimated_hours: { type: "INTEGER", description: "Total estimated hours to complete" },
          difficulty: { type: "INTEGER", description: "Difficulty rating from 1 (easy) to 10 (hard)" },
          impact: { type: "INTEGER", description: "Impact rating from 1 (low) to 10 (critical)" }
        },
        required: ["goal", "subtasks", "estimated_hours", "difficulty", "impact"]
      }
    }
  });
  if (!response.text) {
    throw new Error("Failed to generate response from Gemini.");
  }
  return JSON.parse(response.text);
}
async function generatePanicTriage(taskTitle, subtasks, hoursLeft) {
  const client = getGeminiClient();
  if (!client) {
    throw new Error("Gemini API Key is missing. Please set it in Settings.");
  }
  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Goal/Task: "${taskTitle}"
Subtasks: ${JSON.stringify(subtasks)}
Time Remaining: ${hoursLeft} hours`,
    config: {
      systemInstruction: 'You are the DeadlineOS Panic Mode Agent. Triage the given subtasks into "must_do" (essential for MVP/survival/deployment) and "skip" (nice-to-have, documentation, cleanups, styles) based on the remaining hours constraint. Output ONLY valid JSON matching the specified schema.',
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          must_do: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Critical path subtasks that MUST be done"
          },
          skip: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Non-critical subtasks that should be skipped or deferred"
          },
          justification: {
            type: "STRING",
            description: "Short reason explaining why certain tasks were cut"
          }
        },
        required: ["must_do", "skip", "justification"]
      }
    }
  });
  if (!response.text) {
    throw new Error("Failed to generate response from Gemini.");
  }
  return JSON.parse(response.text);
}
async function getVoicePlanningResponse(userSpeechInput) {
  const client = getGeminiClient();
  if (!client) {
    return "Please set your Gemini API key in settings first.";
  }
  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userSpeechInput,
    config: {
      systemInstruction: "You are the voice assistant for DeadlineOS, a distraction-free productivity dashboard. Respond to the user request in a single, short, concise, highly motivating sentence (maximum 25 words). Keep it verbal and spoken-friendly."
    }
  });
  return response.text || "Understood, let us keep pushing toward the deadline.";
}

// server.ts
dotenv.config();
var app = express();
var PORT = process.env.PORT || 3001;
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
var twilioAuth = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN ? {
  username: process.env.TWILIO_ACCOUNT_SID,
  password: process.env.TWILIO_AUTH_TOKEN
} : void 0;
function sendTwilioReply(res, message) {
  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`);
}
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}
async function transcribeVoiceMessage(mediaUrl) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }
  const response = await axios({
    method: "get",
    url: mediaUrl,
    responseType: "arraybuffer",
    auth: twilioAuth
  });
  const audioBuffer = Buffer.from(response.data);
  const base64Audio = audioBuffer.toString("base64");
  const ai = new GoogleGenAI2({ apiKey });
  const transcriptionResult = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        inlineData: {
          mimeType: String(response.headers["content-type"] || "audio/ogg"),
          data: base64Audio
        }
      },
      "Transcribe this voice note exactly as spoken. Do not add any preamble or punctuation. Just return the text."
    ]
  });
  return transcriptionResult.text?.trim() || "";
}
async function classifyIntent(messageText) {
  const apiKey = getApiKey();
  if (!apiKey) return "GENERAL_CHAT";
  const normalized = messageText.trim().toLowerCase();
  if (normalized === "today" || normalized === "plan" || normalized === "schedule") return "GET_TODAY_PLAN";
  if (normalized === "risk" || normalized === "status") return "RISK_CHECK";
  if (normalized === "panic") return "PANIC_MODE";
  if (normalized === "reschedule") return "RESCHEDULE";
  if (normalized === "help" || normalized === "commands") return "HELP";
  if (normalized.startsWith("done ") || normalized.startsWith("completed ") || normalized === "done") return "COMPLETE_TASK";
  try {
    const ai = new GoogleGenAI2({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Message: "${messageText}"`,
      config: {
        systemInstruction: `Classify the user message into one of these intents:
- CREATE_GOAL: User wants to start a new task, study course, prepare for exams, or make a roadmap (e.g. "Need to prepare for cloud exam", "Plan a DBMS project due Friday").
- COMPLETE_TASK: User is reporting a task/subtask completion (e.g. "I finished the ER diagram", "done with section 2").
- GET_TODAY_PLAN: User is requesting what to work on today (e.g. "What's my plan today?").
- RISK_CHECK: User wants to know their status/risks (e.g. "Check my risk score", "Show deadlines risk").
- PANIC_MODE: User has an immediate emergency or submission due in hours (e.g. "deadline in 10 hours", "emergency").
- RESCHEDULE: User wants to reschedule or shift focus (e.g. "reschedule DBMS project").
- GENERAL_CHAT: Conversational chatter, questions, or fallbacks.

Output ONLY the exact intent string.`,
        temperature: 0.1
      }
    });
    return response.text?.trim() || "GENERAL_CHAT";
  } catch (e) {
    console.error("Intent classification failed:", e);
    return "GENERAL_CHAT";
  }
}
app.post("/api/whatsapp/webhook", async (req, res) => {
  const body = req.body;
  const fromPhone = body.From || "";
  let messageText = body.Body || "";
  const numMedia = parseInt(body.NumMedia || "0");
  if (!fromPhone) {
    return res.status(400).send("Missing From phone number.");
  }
  if (!isSupabaseConfigured()) {
    return sendTwilioReply(
      res,
      "\u26A0\uFE0F DeadlineOS system configuration is incomplete. Database parameters are missing."
    );
  }
  try {
    const user = await getUserByPhoneNumber(fromPhone);
    if (!user) {
      const formattedPhone = fromPhone.replace("whatsapp:", "");
      return sendTwilioReply(
        res,
        `\u{1F4F1} Phone number ${formattedPhone} is not linked to any active DeadlineOS account. Please log in to the web dashboard, go to Settings, and connect your phone number.`
      );
    }
    if (numMedia > 0) {
      const mediaUrl = body.MediaUrl0;
      const contentType = body.MediaContentType0 || "";
      if (mediaUrl && contentType.startsWith("audio/")) {
        try {
          messageText = await transcribeVoiceMessage(mediaUrl);
          await saveMessageLog(user.id, "inbound", `[Voice Note] ${messageText}`);
        } catch (voiceErr) {
          console.error(voiceErr);
          return sendTwilioReply(res, "\u26A0\uFE0F Failed to transcribe your voice note. Please type it instead.");
        }
      }
    } else {
      await saveMessageLog(user.id, "inbound", messageText);
    }
    const intent = await classifyIntent(messageText);
    await updateWhatsAppSession(user.id);
    switch (intent) {
      case "HELP": {
        const helpMessage = `\u{1F916} *DeadlineOS Commands Guide*
        
\u2022 *today* / *plan* - Get your daily briefing & active focus blocks
\u2022 *done [task name/number]* - Complete a subtask
\u2022 *risk* - Audit project schedule risks & warnings
\u2022 *panic* - Trigger emergency panic Mode triage
\u2022 *reschedule* - Optimize calendar schedules
\u2022 Or type naturally to plan a new goal (e.g. "Plan AWS exam due July 15")`;
        await saveMessageLog(user.id, "outbound", helpMessage);
        return sendTwilioReply(res, helpMessage);
      }
      case "CREATE_GOAL": {
        const apiKey = getApiKey();
        if (!apiKey) return sendTwilioReply(res, "Configure your API key to generate plans.");
        const ai = new GoogleGenAI2({ apiKey });
        const extraction = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Parse this instruction: "${messageText}". Current Year: ${(/* @__PURE__ */ new Date()).getFullYear()}`,
          config: {
            systemInstruction: 'Extract the core Goal text and the target Deadline Date. Output ONLY valid JSON matching: { "goal": "string", "deadline": "YYYY-MM-DD or null if missing" }',
            responseMimeType: "application/json"
          }
        });
        const parsed = JSON.parse(extraction.text || "{}");
        if (!parsed.goal) {
          return sendTwilioReply(res, "What is the goal name? Please speak or type clearly.");
        }
        if (!parsed.deadline || parsed.deadline === "null") {
          return sendTwilioReply(res, '\u{1F4C5} When is this due? Please specify a deadline date (e.g. "Friday" or "July 10").');
        }
        const targetDate = new Date(parsed.deadline);
        const now = /* @__PURE__ */ new Date();
        const diffMs = targetDate.getTime() - now.getTime();
        const diffHours = Math.max(1, Math.round(diffMs / (3600 * 1e3)));
        if (diffHours < 0) {
          return sendTwilioReply(res, "\u26A0\uFE0F Invalid date. The deadline date must be in the future.");
        }
        const plan = await generateTaskPlan(parsed.goal);
        const dbTask = await createGoal(
          user.id,
          plan.goal,
          "WhatsApp Plan",
          plan.estimated_hours,
          plan.difficulty,
          plan.impact,
          plan.subtasks
        );
        const reply = `\u{1F3AF} *Goal Created Successfully*
        
\u2022 *Goal:* ${dbTask.title}
\u2022 *Deadline:* ${parsed.deadline}
\u2022 *Effort Est:* ${plan.estimated_hours} Hours
\u2022 *Tasks Generated:* ${dbTask.subtasks.length}
        
*Next Focus Task:*
1. ${dbTask.subtasks[0]?.text || "Get started"}`;
        await saveMessageLog(user.id, "outbound", reply);
        return sendTwilioReply(res, reply);
      }
      case "GET_TODAY_PLAN": {
        const tasks = await getTasksByUserId(user.id);
        const activeTasks = tasks.filter((t) => t.progress < 100);
        if (activeTasks.length === 0) {
          const reply = '\u{1F305} No active focus tasks found for today. Type "Plan my DBMS project due Friday" to create one.';
          await saveMessageLog(user.id, "outbound", reply);
          return sendTwilioReply(res, reply);
        }
        let planReply = `\u{1F4C5} *Today's Focus Priorities*
`;
        activeTasks.forEach((t, i) => {
          const openSubtask = t.subtasks.find((st) => !st.completed);
          planReply += `
*${i + 1}. ${t.title}* (${t.progress}% complete)
\u2022 Focus task: ${openSubtask ? openSubtask.text : "Final testing"}
\u2022 Time left: ${Math.ceil(t.countdown_seconds / 3600)} hours`;
        });
        await saveMessageLog(user.id, "outbound", planReply);
        return sendTwilioReply(res, planReply);
      }
      case "COMPLETE_TASK": {
        const tasks = await getTasksByUserId(user.id);
        const activeTasks = tasks.filter((t) => t.progress < 100);
        if (activeTasks.length === 0) {
          return sendTwilioReply(res, "No active tasks found to complete.");
        }
        const targetTask = activeTasks[0];
        const subtaskIndex = targetTask.subtasks.findIndex((st) => !st.completed);
        if (subtaskIndex === -1) {
          return sendTwilioReply(res, "All subtasks for this task are already completed.");
        }
        const updated = await updateSubtaskStatus(targetTask.id, subtaskIndex, true);
        const completedCount = updated.subtasks.filter((st) => st.completed).length;
        const totalCount = updated.subtasks.length;
        const progress = updated.progress;
        const missedSessionFactor = updated.postponed_count * 20;
        const timeFactor = updated.countdown_seconds / 3600;
        const riskScore = Math.max(0, Math.min(100, Math.round(100 - progress + missedSessionFactor - timeFactor)));
        const riskLevel = riskScore > 75 ? "high" : riskScore > 40 ? "medium" : "low";
        await saveRiskRecord(
          user.id,
          riskScore,
          riskLevel,
          `Progress update to ${progress}% with ${updated.postponed_count} postponed checks.`
        );
        const reply = `\u2705 *Task Updated*
        
\u2022 Task: "${updated.subtasks[subtaskIndex].text}" marked complete.
\u2022 Project Progress: *${progress}%*
\u2022 System Risk Level: *${riskLevel.toUpperCase()}*`;
        await saveMessageLog(user.id, "outbound", reply);
        return sendTwilioReply(res, reply);
      }
      case "RISK_CHECK": {
        const tasks = await getTasksByUserId(user.id);
        const activeTasks = tasks.filter((t) => t.progress < 100);
        if (activeTasks.length === 0) {
          return sendTwilioReply(res, "No active projects to calculate risks for.");
        }
        const latestRisk = await getLatestRisk(user.id);
        const currentRiskLevel = latestRisk ? latestRisk.risk_level.toUpperCase() : "LOW";
        const currentReason = latestRisk ? latestRisk.reason : "All schedules are on time.";
        let reply = `\u26A0\uFE0F *DeadlineOS Schedule Audit*
        
\u2022 General System Risk: *${currentRiskLevel}*
\u2022 Details: ${currentReason}
        
*Active Deadlines:*`;
        activeTasks.forEach((t) => {
          const hoursLeft = Math.ceil(t.countdown_seconds / 3600);
          reply += `
\u2022 "${t.title}" -> ${hoursLeft}h remaining (${t.progress}% complete)`;
        });
        await saveMessageLog(user.id, "outbound", reply);
        return sendTwilioReply(res, reply);
      }
      case "PANIC_MODE": {
        const tasks = await getTasksByUserId(user.id);
        const criticalTask = tasks.find((t) => t.status === "critical") || tasks[0];
        if (!criticalTask) {
          return sendTwilioReply(res, "No active tasks found to rescue.");
        }
        const subtaskStrings = criticalTask.subtasks.map((st) => st.text);
        const hoursLeft = Math.ceil(criticalTask.countdown_seconds / 3600);
        const triage = await generatePanicTriage(criticalTask.title, subtaskStrings, hoursLeft);
        const triagedSubtasks = [
          ...triage.must_do.map((text) => ({ text, completed: false })),
          ...triage.skip.map((text) => ({ text, completed: true }))
          // Mark Nice-to-haves as auto-skipped/completed
        ];
        await updateTaskSubtasks(criticalTask.id, triagedSubtasks);
        const reply = `\u{1F6A8} *Emergency Panic Protocol Active*
        
*Survival Strategy:* "${triage.justification}"
        
*MUST DO CHECKLIST:*
${triage.must_do.map((t, i) => `${i + 1}. [ ] ${t}`).join("\n")}
        
*DEFERRED / SKIPPED:*
${triage.skip.map((t) => `\u2717 ${t}`).join("\n")}`;
        await saveMessageLog(user.id, "outbound", reply);
        return sendTwilioReply(res, reply);
      }
      case "RESCHEDULE": {
        const tasks = await getTasksByUserId(user.id);
        const criticalTask = tasks.find((t) => t.status === "critical") || tasks[0];
        if (!criticalTask) {
          return sendTwilioReply(res, "No active task found to reschedule.");
        }
        const updated = await postponeTask(criticalTask.id);
        const hoursLeft = Math.ceil(updated.countdown_seconds / 3600);
        const reply = `\u23F0 *Task Rescheduled*
        
\u2022 Task: "${updated.title}" shifted.
\u2022 New Deadline countdown: *${hoursLeft} Hours* remaining.
\u2022 Postponed count: *${updated.postponed_count}* times.`;
        await saveMessageLog(user.id, "outbound", reply);
        return sendTwilioReply(res, reply);
      }
      case "GENERAL_CHAT":
      default: {
        const responseText = await getVoicePlanningResponse(messageText);
        await saveMessageLog(user.id, "outbound", responseText);
        return sendTwilioReply(res, responseText);
      }
    }
  } catch (error) {
    console.error(error);
    return sendTwilioReply(
      res,
      "\u{1F916} Temporary agent failure. Please verify settings and try again."
    );
  }
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}
app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
