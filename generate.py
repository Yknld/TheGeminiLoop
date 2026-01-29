#!/usr/bin/env python3
"""
Module Generator - Complete AI-powered homework module creation with multi-question support

Usage:
    # Single question
    python generate.py "Your problem here" --id module-name
    python generate.py "Solve for x: 2x + 5 = 13"
    
    # Multiple questions (inline)
    python generate.py "Question 1 text" "Question 2 text" "Question 3 text" --id my-module
    
    # Multiple questions (from file)
    python generate.py --file questions.txt --id my-module
    
    # File format (questions.txt):
    # One question per line
    # Solve for x: 2x + 5 = 13
    # What is the area of a circle with radius 5?
    # Find the derivative of f(x) = x^2 + 3x
"""

import os
import sys
import json
import time
import argparse
import requests
from pathlib import Path
from datetime import datetime

# Configuration
GEMINI_API_KEY = "AIzaSyDA-rWxab0kt41jbIhJk0cv_7SYxdhbmUI"
SUPABASE_URL = "https://euxfugfzmpsemkjpcpuz.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1eGZ1Z2Z6bXBzZW1ranBjcHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMDkyMDYsImV4cCI6MjA4MzU4NTIwNn0.bsfC3T5WoUhGrS-6VuowULRHciY7BpzMCBQ3F4fZFRI"

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

