# Gemini model usage (excluding Chatterbox TTS and AssemblyAI)

All Gemini-only model references across TheGeminiLoop and smrtr. Chatterbox and Assembly are separate services and not listed.

---

## TheGeminiLoop

### generate.py
| Model | Use |
|-------|-----|
| `gemini-3-flash-preview` | Main generateContent (module generation) |
| `gemini-2.5-flash-preview-tts` | TTS (audio); env `GEMINI_TTS_MODEL` |
| `gemini-3-pro-image-preview` | Problem/step image diagrams |

### scripts/generate_module_images_only.py
| Model | Use |
|-------|-----|
| `gemini-3-pro-image-preview` | Regenerate module PNGs only |

### homework-app.js
| Line (approx) | Model | Use |
|---------------|-------|-----|
| 394 | `gemini-3-pro-preview` | Parse problem (structure from problem text) |
| 3002 | `gemini-3-flash-preview` | Generate interactive HTML module |
| 3233–3234 | `gemini-2.5-flash-image` | Runtime problem/step image generation |
| 3389 | `gemini-3-pro-preview` | Evaluate Wikimedia Commons images |
| 3581 | `gemini-3-pro-image-preview` | Generate manual (custom) image |
| 3906, 4015 | `gemini-2.5-flash-preview-tts` | TTS in app |
| 4301 | `gemini-3-flash-preview` | GeminiLiveClient default model (streaming) |
| 4590 | `gemini-3-flash-preview` | Chatbot non-streaming generateContent |

### evaluate_loop_clean.py
| Model | Use |
|-------|-----|
| `models/gemini-3-flash-preview` | Evaluation loop (genai SDK) |

### Docs / env
- `docs/RUNPOD.md`, `.env`: reference `gemini-2.5-flash-preview-tts` (TTS)

---

## smrtr (study-os-mobile)

### Supabase Edge Functions
| File | Model | Use |
|------|-------|-----|
| `tutor_chat/index.ts` | `gemini-3-flash-preview` | Tutor chat + fallback |
| `notes_append_from_asset/index.ts` | `gemini-3-flash-preview` | Notes from asset (multiple call sites) |
| `notes_finalize/index.ts` | `gemini-3-flash-preview` | Finalize notes |
| `lesson_create_from_youtube/index.ts` | `gemini-3-flash-preview` | Create lesson from YouTube |
| `lesson_generate_summary/index.ts` | `gemini-3-flash-preview` | Lesson summary |
| `lesson_generate_flashcards/index.ts` | `gemini-3-flash-preview` | Flashcards |
| `lesson_generate_video/index.ts` | `gemini-3-pro-preview` | Story planning (narration script) |
| `podcast_generate_script/index.ts` | `gemini-3-pro-preview` | Podcast script |
| `podcast_generate_audio/index.ts` | `gemini-2.5-flash-preview-tts` | TTS only (Gemini 3 has no TTS) |
| `youtube_step_recommendations/index.ts` | `gemini-3-flash-preview` | Step recommendations |

### Backend (study-os-mobile/backend)
| File | Model | Use |
|------|-------|-----|
| `gemini_live_token/index.ts` | `gemini-3-flash-preview` | Live token / model config |
| `shared/transcriber.ts` | `gemini-3-flash-preview` | Audio transcription |

### solver/homework-app.js (smrtr copy)
| Same pattern as TheGeminiLoop homework-app.js | `gemini-3-pro-preview`, `gemini-3-flash-preview`, `gemini-3-pro-image-preview`, `gemini-2.5-flash-preview-tts` |

---

## Summary by model

- **gemini-3-flash-preview**: tutor chat, notes, lesson summary/flashcards/video script path, YouTube steps, transcriber, live token, chatbot/Live in homework-app.
- **gemini-3-pro-preview**: problem parsing, Commons eval, story/podcast script; higher-quality text.
- **gemini-3-pro-image-preview**: manual image generation in homework-app only.
- **gemini-3-flash-preview**: module generation (generate.py), evaluation (evaluate_loop_clean).
- **gemini-3-pro-image-preview**: image diagram generation (generate.py, images-only script, homework-app manual image).
- **gemini-2.5-flash-preview-tts**: all TTS (generate.py, homework-app, podcast_generate_audio).

Excluded as requested: Chatterbox (TTS), Assembly (transcription).
