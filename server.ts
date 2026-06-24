import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { GoogleGenAI } from '@google/genai';

// Load environment variables
dotenv.config();

import {
  getUserByPhoneNumber,
  createGoal,
  getTasksByUserId,
  updateSubtaskStatus,
  updateTaskSubtasks,
  postponeTask,
  saveMessageLog,
  updateWhatsAppSession,
  saveRiskRecord,
  getLatestRisk,
  isSupabaseConfigured
} from './src/services/supabase';

import {
  generateTaskPlan,
  generatePanicTriage,
  generateScopeReduction,
  getVoicePlanningResponse,
  getApiKey
} from './src/services/gemini';

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Custom CORS middleware to avoid external packages
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Parse basic auth for Twilio media downloads
const twilioAuth =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN
      }
    : undefined;

/**
 * Helper to generate TwiML reply
 */
function sendTwilioReply(res: express.Response, message: string) {
  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`);
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Step 13: Voice Note Transcription pipeline using Gemini
 */
async function transcribeVoiceMessage(mediaUrl: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured.');
  }

  // 1. Download audio file from Twilio
  const response = await axios({
    method: 'get',
    url: mediaUrl,
    responseType: 'arraybuffer',
    auth: twilioAuth
  });

  const audioBuffer = Buffer.from(response.data);
  const base64Audio = audioBuffer.toString('base64');

  // 2. Call Gemini model to transcribe the audio directly
  const ai = new GoogleGenAI({ apiKey });
  const transcriptionResult = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        inlineData: {
          mimeType: String(response.headers['content-type'] || 'audio/ogg'),
          data: base64Audio
        }
      },
      'Transcribe this voice note exactly as spoken. Do not add any preamble or punctuation. Just return the text.'
    ]
  });

  return transcriptionResult.text?.trim() || '';
}

/**
 * Step 5: Intent Classifier using Gemini
 */
async function classifyIntent(messageText: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) return 'GENERAL_CHAT';

  const normalized = messageText.trim().toLowerCase();
  
  // Exact command overrides for quick responses
  if (normalized === 'today' || normalized === 'plan' || normalized === 'schedule') return 'GET_TODAY_PLAN';
  if (normalized === 'risk' || normalized === 'status') return 'RISK_CHECK';
  if (normalized === 'panic') return 'PANIC_MODE';
  if (normalized === 'reschedule') return 'RESCHEDULE';
  if (normalized === 'help' || normalized === 'commands') return 'HELP';
  if (normalized.startsWith('done ') || normalized.startsWith('completed ') || normalized === 'done') return 'COMPLETE_TASK';

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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

    return response.text?.trim() || 'GENERAL_CHAT';
  } catch (e) {
    console.error('Intent classification failed:', e);
    return 'GENERAL_CHAT';
  }
}

/**
 * Webhook main route (Step 3)
 */
app.post('/api/whatsapp/webhook', async (req, res) => {
  const body = req.body;
  const fromPhone = body.From || ''; // e.g. "whatsapp:+123456789"
  let messageText = body.Body || '';
  const numMedia = parseInt(body.NumMedia || '0');

  if (!fromPhone) {
    return res.status(400).send('Missing From phone number.');
  }

  // Sync databases check
  if (!isSupabaseConfigured()) {
    return sendTwilioReply(
      res,
      '⚠️ DeadlineOS system configuration is incomplete. Database parameters are missing.'
    );
  }

  try {
    // 1. Identify User (Step 4)
    const user = await getUserByPhoneNumber(fromPhone);
    if (!user) {
      const formattedPhone = fromPhone.replace('whatsapp:', '');
      return sendTwilioReply(
        res,
        `📱 Phone number ${formattedPhone} is not linked to any active DeadlineOS account. Please log in to the web dashboard, go to Settings, and connect your phone number.`
      );
    }

    // 2. Handle voice notes (Step 13)
    if (numMedia > 0) {
      const mediaUrl = body.MediaUrl0;
      const contentType = body.MediaContentType0 || '';
      
      if (mediaUrl && contentType.startsWith('audio/')) {
        try {
          messageText = await transcribeVoiceMessage(mediaUrl);
          await saveMessageLog(user.id, 'inbound', `[Voice Note] ${messageText}`);
        } catch (voiceErr: any) {
          console.error(voiceErr);
          return sendTwilioReply(res, '⚠️ Failed to transcribe your voice note. Please type it instead.');
        }
      }
    } else {
      await saveMessageLog(user.id, 'inbound', messageText);
    }

    // 3. Classify Message Intent (Step 5)
    const intent = await classifyIntent(messageText);
    await updateWhatsAppSession(user.id);

    // 4. Route Message based on Intent
    switch (intent) {
      case 'HELP': {
        const helpMessage = `🤖 *DeadlineOS Commands Guide*
        
• *today* / *plan* - Get your daily briefing & active focus blocks
• *done [task name/number]* - Complete a subtask
• *risk* - Audit project schedule risks & warnings
• *panic* - Trigger emergency panic Mode triage
• *reschedule* - Optimize calendar schedules
• Or type naturally to plan a new goal (e.g. "Plan AWS exam due July 15")`;
        await saveMessageLog(user.id, 'outbound', helpMessage);
        return sendTwilioReply(res, helpMessage);
      }

      case 'CREATE_GOAL': {
        const apiKey = getApiKey();
        if (!apiKey) return sendTwilioReply(res, 'Configure your API key to generate plans.');

        // Extract Goal and Deadline parameters from prompt
        const ai = new GoogleGenAI({ apiKey });
        const extraction = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Parse this instruction: "${messageText}". Current Year: ${new Date().getFullYear()}`,
          config: {
            systemInstruction: 'Extract the core Goal text and the target Deadline Date. Output ONLY valid JSON matching: { "goal": "string", "deadline": "YYYY-MM-DD or null if missing" }',
            responseMimeType: 'application/json'
          }
        });

        const parsed = JSON.parse(extraction.text || '{}');
        if (!parsed.goal) {
          return sendTwilioReply(res, 'What is the goal name? Please speak or type clearly.');
        }

        // Edge Case 1: No Deadline specified (Case 1)
        if (!parsed.deadline || parsed.deadline === 'null') {
          return sendTwilioReply(res, '📅 When is this due? Please specify a deadline date (e.g. "Friday" or "July 10").');
        }

        // Calculate hours left to determine estimated plan
        const targetDate = new Date(parsed.deadline);
        const now = new Date();
        const diffMs = targetDate.getTime() - now.getTime();
        const diffHours = Math.max(1, Math.round(diffMs / (3600 * 1000)));

        if (diffHours < 0) {
          return sendTwilioReply(res, '⚠️ Invalid date. The deadline date must be in the future.');
        }

        // Call AI Task Brain planner (Step 6)
        const plan = await generateTaskPlan(parsed.goal);

        // Save Goal and subtasks in Supabase
        const dbTask = await createGoal(
          user.id,
          plan.goal,
          'WhatsApp Plan',
          plan.estimated_hours,
          plan.difficulty,
          plan.impact,
          plan.subtasks
        );

        const reply = `🎯 *Goal Created Successfully*
        
• *Goal:* ${dbTask.title}
• *Deadline:* ${parsed.deadline}
• *Effort Est:* ${plan.estimated_hours} Hours
• *Tasks Generated:* ${dbTask.subtasks.length}
        
*Next Focus Task:*
1. ${dbTask.subtasks[0]?.text || 'Get started'}`;

        await saveMessageLog(user.id, 'outbound', reply);
        return sendTwilioReply(res, reply);
      }

      case 'GET_TODAY_PLAN': {
        const tasks = await getTasksByUserId(user.id);
        const activeTasks = tasks.filter(t => t.progress < 100);

        if (activeTasks.length === 0) {
          const reply = '🌅 No active focus tasks found for today. Type "Plan my DBMS project due Friday" to create one.';
          await saveMessageLog(user.id, 'outbound', reply);
          return sendTwilioReply(res, reply);
        }

        let planReply = `📅 *Today's Focus Priorities*\n`;
        activeTasks.forEach((t, i) => {
          const openSubtask = t.subtasks.find(st => !st.completed);
          planReply += `\n*${i + 1}. ${t.title}* (${t.progress}% complete)
• Focus task: ${openSubtask ? openSubtask.text : 'Final testing'}
• Time left: ${Math.ceil(t.countdown_seconds / 3600)} hours`;
        });

        await saveMessageLog(user.id, 'outbound', planReply);
        return sendTwilioReply(res, planReply);
      }

      case 'COMPLETE_TASK': {
        const tasks = await getTasksByUserId(user.id);
        const activeTasks = tasks.filter(t => t.progress < 100);

        if (activeTasks.length === 0) {
          return sendTwilioReply(res, 'No active tasks found to complete.');
        }

        // Find the task and complete its first open subtask
        // E.g. done with the highest priority item
        const targetTask = activeTasks[0];
        const subtaskIndex = targetTask.subtasks.findIndex(st => !st.completed);

        if (subtaskIndex === -1) {
          return sendTwilioReply(res, 'All subtasks for this task are already completed.');
        }

        const updated = await updateSubtaskStatus(targetTask.id, subtaskIndex, true);
        
        // Step 9: Run Risk Engine Calculation
        const completedCount = updated.subtasks.filter(st => st.completed).length;
        const totalCount = updated.subtasks.length;
        const progress = updated.progress;
        
        // Simulating risk level
        const missedSessionFactor = updated.postponed_count * 20;
        const timeFactor = updated.countdown_seconds / 3600;
        const riskScore = Math.max(0, Math.min(100, Math.round(100 - progress + missedSessionFactor - timeFactor)));
        const riskLevel = riskScore > 75 ? 'high' : riskScore > 40 ? 'medium' : 'low';
        
        await saveRiskRecord(
          user.id,
          riskScore,
          riskLevel,
          `Progress update to ${progress}% with ${updated.postponed_count} postponed checks.`
        );

        const reply = `✅ *Task Updated*
        
• Task: "${updated.subtasks[subtaskIndex].text}" marked complete.
• Project Progress: *${progress}%*
• System Risk Level: *${riskLevel.toUpperCase()}*`;

        await saveMessageLog(user.id, 'outbound', reply);
        return sendTwilioReply(res, reply);
      }

      case 'RISK_CHECK': {
        const tasks = await getTasksByUserId(user.id);
        const activeTasks = tasks.filter(t => t.progress < 100);

        if (activeTasks.length === 0) {
          return sendTwilioReply(res, 'No active projects to calculate risks for.');
        }

        const latestRisk = await getLatestRisk(user.id);
        const currentRiskLevel = latestRisk ? latestRisk.risk_level.toUpperCase() : 'LOW';
        const currentReason = latestRisk ? latestRisk.reason : 'All schedules are on time.';

        let reply = `⚠️ *DeadlineOS Schedule Audit*
        
• General System Risk: *${currentRiskLevel}*
• Details: ${currentReason}
        
*Active Deadlines:*`;

        activeTasks.forEach((t) => {
          const hoursLeft = Math.ceil(t.countdown_seconds / 3600);
          reply += `\n• "${t.title}" -> ${hoursLeft}h remaining (${t.progress}% complete)`;
        });

        await saveMessageLog(user.id, 'outbound', reply);
        return sendTwilioReply(res, reply);
      }

      case 'PANIC_MODE': {
        const tasks = await getTasksByUserId(user.id);
        const criticalTask = tasks.find(t => t.status === 'critical') || tasks[0];

        if (!criticalTask) {
          return sendTwilioReply(res, 'No active tasks found to rescue.');
        }

        // Triage task subtasks using Gemini
        const subtaskStrings = criticalTask.subtasks.map(st => st.text);
        const hoursLeft = Math.ceil(criticalTask.countdown_seconds / 3600);
        
        const triage = await generatePanicTriage(criticalTask.title, subtaskStrings, hoursLeft);

        // Update task subtasks order with triaged checklist
        const triagedSubtasks = [
          ...triage.must_do.map(text => ({ text, completed: false })),
          ...triage.skip.map(text => ({ text, completed: true })) // Mark Nice-to-haves as auto-skipped/completed
        ];
        await updateTaskSubtasks(criticalTask.id, triagedSubtasks);

        const reply = `🚨 *Emergency Panic Protocol Active*
        
*Survival Strategy:* "${triage.justification}"
        
*MUST DO CHECKLIST:*
${triage.must_do.map((t, i) => `${i + 1}. [ ] ${t}`).join('\n')}
        
*DEFERRED / SKIPPED:*
${triage.skip.map(t => `✗ ${t}`).join('\n')}`;

        await saveMessageLog(user.id, 'outbound', reply);
        return sendTwilioReply(res, reply);
      }

      case 'RESCHEDULE': {
        const tasks = await getTasksByUserId(user.id);
        const criticalTask = tasks.find(t => t.status === 'critical') || tasks[0];

        if (!criticalTask) {
          return sendTwilioReply(res, 'No active task found to reschedule.');
        }

        const updated = await postponeTask(criticalTask.id);
        const hoursLeft = Math.ceil(updated.countdown_seconds / 3600);

        const reply = `⏰ *Task Rescheduled*
        
• Task: "${updated.title}" shifted.
• New Deadline countdown: *${hoursLeft} Hours* remaining.
• Postponed count: *${updated.postponed_count}* times.`;

        await saveMessageLog(user.id, 'outbound', reply);
        return sendTwilioReply(res, reply);
      }

      case 'GENERAL_CHAT':
      default: {
        const responseText = await getVoicePlanningResponse(messageText);
        await saveMessageLog(user.id, 'outbound', responseText);
        return sendTwilioReply(res, responseText);
      }
    }
  } catch (error: any) {
    console.error(error);
    return sendTwilioReply(
      res,
      '🤖 Temporary agent failure. Please verify settings and try again.'
    );
  }
});

// Serve frontend assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