# EXACT PROMPT FROM homework-app.js
PLANNER_PROMPT_TEMPLATE = """You are an expert educational content creator that breaks down homework problems into intuitive, interactive learning steps. 
Given this homework problem: "{problem_text}"

Return a JSON object with this exact structure:
{{
  "problem": {{
    "title": "Problem title",
    "text": "Full problem description. Use LaTeX notation with dollar signs for any math (e.g., 'What is $5 \\\\times 3$?', 'Solve for $x$: $2x + 5 = 13$')",
    "image": null
  }},
  "steps": [
    {{
      "explanation": "Brief explanation of this step. For mathematical formulas, use LaTeX notation with dollar signs for inline math (e.g., $F_y = m_B g \\\\cos(\\\\theta)$) or double dollar signs for display math (e.g., $$F_x = m_B g \\\\sin(\\\\theta)$$). Use subscripts like $m_B$ for 'mass of block B', superscripts, fractions, and other mathematical notation as needed.",
      "inputLabel": "Question or prompt for user input",
      "inputPlaceholder": "Placeholder text for input field",
      "correctAnswer": "The correct answer for this step (can be a number, equation, or text). IMPORTANT: Provide multiple acceptable formats separated by '|' (pipe). For MATH: Include variations like '2x3', '2*3', '(2)(3)', '=6', '6', 'w=6', 'w = 6', etc. For TEXT/WORDS: Include common misspellings, alternative spellings, synonyms, and variations. Examples: 'mitochondria|mitochondrion|mitochondrial', 'photosynthesis|photosyntesis|fotosynthesis', 'nucleus|nucleous|nuclei'. Include plural/singular forms, common typos (1-2 character differences), and alternative word orders for phrases. Example: '6|2x3|2*3|(2)(3)|=6|w=6|w = 6' or 'mitochondria|mitochondrion|mitochondrial|mitocondria'",
      "audioExplanation": "A clear explanation (3-5 sentences) written in second person (using 'you') describing how the visualization helps you understand this step and the concept. At the end, add 1-2 sentences explaining what the visualization is, what it means, and how it specifically helps you understand the current step. This will be converted to speech.",
      "visualizationType": "interactive" or "image" - CHOOSE CAREFULLY based on the rules below,
      "modulePrompt": "If visualizationType is 'interactive': A VERY detailed, explicit prompt describing exactly what the interactive module should VISUALIZE (not just restate). Focus on: What does this step MEAN conceptually? Then describe the visualization that shows that meaning. Include: what should be graphed/drawn/animated, what controls should exist (sliders, buttons, etc.), how the visualization updates in real-time, and how manipulating it helps understand the underlying concept. CRITICAL: The module should answer 'What does this step mean?' not 'What is the answer?'. For equations: graph them. For relationships: show the visual connection. For processes: animate the transformation. If visualizationType is 'image': null",
      "moduleImage": "If visualizationType is 'image': A VERY detailed, specific description of ONLY the visual diagram that should be generated to help students UNDERSTAND the concept. Focus on: What does this step need students to SEE and UNDERSTAND? Then describe the visual that makes it clear. Include: exactly what structures/shapes should be shown with specific visual details (colors, textures, internal features), labels (A/B/C for structures, w/l/x/y for variables), arrows showing relationships, layout, and style. CRITICAL: Describe ONLY the diagram itself - NO questions, NO instructions, NO titles, NO answers, NO solutions, NO final numerical values. The diagram should help students understand what the concept/structure/relationship LOOKS LIKE and MEANS - NOT give them the answer. Think: 'What visual would make this concept suddenly make sense?' If visualizationType is 'interactive': null"
    }}
  ]
}}

🎯 GOLDEN RULE FOR INTERACTIVE MODULES AND IMAGES:

Never just restate the question in HTML/SVG format!

Ask yourself: "If a student doesn't understand what this step MEANS conceptually, what visualization would help?"

Examples:
- Step says "Set supply = demand" → Don't just show the equations again!
  ✅ DO: Graph both functions and show where they intersect (that's what "setting equal" means!)
  ❌ DON'T: Display "S(p) = 20p - 50" and "D(p) = -10p + 250" and ask them to type an equation

- Step says "Find the area" → Don't just show "A = l × w"!
  ✅ DO: Show the rectangle with draggable dimensions, physically show the grid squares filling it, count them
  ❌ DON'T: Display "A = l × w" and ask for a number

- Step says "Identify structure A" → Don't just show a blob with "A" on it!
  ✅ DO: Show detailed cross-section with visible internal features (membranes, cristae, matrix) that identify it
  ❌ DON'T: Show a generic oval with "A" label

The visualization should answer: "What does this concept/step LOOK like? What does it MEAN?"

CRITICAL: visualizationType Selection Rules

You MUST choose "image" for:
- Set problems (Venn diagrams, set intersections, unions, complements)
- Visualizing relationships between groups or categories
- Static diagrams that show structure or organization
- Problems that need a single visual snapshot to understand the concept
- Geometry problems where you need to see the shape/configuration (unless it needs manipulation)
- Flowcharts, organizational charts, or hierarchical structures
- Visual representations of data structures or concepts that don't change
- Biology diagrams (cell structures, organelles, anatomical diagrams, biological processes)
- Scientific diagrams showing physical structures, parts, or components
- Identification problems where students need to see and label structures
- Any step that asks "what is structure X?" or "identify structure Y" - these need visual diagrams

You MUST choose "interactive" for:
- Formulas and equations (algebra, calculus, physics formulas)
- Mathematical relationships that change when parameters are adjusted
- Step-by-step solving processes where you can see intermediate steps
- Problems where understanding HOW something works requires manipulation
- Real-time calculations that show cause and effect
- Exploring relationships between variables (e.g., "what happens if I change X?")
- Visualizing mathematical concepts through manipulation (sliders for coefficients, seeing graphs update)
- Understanding why a formula works by seeing it in action
- Problems where the student needs to explore and experiment

Examples:
- "Find the intersection of sets A and B" → "image" (Venn diagram showing sets)
- "What is structure A? (oval-shaped organelle with internal folds)" → "image" (detailed diagram of mitochondrion with cristae visible)
- "Identify the cell structures labeled A, B, C" → "image" (labeled cell diagram)
- "Solve for x: 2x + 3 = 11" → "interactive" (sliders to adjust coefficients, see equation balance)
- "What is the area of a rectangle?" → "interactive" (adjust width/height sliders, see area update)
- "Draw a Venn diagram for these sets" → "image" (static diagram)
- "Explain why we subtract in this step" → "interactive" (visualize the subtraction process with manipulable elements)
- "Show the relationship between force, mass, and acceleration" → "interactive" (F=ma with sliders)

Generate as many steps as needed to solve the problem. Each step should have:
- A clear explanation (use LaTeX notation with dollar signs for inline math like $F_y = m_B g \\\\cos(\\\\theta)$ or double dollar signs for display math. Use proper subscripts, superscripts, and mathematical notation)
- A user input prompt/question
- A correctAnswer field with the expected answer (for validation). CRITICAL: Include multiple acceptable formats separated by '|' (pipe). Generate as many variations as possible:
  * For MATH/NUMBERS: Different operators (*, x, ×, ( )( )), with/without equals (=6, 6, w=6), with/without spaces (2x3, 2 x 3), with/without parentheses ((2)(3), 2(3)), different variable formats (w=6, w= 6), leading/trailing equals (=6, = 6)
  * For TEXT/WORDS: Include common misspellings (1-2 character differences), alternative spellings, plural/singular forms, synonyms, and common typos. Examples: 'mitochondria|mitochondrion|mitochondrial|mitocondria', 'photosynthesis|photosyntesis|fotosynthesis', 'nucleus|nucleous|nuclei', 'cell membrane|cell membrain|plasma membrane'
  * For PHRASES: Include word order variations, with/without articles, and common phrasing alternatives
  Example for "6": "6|2x3|2*3|(2)(3)|=6|w=6|w = 6|2 x 3|2 * 3|(2)(3)|= 6"
  Example for "mitochondria": "mitochondria|mitochondrion|mitochondrial|mitocondria|mitochondira"
- An audioExplanation (3-5 sentences) written in second person ("you") that:
  * First 2-3 sentences: Explain how the visualization helps you understand this step and the underlying concept
  * Last 1-2 sentences: Explain what the visualization is, what it means, and how it specifically helps you understand the current step
  * Use "you" and "your" instead of "student" or "the student"
- A visualizationType: Choose "interactive" or "image" based on the CRITICAL rules above. Think carefully about whether the step benefits from manipulation (interactive) or just needs a visual reference (image).
- A modulePrompt: ONLY if visualizationType is "interactive". This must be EXTREMELY detailed and explicit.
  
  ⚠️ CRITICAL: The interactive module should VISUALIZE THE CONCEPT, not just restate the question!
  
  Ask yourself: "What does this step mean conceptually?" Then create a visualization that shows that meaning.
  
  Examples of GOOD vs BAD prompts:
  - ❌ BAD: "Show the equations S(p) = 20p - 50 and D(p) = -10p + 250 and ask user to set them equal"
  - ✅ GOOD: "Graph both the supply function (upward sloping blue line) and demand function (downward sloping red line) on the same coordinate system. Show the intersection point clearly marked. Include sliders to adjust the coefficients and see how the equilibrium point moves. This visualizes what 'setting functions equal' means - finding where the lines cross."
  
  - ❌ BAD: "Display the equation 2x + 5 = 13 and ask user to solve it"
  - ✅ GOOD: "Show a balance scale with '2x + 5' on the left and '13' on the right. As the user performs operations (subtracting 5, dividing by 2), animate the scale staying balanced. Show the equation transforming step-by-step below the scale. This visualizes what 'solving' means - keeping both sides equal."
  
  - ❌ BAD: "Show the Pythagorean theorem a² + b² = c² and ask for the hypotenuse"
  - ✅ GOOD: "Display a right triangle with draggable sides a and b. As the user adjusts them, show the squares on each side (a², b², c²) actually drawn as squares with calculated areas. Show c updating in real-time. Include grid background to emphasize the geometric meaning of 'squared'."
  
  Your modulePrompt must include:
  * WHAT CONCEPT you're visualizing (not just what question you're asking)
  * Exactly what interactive elements should be present (sliders, buttons, draggable elements, etc.)
  * What each control should adjust (specific variables, parameters, values)
  * How the visualization should update in real-time when controls are changed
  * What visual elements should be displayed (graphs, shapes, equations, diagrams, animations)
  * What calculations or formulas should be shown and updated
  * HOW this visualization helps the student understand what the step MEANS (not just how to solve it)
  * Be specific about ranges, labels, colors, and behavior
  
  Think: "If I were confused about what this step means, what visualization would make me go 'Aha! Now I get it!'"
- A moduleImage: ONLY if visualizationType is "image". This must be EXTREMELY detailed.
  
  ⚠️ CRITICAL: The image should VISUALIZE THE CONCEPT and help students understand what the step means!
  
  Examples of GOOD vs BAD descriptions:
  - ❌ BAD: "Show a cell with structure A labeled"
  - ✅ GOOD: "Detailed cross-section of a eukaryotic cell showing a large oval organelle (mitochondrion) with distinct double membrane and internal cristae (folded inner membrane). Label it 'A'. Show matrix (inner fluid space) and intermembrane space. Use colors: outer membrane in dark blue, inner membrane folds in light blue, matrix in pale yellow."
  
  - ❌ BAD: "Show a rectangle with width and length"
  - ✅ GOOD: "Rectangle drawn with clear right angles. Left side labeled 'w' (width), bottom side labeled '2w + 3' (length). Show dimension lines with arrows extending from each side to the labels. Use contrasting colors: rectangle outline in navy blue (#2563eb), dimension lines and labels in coral (#ff6b6b)."
  
  Your moduleImage description must include:
  * WHAT CONCEPT you're visualizing (what understanding should this diagram provide?)
  * Exactly what should be shown (shapes, structures, objects, relationships)
  * Specific layout and positioning (where things are relative to each other)
  * All labels and annotations that should appear (ONLY variable labels like 'w', 'l', 'x', 'y' or structure labels like A, B, C - NO question text, NO answers, NO solutions)
  * Colors, styles, and visual hierarchy (specific hex codes when possible)
  * Mathematical notation for variables and formulas (like 2w+3 for length) - but NOT the solved values
  * Any arrows, connections, or relationships to highlight
  * Specific visual details that make the concept clear (textures, patterns, internal structures)
  
  CRITICAL: Describe ONLY the visual diagram itself - DO NOT include:
  - Questions or question text
  - Instructions or titles
  - Answers or solutions (NO final answers, NO solved values, NO "Final Dimensions", NO "Answer:", etc.)
  - Text boxes with answers
  - Any text that reveals the solution to the problem
  
  The diagram should show the PROBLEM SETUP and CONCEPTUAL UNDERSTANDING (what structures look like, what relationships exist, what's given) - NOT the solution.
  
  Think: "If I were learning this concept for the first time, what visual would make it crystal clear?"

Return ONLY valid JSON, no markdown formatting.

CRITICAL JSON FORMATTING REQUIREMENTS:
- All backslashes in string values MUST be escaped as \\\\ (double backslash)
- LaTeX notation like \\\\cos, \\\\theta, \\\\alpha must use double backslashes: \\\\\\\\cos, \\\\\\\\theta, \\\\\\\\alpha
- All quotes within string values must be escaped as \\\\"
- Newlines in strings must be escaped as \\\\n
- Ensure all special characters are properly escaped
- The JSON must be valid and parseable by JSON.parse()
- Test your JSON output to ensure it's valid before returning it"""


