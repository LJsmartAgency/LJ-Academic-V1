

## Plan: Add Exam Correction Guide Feature

### Overview
Add a new feature "Guião de Correção" that allows users to upload a photo of an exam/assessment and have the AI analyze and solve/correct the entire evaluation. This will be a separate flow from the academic work generator, accessible from the landing page and navigation.

### Changes

**1. New page: `src/pages/ExamCorrection.tsx`**
- Form with fields: Course name (e.g. Contabilidade), Education level, Exam title (optional)
- Image upload input (accepts camera photos and image files: jpg, png, webp)
- Convert uploaded image to base64 for sending to the AI
- "Gerar Guião de Correção" submit button with loading state
- Display the AI-generated correction guide in a structured result view
- Download as Word (.docx) button, same pattern as Result page

**2. New edge function: `supabase/functions/generate-correction/index.ts`**
- Receives: base64 image, course, educationLevel, examTitle
- Uses Gemini API with vision capability (gemini-1.5-flash) to read the exam image
- Prompt instructs AI to: identify each question, provide the correct answer with detailed explanation, use Portuguese (Portugal) academic style
- Returns structured JSON with questions and answers
- Includes rate limiting (same pattern as generate-work)
- Reads GEMINI_API_KEY from Supabase secrets

**3. Update `supabase/config.toml`**
- Add `[functions.generate-correction]` with `verify_jwt = false`

**4. Update `src/App.tsx`**
- Add route `/guiao-correcao` pointing to ExamCorrection page

**5. Update `src/pages/Index.tsx`**
- Add a new section/card on the landing page highlighting the correction guide feature
- Add a second CTA button or feature card linking to `/guiao-correcao`
- Update navbar to include link to the new feature

**6. Update header in `src/pages/CreateWork.tsx`**
- Add navigation link to the correction guide page

### Technical Details

- **Image handling**: The image will be converted to base64 on the client side and sent in the request body. Gemini's vision API accepts base64 images inline.
- **Gemini vision prompt**: Will use `gemini-1.5-flash` with multimodal content (image + text) to analyze the exam photo, identify questions, and generate detailed corrections following Portuguese education standards.
- **Word export**: Reuses the same `docx` library pattern from Result.tsx to generate a downloadable correction guide document.

