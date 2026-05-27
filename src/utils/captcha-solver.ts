import type { Page } from '@playwright/test';

interface CaptchaAction {
  type: 'click' | 'drag' | 'wait';
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  ms?: number;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
}

async function callGemini(base64Image: string, apiKey: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are analyzing a screenshot from GitHub login. Your job is to detect if there is a CAPTCHA or verification challenge on the page and tell me what to click.

If there is a CAPTCHA challenge visible:
- If image tiles with a prompt like "Select all squares with [object]": click each matching tile
- If a "Verify" button or checkbox: click it
- Return click coordinates relative to the page viewport (top-left is 0,0)

If NO CAPTCHA is visible (just a login form, dashboard, or any normal page):
- Return empty actions

IMPORTANT: Return ONLY valid JSON, no markdown, no explanation, no code fences.

{
  "actions": [
    {"type": "click", "x": 450, "y": 350, "description": "what this click does"}
  ],
  "note": "breif description of what you see"
}`,
              },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: base64Image,
                },
              },
            ],
          },
        ],
      }),
    },
  );

  const json: GeminiResponse = await response.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

function parseResponse(text: string): CaptchaAction[] {
  try {
    const clean = text.replace(/```(?:json)?\s*|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return parsed.actions ?? [];
  } catch {
    const match = text.match(/\{[\s\S]*"actions"[\s\S]*\}/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]);
      return parsed.actions ?? [];
    } catch {
      return [];
    }
  }
}

export async function solveCaptcha(page: Page, apiKey: string, maxAttempts = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // eslint-disable-next-line no-console
    console.log(`🔐 CAPTCHA solver attempt ${attempt}/${maxAttempts}...`);

    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    const base64 = screenshot.toString('base64');

    // Save debug screenshot
    const fs = await import('node:fs');
    fs.mkdirSync('reports/artifacts', { recursive: true });
    const shotPath = `reports/artifacts/captcha-attempt-${attempt}.png`;
    fs.writeFileSync(shotPath, screenshot);
    // eslint-disable-next-line no-console
    console.log(`  📸 Saved debug screenshot: ${shotPath}`);

    const raw = await callGemini(base64, apiKey);
    // eslint-disable-next-line no-console
    console.log(`  🤖 Gemini response: ${raw.substring(0, 300)}`);

    const actions = parseResponse(raw);
    // eslint-disable-next-line no-console
    console.log(`  🔧 ${actions.length} actions parsed`);

    if (actions.length === 0) {
      // eslint-disable-next-line no-console
      console.log('  ⚠️  No actions returned — check debug screenshot');
      return false;
    }

    for (const action of actions) {
      if (action.type === 'click' && typeof action.x === 'number' && typeof action.y === 'number') {
        await page.mouse.click(action.x, action.y);
        // eslint-disable-next-line no-console
        console.log(`  👆 Click at (${action.x}, ${action.y})`);
      } else if (
        action.type === 'drag' &&
        typeof action.x1 === 'number' &&
        typeof action.y1 === 'number' &&
        typeof action.x2 === 'number' &&
        typeof action.y2 === 'number'
      ) {
        await page.mouse.move(action.x1, action.y1);
        await page.mouse.down();
        await page.mouse.move(action.x2, action.y2, { steps: 10 });
        await page.mouse.up();
        // eslint-disable-next-line no-console
        console.log(`  🖱️  Drag from (${action.x1},${action.y1}) → (${action.x2},${action.y2})`);
      } else if (action.type === 'wait' && action.ms) {
        await page.waitForTimeout(action.ms);
      }
    }

    await page.waitForTimeout(3000);
    const url = page.url();

    if (!url.includes('/login')) {
      // eslint-disable-next-line no-console
      console.log(`✅ CAPTCHA solved — navigated to: ${url}`);
      return true;
    }

    // eslint-disable-next-line no-console
    console.log(`  ⏳ Still on login page (attempt ${attempt}/${maxAttempts})`);
  }

  return false;
}