def print_header():
    print("\n" + "="*70)
    print("🚀 MODULE GENERATOR")
    print("="*70)


def call_gemini(prompt):
    """Call Gemini API with the planning prompt"""
    # Retry logic for rate limits
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = requests.post(
                f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={"contents": [{"parts": [{"text": prompt}]}]},
                timeout=180  # Increased for complex visualizations
            )
            response.raise_for_status()
            data = response.json()
            
            if not data.get("candidates"):
                raise Exception("No candidates in response")
                
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            
            # Extract JSON from markdown if present
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1])  # Remove first and last lines
                if text.startswith("json"):
                    text = text[4:].strip()
            
            # Extract JSON object - use ast.literal_eval friendly approach
            import re
            
            # Try to extract JSON from markdown code blocks first
            code_block_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', text)
            if code_block_match:
                text = code_block_match.group(1)
            else:
                # Extract JSON object with balanced braces
                json_match = re.search(r'\{[\s\S]*\}', text)
                if json_match:
                    text = json_match.group(0)
            
            # Try to parse JSON
            try:
                return json.loads(text)
            except json.JSONDecodeError as json_err:
                # If escape error, log the problematic area and fix
                if "Invalid \\escape" in str(json_err) or "Expecting" in str(json_err):
                    print(f"⚠️  JSON parse error: {json_err}")
                    print(f"⚠️  Attempting to fix escape sequences...")
                    
                    # Save the raw response for debugging
                    debug_file = Path("debug_json_error.txt")
                    debug_file.write_text(text)
                    print(f"   📝 Raw JSON saved to {debug_file}")
                    
                    # Use eval as last resort (safer than replacing blindly)
                    try:
                        import ast
                        # Replace true/false/null with Python equivalents for ast
                        py_text = text.replace('true', 'True').replace('false', 'False').replace('null', 'None')
                        result = ast.literal_eval(py_text)
                        print(f"   ✅ Successfully parsed using ast.literal_eval")
                        return result
                    except:
                        pass
                    
                    # Last resort: double all backslashes
                    try:
                        fixed_text = text.replace('\\', '\\\\')
                        result = json.loads(fixed_text)
                        print(f"   ✅ Successfully parsed after escaping backslashes")
                        return result
                    except Exception as fix_err:
                        print(f"   ❌ Could not fix: {fix_err}")
                        pass
                raise
            
        except Exception as e:
            if "429" in str(e) or "Too Many Requests" in str(e):
                if attempt < max_retries - 1:
                    wait_time = 10 * (attempt + 1)  # 10, 20, 30 seconds
                    print(f"⏳ Rate limit hit, waiting {wait_time}s before retry {attempt + 2}/{max_retries}...")
                    time.sleep(wait_time)
                    continue
            print(f"\n❌ Gemini API Error after {attempt + 1} attempts: {e}")
            raise


def generate_interactive_html(module_prompt, step_data):
    """Generate interactive HTML component using Gemini - MATCHES ORIGINAL template.html"""
    # Use the EXACT format from template.html lines 3493-3510
    prompt = f"""Create ONLY the interactive visualization component (no step UI - explanation/inputs/buttons already exist).

{module_prompt}

🎯 YOUR GOAL: Create a visualization that helps students UNDERSTAND the concept, not just restate the question!

The modulePrompt above describes what concept to visualize. Your job is to:
1. Create visual elements (graphs, shapes, animations, diagrams) that SHOW what's happening
2. Add interactive controls (sliders, buttons) that let students manipulate and explore
3. Update the visualization in real-time as they interact
4. Help them go "Aha! Now I understand what this MEANS!"

Examples:
- If the prompt mentions "setting two functions equal": Graph both functions on the same axes and show their intersection point
- If the prompt mentions "balancing an equation": Show a visual balance scale or both sides of the equation transforming together
- If the prompt mentions "area of a rectangle": Show the actual rectangle with dimensions, maybe fill it with grid squares
- If the prompt mentions "force and acceleration": Show a visual object moving/accelerating with vectors

Don't just show the equation or question again - CREATE A VISUAL REPRESENTATION that makes the concept clear!

CRITICAL REQUIREMENTS:
- WORKING sliders: Use <input type="range"> with oninput handlers that update visualization instantly
- Modern, clean design: professional colors (#2563eb, #16a34a), shadows, rounded corners, good spacing
- Real-time updates: all controls must update visualization immediately (no delay)
- Responsive sizing: use width: 100% and max-width: 100% (NO 400px constraints!)
- DO NOT use class name "container" - use "module-container" instead to avoid conflicts
- Self-contained: inline <style> and <script> tags only
- CRITICAL: Return ONLY a <div> with inline <style> and <script> - NO <!DOCTYPE>, <html>, <head>, or <body> tags
- Start directly with: <div style="..."> or <div><style>...</style>...</div>
- Execute immediately: wrap JS in (function(){{...}})() or use immediate execution
- Event listeners: attach oninput/onchange handlers immediately when script runs
- DO NOT include the problem/question text in the module - only the interactive visualization
- DO NOT include question prompts like "How many...", "What is...", "Solve for..." - these are handled separately
- DO NOT use template variables, placeholders like {{variable}}, {{constant}}, or curly braces
- For math expressions: Use proper HTML/CSS rendering, NOT LaTeX dollar signs ($...$)
- If you need to show math: Use HTML entities, Unicode, or plain text (e.g., "2x" not "$2x$", "x²" not "$x^2$")
- Return ONLY HTML/JavaScript code (no markdown, no explanations, no question text, no placeholders)

🎨 LAYOUT & SPACING REQUIREMENTS (CRITICAL):
- COMPACT DESIGN: Keep the module height reasonable (300-500px max)
- NO excessive padding/margins: Use padding: 15-20px max on container
- NO large empty spaces: Content should be vertically compact and well-organized
- Controls at BOTTOM: Place buttons/sliders at the bottom, close to the visualization
- Tight spacing: gap: 12-15px between elements (NOT 30-50px)
- Minimize whitespace: Every pixel should serve the learning experience
- The module should feel "complete" not "sparse" - fill the space meaningfully"""

    # Retry logic for rate limits
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = requests.post(
                f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={"contents": [{"parts": [{"text": prompt}]}]},
                timeout=180  # Increased for complex visualizations
            )
            response.raise_for_status()
            data = response.json()
            
            html = data["candidates"][0]["content"]["parts"][0]["text"]
            
            # Clean up markdown
            html = html.replace("```html", "").replace("```", "").strip()
            
            return html
            
        except Exception as e:
            if "429" in str(e) or "Too Many Requests" in str(e):
                if attempt < max_retries - 1:
                    wait_time = 10 * (attempt + 1)  # 10, 20, 30 seconds
                    print(f"      ⏳ Rate limit hit, waiting {wait_time}s before retry {attempt + 2}/{max_retries}...")
                    time.sleep(wait_time)
                    continue
            print(f"      ⚠️  HTML generation failed after {attempt + 1} attempts: {e}")
            return None
    
    return None


def generate_svg_diagram(image_description):
    """Generate SVG diagram using Gemini"""
    prompt = f"""Generate an SVG diagram based on this description:

{image_description}

🎯 YOUR GOAL: Create a visual diagram that helps students UNDERSTAND the concept/structure, not just a generic shape!

The description above tells you what to visualize. Your job is to:
1. Show specific visual details that make the concept/structure recognizable and clear
2. Use colors, textures, and styling to differentiate different parts/components
3. Add clear labels (but NO questions, NO answers, NO solution values)
4. Make it visually accurate to what the concept/structure actually looks like
5. Help students go "Oh! That's what it looks like!"

Examples:
- If showing a mitochondrion: Show the double membrane, internal cristae folds, matrix, intermembrane space (not just an oval)
- If showing a rectangle with dimensions: Show clear right angles, dimension lines with arrows, labeled sides
- If showing a Venn diagram: Show overlapping circles with distinct regions, proper set labels
- If showing a force diagram: Show vectors with proper direction, magnitude representation, labeled forces

Create a diagram that teaches through visual accuracy and detail!

Requirements:
- Complete, valid SVG code
- Clear, professional styling matching these colors:
  * Primary: #2563eb
  * Text: #0f172a
  * Background: #f8fafc
  * Border: #e2e8f0
- Appropriate colors and labels
- Readable at different sizes
- Include viewBox for scaling
- Self-contained (no external resources)
- Professional educational diagram style

🎨 LAYOUT REQUIREMENTS:
- COMPACT SIZE: Use reasonable viewBox dimensions (400-600 width, 300-500 height)
- FILL THE SPACE: Make diagrams use most of the available space meaningfully
- NO excessive margins: Keep content centered with minimal padding
- Efficient use of space: Don't leave large empty areas
- Well-proportioned: Balance visual elements across the canvas

Return ONLY the SVG code, no explanations, no markdown."""

    # Retry logic for rate limits
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = requests.post(
                f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={"contents": [{"parts": [{"text": prompt}]}]},
                timeout=180  # Increased for complex visualizations
            )
            response.raise_for_status()
            data = response.json()
            
            svg = data["candidates"][0]["content"]["parts"][0]["text"]
            
            # Clean up markdown
            svg = svg.replace("```svg", "").replace("```", "").strip()
            
            # Extract SVG tag if wrapped in other text
            if not svg.startswith("<svg"):
                import re
                svg_match = re.search(r'<svg[\s\S]*</svg>', svg)
                if svg_match:
                    svg = svg_match.group(0)
            
            return svg
            
        except Exception as e:
            if "429" in str(e) or "Too Many Requests" in str(e):
                if attempt < max_retries - 1:
                    wait_time = 10 * (attempt + 1)  # 10, 20, 30 seconds
                    print(f"      ⏳ Rate limit hit, waiting {wait_time}s before retry {attempt + 2}/{max_retries}...")
                    time.sleep(wait_time)
                    continue
            print(f"      ⚠️  SVG generation failed after {attempt + 1} attempts: {e}")
            return None
    
    return None


def generate_audio(text, output_path):
    """Generate TTS audio using Supabase"""
    try:
        response = requests.post(
            f"{SUPABASE_URL}/functions/v1/tts",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
            json={"text": text},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            audio_content = data.get("audioContent")
            if audio_content:
                # Decode base64
                import base64
                audio_bytes = base64.b64decode(audio_content)
                with open(output_path, "wb") as f:
                    f.write(audio_bytes)
                return True
        return False
        
    except Exception:
        return False


def create_module_directories(module_path):
    """Create module directory structure"""
    dirs = [
        module_path,
        module_path / "audio",
        module_path / "components",
        module_path / "visuals"
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)


def main():
    parser = argparse.ArgumentParser(description="Generate homework module with multiple questions")
    parser.add_argument("problems", nargs="*", help="Problem text(s). Provide multiple problems separated by spaces (use quotes for each problem), or use --file to load from a file")
    parser.add_argument("--id", dest="module_id", help="Module ID", default=None)
    parser.add_argument("--file", dest="problem_file", help="Path to file containing problems (one per line)", default=None)
    parser.add_argument("--evaluate", action="store_true", help="Run evaluation loop after generation to test and fix components")
    parser.add_argument("--no-evaluate", action="store_true", help="Skip evaluation loop (default behavior for backwards compatibility)")
    args = parser.parse_args()
    
    # Handle problem input from file or arguments
    if args.problem_file:
        print(f"📂 Reading problems from: {args.problem_file}")
        try:
            with open(args.problem_file, 'r') as f:
                problem_texts = [line.strip() for line in f if line.strip()]
        except Exception as e:
            print(f"❌ Error reading file: {e}")
            sys.exit(1)
    elif args.problems:
        problem_texts = args.problems
    else:
        print("❌ Error: Must provide either problem text(s) or use --file")
        parser.print_help()
        sys.exit(1)
    
    module_id = args.module_id or f"module-{int(time.time())}"
    
    print_header()
    print(f"📊 Total Questions: {len(problem_texts)}")
    for i, problem in enumerate(problem_texts, 1):
        preview = problem[:80] + "..." if len(problem) > 80 else problem
        print(f"   Q{i}: {preview}")
    print(f"🆔 Module ID: {module_id}\n")
    
    # Step 1: Create directories
    module_path = Path("modules") / module_id
    create_module_directories(module_path)
    print(f"\n✅ Created directory: {module_path}\n")
    
    # Step 2: Process each question
    all_questions = []
    overall_start_time = time.time()
    
    for q_idx, problem_text in enumerate(problem_texts, 1):
        print("\n" + "="*70)
        print(f"📚 QUESTION {q_idx} of {len(problem_texts)}")
        print("="*70)
        preview = problem_text[:100] + "..." if len(problem_text) > 100 else problem_text
        print(f"📝 Problem: {preview}\n")
        
        # Generate module structure for this question
        print(f"1️⃣  Calling Gemini API to generate question {q_idx} structure...")
        start_time = time.time()
        
        prompt = PLANNER_PROMPT_TEMPLATE.format(problem_text=problem_text)
        module_data = call_gemini(prompt)
        
        elapsed = time.time() - start_time
        print(f"✅ Generated structure with {len(module_data['steps'])} steps ({elapsed:.1f}s)")
        
        # Generate problem visualization
        print(f"\n2️⃣  Generating problem visualization for question {q_idx}...")
        problem_viz_path = None
        try:
            viz_prompt = f"""Generate a detailed, accurate SVG diagram that visualizes this homework problem:

{problem_text}

CRITICAL REQUIREMENTS:
- Create ONLY an SVG diagram (no text explanations)
- Professional educational style matching these colors:
  * Primary: #2563eb
  * Text: #0f172a  
  * Background: #f8fafc
  * Border: #e2e8f0
- Clear, labeled diagram that helps visualize the problem
- Include viewBox for responsive scaling
- Self-contained SVG (no external resources)
- Return ONLY the SVG code

Example: For "What is 3/4 + 1/2?", create fraction bar diagrams showing 3/4 and 1/2"""
            
            svg_content = generate_svg_diagram(viz_prompt)
            if svg_content:
                problem_viz_path = module_path / f"problem-viz-q{q_idx}.svg"
                problem_viz_path.write_text(svg_content)
                print(f"✅ Problem visualization saved: {problem_viz_path.name}\n")
            else:
                print("⚠️  Problem visualization generation failed\n")
        except Exception as e:
            print(f"⚠️  Problem visualization error: {e}\n")
        
        # Process each step for this question
        print(f"3️⃣  Processing steps for question {q_idx}...")
        print("━" * 70)
        
        processed_steps = []
        
        for i, step in enumerate(module_data["steps"]):
            print(f"\n📝 STEP {i+1} of {len(module_data['steps'])}")
            print(f"   Question: \"{step['inputLabel']}\"")
            print(f"   Type: {step['visualizationType']}")
            print("   " + "─" * 60)
            
            processed_step = {
                "id": i,
                "explanation": step["explanation"],
                "inputLabel": step["inputLabel"],
                "inputPlaceholder": step["inputPlaceholder"],
                "correctAnswer": step["correctAnswer"],
                "audioExplanation": step["audioExplanation"],
                "visualizationType": step["visualizationType"],
                "modulePrompt": step.get("modulePrompt"),
                "moduleImage": step.get("moduleImage"),
                "audio": None,
                "component": None,
                "visual": None
            }
            
            # Generate audio
            if step.get("audioExplanation"):
                print("   🔊 Generating TTS audio...")
                audio_start = time.time()
                audio_path = module_path / "audio" / f"q{q_idx}-step-{i}.mp3"
                if generate_audio(step["audioExplanation"], audio_path):
                    processed_step["audio"] = f"audio/q{q_idx}-step-{i}.mp3"
                    elapsed = time.time() - audio_start
                    print(f"   ✅ Audio generated: {processed_step['audio']} ({elapsed:.1f}s)")
                else:
                    print("   ⚠️  Audio skipped (TTS unavailable)")
            
            # Generate interactive component or image
            if step["visualizationType"] == "interactive" and step.get("modulePrompt"):
                print("   🎮 Generating interactive HTML module...")
                prompt_preview = step["modulePrompt"][:80] + "..." if len(step["modulePrompt"]) > 80 else step["modulePrompt"]
                print(f"   📋 Prompt: \"{prompt_preview}\"")
                
                comp_start = time.time()
                html = generate_interactive_html(step["modulePrompt"], step)
                if html:
                    comp_path = module_path / "components" / f"q{q_idx}-step-{i}.html"
                    comp_path.write_text(html)
                    processed_step["component"] = f"components/q{q_idx}-step-{i}.html"
                    elapsed = time.time() - comp_start
                    print(f"   ✅ Component generated: {processed_step['component']} ({elapsed:.1f}s)")
            
            elif step["visualizationType"] == "image" and step.get("moduleImage"):
                print("   🖼️  Generating SVG diagram...")
                desc_preview = step["moduleImage"][:80] + "..." if len(step["moduleImage"]) > 80 else step["moduleImage"]
                print(f"   📋 Description: \"{desc_preview}\"")
                
                svg_start = time.time()
                svg = generate_svg_diagram(step["moduleImage"])
                if svg:
                    svg_path = module_path / "visuals" / f"q{q_idx}-step-{i}.svg"
                    svg_path.write_text(svg)
                    processed_step["visual"] = f"visuals/q{q_idx}-step-{i}.svg"
                    elapsed = time.time() - svg_start
                    print(f"   ✅ SVG generated: {processed_step['visual']} ({elapsed:.1f}s)")
            
            processed_steps.append(processed_step)
        
        print("\n" + "━" * 70)
        
        # Create question object
        question_data = {
            "id": q_idx - 1,  # 0-indexed for JavaScript
            "problem": {
                **module_data["problem"],
                "visualization": f"problem-viz-q{q_idx}.svg" if problem_viz_path and problem_viz_path.exists() else None
            },
            "steps": processed_steps
        }
        
        all_questions.append(question_data)
        
        print(f"\n✅ Question {q_idx} complete!")
        print(f"   📊 Steps: {len(processed_steps)}")
        print(f"   🔊 Audio files: {sum(1 for s in processed_steps if s['audio'])}")
        print(f"   🎮 Interactive components: {sum(1 for s in processed_steps if s['component'])}")
        print(f"   🖼️  Visual diagrams: {sum(1 for s in processed_steps if s['visual'])}")
    
    # Step 3: Create manifest with all questions
    print("\n" + "="*70)
    print("4️⃣  Creating manifest...")
    manifest = {
        "id": module_id,
        "questions": all_questions,
        "generated": datetime.now().isoformat(),
        "version": "2.0"  # Version 2.0 for multi-question support
    }
    
    manifest_path = module_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"✅ Manifest created: {manifest_path}")
    
    # Step 4: Summary
    overall_elapsed = time.time() - overall_start_time
    print("\n5️⃣  Module complete!")
    print("="*70)
    print(f"🎉 MODULE GENERATION COMPLETE!")
    print(f"📁 Location: {module_path}")
    print(f"📚 Total Questions: {len(all_questions)}")
    for q in all_questions:
        print(f"   Q{q['id']+1}: {len(q['steps'])} steps")
    total_audio = sum(sum(1 for s in q['steps'] if s['audio']) for q in all_questions)
    total_components = sum(sum(1 for s in q['steps'] if s['component']) for q in all_questions)
    total_visuals = sum(sum(1 for s in q['steps'] if s['visual']) for q in all_questions)
    print(f"\n📊 Total Resources:")
    print(f"   🔊 Audio files: {total_audio}")
    print(f"   🎮 Interactive components: {total_components}")
    print(f"   🖼️  Visual diagrams: {total_visuals}")
    print(f"\n⏱️  Total time: {overall_elapsed:.1f}s ({overall_elapsed/60:.1f} minutes)")
    print("\n✅ Load in browser: template.html?module=" + module_id)
    print("="*70 + "\n")
    
    # Step 5: Run evaluation loop if requested
    if args.evaluate and not args.no_evaluate:
        print("\n" + "="*70)
        print("🔍 EVALUATION PHASE")
        print("="*70)
        print("Starting automated testing and validation...\n")
        
        try:
            import asyncio
            from run_evaluator_queue import run_evaluation
            
            # Run evaluation
            asyncio.run(run_evaluation(module_id))
            
        except Exception as e:
            print(f"\n⚠️  Evaluation failed: {e}")
            print("   Module was generated successfully but testing encountered an error.")
            print("   You can manually test with: python3 run_evaluator_queue.py " + module_id)
    elif not args.evaluate:
        print("💡 Tip: Add --evaluate flag to automatically test and validate components")
        print(f"   Or run manually: python3 run_evaluator_queue.py {module_id}\n")


if __name__ == "__main__":
    main()
