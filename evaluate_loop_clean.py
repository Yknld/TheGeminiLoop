#!/usr/bin/env python3
"""
Module Evaluator - Test each module component with browser automation + AI

Directly uses browser tools to interact with components and Gemini vision to evaluate
"""

import asyncio
import sys
import os
import logging
from pathlib import Path
from datetime import datetime
import json
from typing import Dict, Any, List
import re

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load API key from index.html
def load_api_key():
    """Load Gemini API key from index.html"""
    html_path = Path(__file__).parent / "index.html"
    if html_path.exists():
        content = html_path.read_text()
        match = re.search(r'<meta name="gemini-api-key" content="([^"]+)"', content)
        if match:
            return match.group(1)
    return None

# Set API key
api_key = load_api_key()
if api_key:
    os.environ["GOOGLE_AI_STUDIO_API_KEY"] = api_key
    logger.info("✅ Loaded Gemini API key from index.html")
else:
    logger.warning("⚠️  No API key found in index.html")

# Add GeminiLoop to path
sys.path.insert(0, str(Path(__file__).parent.parent / "match-me" / "GeminiLoop"))

import google.generativeai as genai
genai.configure(api_key=api_key)


class ModuleEvaluator:
    """Evaluates individual module components using direct browser automation"""
    
    def __init__(self, headless=False):
        self.headless = headless
        self.mcp = None
        # Use same model as generate.py - gemini-2.5-flash supports vision
        self.gemini_model = genai.GenerativeModel('models/gemini-2.5-flash')
        
    async def connect(self):
        """Initialize browser-use client"""
        try:
            from qa_browseruse_mcp.client import BrowserUseMCPClient
            self.mcp = BrowserUseMCPClient(headless=self.headless)
            await self.mcp.connect()
            logger.info("✅ Connected to BrowserUse MCP Client")
        except ImportError:
            logger.error("❌ BrowserUse MCP client not found. Is Docker running?")
            raise
    
    async def evaluate_component(
        self,
        module_id: str,
        step_index: int,
        component_type: str,
        url: str,
        screenshots_dir: Path,
        question_index: int = 0,
        module_version: str = "1.0",
        step_explanation: str = None,
        input_label: str = None
    ) -> Dict[str, Any]:
        """
        Evaluate a single component using browser automation + Gemini vision
        
        Returns:
            {
                "score": int (0-100),
                "passed": bool,
                "issues": List[str],
                "fix_prompt": str | None,
                "feedback": str
            }
        """
        logger.info(f"\n{'='*70}")
        logger.info(f"📊 Evaluating {module_id} - Step {step_index + 1} ({component_type})")
        logger.info(f"{'='*70}\n")
        
        screenshots_dir.mkdir(parents=True, exist_ok=True)
        screenshots = []
        interaction_log = []
        
        try:
            # Navigate to component
            logger.info(f"🌐 Navigating to: {url}")
            try:
                await self.mcp.call_tool("browser_evaluate", {
                    "expression": f"window.location.href = '{url}'"
                })
                await asyncio.sleep(4)
                logger.info("✅ Component loaded")
            except Exception as nav_err:
                logger.error(f"❌ Navigation failed: {nav_err}")
                raise Exception(f"Browser closed or navigation failed: {nav_err}")
            
            # Take initial screenshot
            screenshot_path = screenshots_dir / "initial.png"
            try:
                logger.info(f"Taking screenshot: {screenshot_path}")
                await self.mcp.call_tool("browser_take_screenshot", {
                    "fullPage": True,
                    "filename": str(screenshot_path)
                })
                screenshots.append(screenshot_path)
                logger.info(f"📸 Initial screenshot")
                interaction_log.append("Initial state captured")
            except Exception as ss_err:
                logger.error(f"Screenshot failed: {ss_err}")
                raise Exception(f"Browser closed or screenshot failed: {ss_err}")
            
            # If interactive, test the elements
            if component_type == "interactive":
                logger.info("🎮 Testing interactive elements...")
                
                # Test sliders
                sliders = await self.mcp.call_tool("browser_evaluate", {
                    "expression": """
                        Array.from(document.querySelectorAll('input[type="range"]')).map((s, i) => ({
                            index: i,
                            min: parseFloat(s.min) || 0,
                            max: parseFloat(s.max) || 100,
                            value: parseFloat(s.value) || 0
                        }))
                    """
                })
                
                sliders = sliders.get("result", []) if isinstance(sliders, dict) else sliders or []
                
                if sliders:
                    logger.info(f"   Found {len(sliders)} slider(s)")
                    for i, slider in enumerate(sliders[:3]):
                        mid = (slider['min'] + slider['max']) / 2
                        await self.mcp.call_tool("browser_evaluate", {
                            "expression": f"""
                                (function() {{
                                    const s = document.querySelectorAll('input[type="range"]')[{i}];
                                    if (s) {{
                                        s.value = {mid};
                                        s.dispatchEvent(new Event('input', {{ bubbles: true }}));
                                        s.dispatchEvent(new Event('change', {{ bubbles: true }}));
                                    }}
                                }})()
                            """
                        })
                        await asyncio.sleep(1)
                        logger.info(f"   ✓ Moved slider {i+1} to {mid}")
                        interaction_log.append(f"Moved slider {i+1} to value {mid}")
                    
                    screenshot_path = screenshots_dir / "after_sliders.png"
                    try:
                        logger.info(f"Taking screenshot: {screenshot_path}")
                        await self.mcp.call_tool("browser_take_screenshot", {
                            "fullPage": True,
                            "filename": str(screenshot_path)
                        })
                        screenshots.append(screenshot_path)
                        logger.info("   📸 Screenshot after sliders")
                    except Exception as ss_err:
                        logger.error(f"Screenshot failed: {ss_err}")
                        raise Exception(f"Browser closed during interaction: {ss_err}")
                
                # Test inputs
                inputs = await self.mcp.call_tool("browser_evaluate", {
                    "expression": """
                        Array.from(document.querySelectorAll('input[type="text"], input[type="number"]')).map((inp, i) => ({
                            index: i,
                            type: inp.type
                        }))
                    """
                })
                
                inputs = inputs.get("result", []) if isinstance(inputs, dict) else inputs or []
                
                if inputs:
                    logger.info(f"   Found {len(inputs)} input(s)")
                    for i, inp in enumerate(inputs[:3]):
                        test_val = "5" if inp['type'] == 'number' else "test"
                        await self.mcp.call_tool("browser_evaluate", {
                            "expression": f"""
                                (function() {{
                                    const inp = document.querySelectorAll('input[type="text"], input[type="number"]')[{i}];
                                    if (inp) {{
                                        inp.value = '{test_val}';
                                        inp.dispatchEvent(new Event('input', {{ bubbles: true }}));
                                        inp.dispatchEvent(new Event('change', {{ bubbles: true }}));
                                    }}
                                }})()
                            """
                        })
                        await asyncio.sleep(1)
                        logger.info(f"   ✓ Typed '{test_val}' in input {i+1}")
                        interaction_log.append(f"Typed '{test_val}' in input {i+1}")
                    
                    screenshot_path = screenshots_dir / "after_inputs.png"
                    try:
                        logger.info(f"Taking screenshot: {screenshot_path}")
                        await self.mcp.call_tool("browser_take_screenshot", {
                            "fullPage": True,
                            "filename": str(screenshot_path)
                        })
                        screenshots.append(screenshot_path)
                        logger.info("   📸 Screenshot after inputs")
                    except Exception as ss_err:
                        logger.error(f"Screenshot failed: {ss_err}")
                        raise Exception(f"Browser closed during interaction: {ss_err}")
                
                # Test buttons
                buttons = await self.mcp.call_tool("browser_evaluate", {
                    "expression": """
                        Array.from(document.querySelectorAll('button')).map((btn, i) => ({
                            index: i,
                            text: btn.textContent.trim().substring(0, 30)
                        }))
                    """
                })
                
                buttons = buttons.get("result", []) if isinstance(buttons, dict) else buttons or []
                
                if buttons:
                    logger.info(f"   Found {len(buttons)} button(s)")
                    for i, btn in enumerate(buttons[:2]):
                        await self.mcp.call_tool("browser_evaluate", {
                            "expression": f"""
                                (function() {{
                                    const btn = document.querySelectorAll('button')[{i}];
                                    if (btn) btn.click();
                                }})()
                            """
                        })
                        await asyncio.sleep(1)
                        logger.info(f"   ✓ Clicked button '{btn['text']}'")
                        interaction_log.append(f"Clicked button '{btn['text']}'")
                    
                    screenshot_path = screenshots_dir / "after_buttons.png"
                    try:
                        logger.info(f"Taking screenshot: {screenshot_path}")
                        await self.mcp.call_tool("browser_take_screenshot", {
                            "fullPage": True,
                            "filename": str(screenshot_path)
                        })
                        screenshots.append(screenshot_path)
                        logger.info("   📸 Screenshot after buttons")
                    except Exception as ss_err:
                        logger.error(f"Screenshot failed: {ss_err}")
                        raise Exception(f"Browser closed during interaction: {ss_err}")
            
            # Evaluate with Gemini vision
            logger.info("🔍 Evaluating with Gemini vision...")
            result = await self._evaluate_with_gemini(
                component_type=component_type,
                screenshots=screenshots,
                interaction_log=interaction_log,
                step_explanation=step_explanation,
                input_label=input_label
            )
            
            # Process result
            score = result['score']
            passed = score >= 70  # Reasonable threshold - works well = pass
            issues = result['issues']
            unnecessary_elements = result.get('unnecessary_elements', [])
            ui_improvements = result.get('ui_improvements', [])
            
            # Generate fix prompt with HTML if has issues
            fix_prompt = None
            fixed_html = None
            
            if not passed or issues or unnecessary_elements or ui_improvements:
                # Load the current HTML (handle v2.0 multi-question naming)
                if module_version == "2.0":
                    component_filename = f"q{question_index + 1}-step-{step_index}.html"
                else:
                    component_filename = f"step-{step_index}.html"
                
                component_path = Path(f"modules/{module_id}/components/{component_filename}")
                current_html = component_path.read_text() if component_path.exists() else None
                
                if current_html:
                    # Load manifest for educational context
                    question_context = None
                    try:
                        manifest_path = Path(f"modules/{module_id}/manifest.json")
                        if manifest_path.exists():
                            import json
                            with open(manifest_path) as f:
                                manifest = json.load(f)
                            
                            # Get question text
                            if manifest.get("questions") and question_index < len(manifest["questions"]):
                                q = manifest["questions"][question_index]
                                question_context = q.get("question", "")
                    except Exception as e:
                        logger.warning(f"Could not load manifest context: {e}")
                    
                    fix_prompt = self._generate_fix_prompt(
                        module_id=module_id,
                        step_index=step_index,
                        component_type=component_type,
                        issues=issues,
                        unnecessary_elements=unnecessary_elements,
                        ui_improvements=ui_improvements,
                        feedback=result['feedback'],
                        current_html=current_html,
                        question_context=question_context,
                        step_explanation=step_explanation,
                        learning_goal=input_label
                    )
                    
                    # Auto-fix if score is below 75 (DISABLED for queue-based runner)
                    # Queue-based runner handles fixes asynchronously
                    if not passed and False:  # Disabled - use run_evaluator_queue.py instead
                        logger.info(f"   🔧 Auto-fixing component (score: {score}/100)...")
                        fixed_html = await self._auto_fix_component(
                            fix_prompt=fix_prompt,
                            current_html=current_html,
                            screenshots=screenshots
                        )
                        
                        if fixed_html:
                            # Save fixed version (use same naming as component)
                            fixed_filename = component_filename.replace('.html', '.fixed.html')
                            fixed_path = component_path.parent / fixed_filename
                            fixed_path.write_text(fixed_html)
                            logger.info(f"   ✅ Fixed version saved to: {fixed_path}")
                else:
                    fix_prompt = "Component HTML file not found"
            
            return {
                "score": score,
                "passed": passed,
                "issues": issues,
                "unnecessary_elements": unnecessary_elements,
                "ui_improvements": ui_improvements,
                "fix_prompt": fix_prompt,
                "fixed_html": fixed_html,
                "feedback": result['feedback'],
                "screenshots": [str(s) for s in screenshots],
                "question_index": question_index,
                "step_index": step_index
            }
            
        except Exception as e:
            logger.error(f"❌ Error evaluating component: {e}")
            import traceback
            traceback.print_exc()
            return {
                "score": 0,
                "passed": False,
                "issues": [f"Evaluation error: {str(e)}"],
                "fix_prompt": None,
                "feedback": "Failed to evaluate",
                "screenshots": [],
                "question_index": question_index,
                "step_index": step_index
            }
    
    async def _evaluate_with_gemini(
        self,
        component_type: str,
        screenshots: List[Path],
        interaction_log: List[str],
        step_explanation: str = None,
        input_label: str = None
    ) -> Dict[str, Any]:
        """Evaluate using Gemini vision"""
        import PIL.Image
        
        # Load all screenshots
        images = [PIL.Image.open(p) for p in screenshots]
        
        # Build prompt
        interaction_summary = "\n".join(f"- {log}" for log in interaction_log)
        
        # Build context section
        context_section = ""
        if step_explanation or input_label:
            context_section = "\n**EDUCATIONAL CONTEXT:**\n"
            if step_explanation:
                context_section += f"Step Purpose: {step_explanation[:300]}\n"
            if input_label:
                context_section += f"Learning Goal: {input_label}\n"
            context_section += "\n⚠️ IMPORTANT: Consider the pedagogical intent. This step may intentionally omit details that come in later steps.\n"
        
        if component_type == "interactive":
            prompt = f"""Evaluate this educational component. The screenshots show it before and after interactions.

{interaction_summary}

Rate it 0-100 based on these simple criteria:

1. **Does it work?** (30 pts)
   - Buttons/sliders respond
   - Shows visual changes when interacted with
   - Not broken or crashing

2. **Is it usable?** (30 pts)
   - Layout makes sense
   - Clear what to do
   - Feedback appears when you interact

3. **Looks reasonable?** (20 pts)
   - Not ugly or confusing
   - Colors/text are readable
   - Organized layout

4. **Teaches the concept?** (20 pts)
   - Helps students understand
   - Interactive learning happens

**Scoring:**
- 0-60: Broken (doesn't work)
- 61-74: Works but poor UX
- 75+: Good (works, usable, makes sense)

Respond in JSON:
{{
    "score": <0-100>,
    "feedback": "<brief assessment>",
    "issues": ["<major issue>"],
    "unnecessary_elements": [],
    "ui_improvements": []
}}"""
        else:
            prompt = f"""Evaluate this SVG diagram. Rate 0-100:
- Clarity and readability
- Educational value
- Visual quality

Respond in JSON:
{{
    "score": <0-100>,
    "feedback": "<brief assessment>",
    "issues": ["<issue if any>"]
}}"""
        
        # Call Gemini
        content = [prompt] + images
        response = await asyncio.to_thread(
            self.gemini_model.generate_content,
            content
        )
        
        # Parse response
        try:
            text = response.text
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                result = json.loads(json_match.group(0))
                # Ensure all fields exist
                result.setdefault('unnecessary_elements', [])
                result.setdefault('ui_improvements', [])
                result.setdefault('issues', [])
                return result
            else:
                return {
                    "score": 50,
                    "feedback": text,
                    "issues": ["Could not parse evaluation"],
                    "unnecessary_elements": [],
                    "ui_improvements": []
                }
        except Exception as e:
            logger.error(f"Error parsing Gemini response: {e}")
            return {
                "score": 50,
                "feedback": response.text if hasattr(response, 'text') else str(response),
                "issues": [f"Parse error: {str(e)}"],
                "unnecessary_elements": [],
                "ui_improvements": []
            }
    
    async def _auto_fix_component(
        self,
        fix_prompt: str,
        current_html: str,
        screenshots: List[Path] = None
    ) -> str:
        """Use Gemini to automatically fix the component with visual context"""
        try:
            import PIL.Image
            
            # Build content with screenshots for visual context
            content = [fix_prompt]
            
            # Add screenshots so AI can SEE what's broken
            if screenshots:
                content.append("\n**VISUAL EVIDENCE (Screenshots showing the issues):**")
                for screenshot in screenshots:
                    if screenshot.exists():
                        try:
                            img = PIL.Image.open(screenshot)
                            content.append(img)
                        except Exception as e:
                            logger.warning(f"Could not load screenshot {screenshot}: {e}")
            
            content.append(f"""

**Current HTML Code:**
```html
{current_html}
```

**CRITICAL INSTRUCTIONS:**
1. PRESERVE all working interactive elements (sliders, buttons, inputs)
2. PRESERVE all JavaScript functionality that works
3. ONLY fix the specific issues mentioned above
4. If interactions work, do not change the JS logic
5. Focus on fixing: styling, colors, spacing, feedback text, layout
6. Keep the component self-contained (inline CSS/JS)
7. Return COMPLETE working HTML (do not remove anything functional)

Generate the COMPLETE fixed HTML. Return ONLY the HTML code, no explanations.""")
            
            logger.info("⏳ Waiting for Gemini response...")
            response = await asyncio.to_thread(
                self.gemini_model.generate_content,
                content
            )
            
            # Extract HTML from response
            text = response.text
            
            logger.info("\n" + "=" * 80)
            logger.info("✅ GEMINI RESPONSE RECEIVED")
            logger.info("=" * 80)
            logger.info(f"📦 Response length: {len(text)} chars")
            logger.info(f"📄 First 400 chars:\n{text[:400]}...")
            logger.info("=" * 80)
            
            # Try to extract code block
            code_match = re.search(r'```html\n([\s\S]*?)\n```', text)
            if code_match:
                return code_match.group(1)
            
            # Try without language tag
            code_match = re.search(r'```\n([\s\S]*?)\n```', text)
            if code_match:
                return code_match.group(1)
            
            # If no code block, check if it starts with <!DOCTYPE or <html
            if text.strip().startswith('<!DOCTYPE') or text.strip().startswith('<html'):
                return text.strip()
            
            logger.warning("Could not extract HTML from Gemini response")
            return None
            
        except Exception as e:
            logger.error(f"Error auto-fixing component: {e}")
            return None
    
    def _generate_fix_prompt(
        self,
        module_id: str,
        step_index: int,
        component_type: str,
        issues: List[str],
        unnecessary_elements: List[str],
        ui_improvements: List[str],
        feedback: str,
        current_html: str,
        question_context: str = None,
        step_explanation: str = None,
        learning_goal: str = None
    ) -> str:
        """Generate a prompt for fixing the component with full educational context"""
        
        issues_text = "\n".join(f"- {issue}" for issue in issues) if issues else "None"
        unnecessary_text = "\n".join(f"- {elem}" for elem in unnecessary_elements) if unnecessary_elements else "None"
        improvements_text = "\n".join(f"- {imp}" for imp in ui_improvements) if ui_improvements else "None"
        
        # Build educational context section
        context_section = ""
        if question_context or step_explanation or learning_goal:
            context_section = "\n**EDUCATIONAL CONTEXT (What this component teaches):**\n"
            if question_context:
                context_section += f"Question: {question_context}\n"
            if step_explanation:
                context_section += f"Step Purpose: {step_explanation}\n"
            if learning_goal:
                context_section += f"Learning Goal: {learning_goal}\n"
            context_section += "\n"
        
        if component_type == "interactive":
            return f"""Fix this interactive homework component for Step {step_index + 1}.
{context_section}

**Evaluator Assessment:**
{feedback}

**Specific Issues to Fix:**
{issues_text}

**Elements to Remove (if present):**
{unnecessary_text}

**UI/UX Improvements Needed:**
{improvements_text}

**YOUR TASK:**
Fix ONLY the issues listed above. Do NOT rewrite the entire component from scratch.

**What to PRESERVE:**
- All working JavaScript functionality (event listeners, calculations, animations)
- Core interactive elements (sliders, buttons, inputs) and their behavior
- Any working visual feedback mechanisms
- The component educational purpose (see context above)

**What to FIX:**
- Styling issues (colors, spacing, alignment, fonts)
- Unclear or missing feedback text
- Layout problems
- Unnecessary or duplicate UI elements
- Broken interactions (if any)

**Design Requirements:**
- Clean, minimal, modern design (no clutter)
- Good contrast and readability
- Appropriate colors (not garish)
- Instant visual feedback on interactions
- Self-contained (inline CSS/JS, no external deps)
- Professional appearance (no placeholder or TODO text)"""
        
        elif component_type == "image":
            return f"""The SVG diagram for Step {step_index + 1} needs improvement.

Issues found:
{issues_text}

Evaluator feedback:
{feedback}

Please regenerate this SVG diagram with these fixes:
1. Improve clarity and readability
2. Ensure labels are visible and correct
3. Use appropriate colors and styling
4. Make it more educational and relevant
5. Ensure high visual quality

The SVG should be clean, accurate, and help students understand the concept."""
        
        else:
            return f"""Component needs improvement.

Issues:
{issues_text}

Feedback:
{feedback}

Please fix these issues and regenerate the component."""
    
    async def evaluate_module(
        self,
        module_id: str,
        base_url: str = "http://localhost:8000"
    ) -> Dict[str, Any]:
        """
        Evaluate all components in a module
        
        Args:
            module_id: The module ID (e.g., "test-001")
            base_url: Base URL where the module is served
            
        Returns:
            {
                "module_id": str,
                "overall_score": float,
                "overall_passed": bool,
                "steps": List[Dict],
                "summary": str
            }
        """
        logger.info(f"\n{'='*70}")
        logger.info(f"🔍 EVALUATING MODULE: {module_id}")
        logger.info(f"{'='*70}\n")
        
        # Load manifest
        manifest_path = Path(f"modules/{module_id}/manifest.json")
        if not manifest_path.exists():
            logger.error(f"❌ Manifest not found: {manifest_path}")
            return {
                "module_id": module_id,
                "overall_score": 0,
                "overall_passed": False,
                "steps": [],
                "summary": "Module not found"
            }
        
        with open(manifest_path) as f:
            manifest = json.load(f)
        
        # Create screenshots directory
        screenshots_dir = Path(f"evaluation_results/{module_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        screenshots_dir.mkdir(parents=True, exist_ok=True)
        
        # Handle v2.0 multi-question manifests
        step_results = []
        if manifest.get("version") == "2.0" and "questions" in manifest:
            logger.info(f"📚 Multi-question module (v2.0) with {len(manifest['questions'])} questions")
            
            # Evaluate all questions
            for q_idx, question_data in enumerate(manifest["questions"]):
                logger.info(f"\n{'='*70}")
                logger.info(f"❓ QUESTION {q_idx + 1}: {question_data.get('problem', {}).get('title', 'Untitled')}")
                logger.info(f"{'='*70}\n")
                
                for i, step in enumerate(question_data.get("steps", [])):
                    # Build URL for isolated component viewer (v2.0 format)
                    url = f"{base_url}/module-viewer.html?module={module_id}&question={q_idx}&step={i}"
                    
                    # Determine component type
                    component_type = step.get("visualizationType", "interactive")
                    
                    # Extract educational context
                    step_explanation = step.get("explanation", "")
                    input_label = step.get("inputLabel", "")
                    
                    # Evaluate the component
                    result = await self.evaluate_component(
                        module_id=module_id,
                        step_index=i,
                        component_type=component_type,
                        url=url,
                        screenshots_dir=screenshots_dir / f"q{q_idx+1}_step_{i}",
                        question_index=q_idx,
                        module_version="2.0",
                        step_explanation=step_explanation,
                        input_label=input_label
                    )
                    
                    result["step_index"] = i
                    result["question_index"] = q_idx
                    result["step_title"] = step.get("explanation", "")[:100]
                    step_results.append(result)
                    
                    # Print result
                    status = "✅ PASSED" if result["passed"] else "❌ NEEDS FIX"
                    logger.info(f"Q{q_idx+1} Step {i + 1}: {status} (Score: {result['score']}/100)")
                    
                    if result["issues"]:
                        for issue in result["issues"]:
                            logger.info(f"  ⚠️  {issue}")
        else:
            # Single question (v1.0)
            logger.info(f"📄 Single-question module (v1.0)")
            for i, step in enumerate(manifest.get("steps", [])):
                # Build URL for isolated component viewer
                url = f"{base_url}/module-viewer.html?module={module_id}&step={i}"
                
                # Determine component type
                component_type = step.get("visualizationType", "interactive")
                
                # Extract educational context
                step_explanation = step.get("explanation", "")
                input_label = step.get("inputLabel", "")
                
                # Evaluate the component
                result = await self.evaluate_component(
                    module_id=module_id,
                    step_index=i,
                    component_type=component_type,
                    url=url,
                    screenshots_dir=screenshots_dir / f"step_{i}",
                    question_index=0,
                    module_version="1.0",
                    step_explanation=step_explanation,
                    input_label=input_label
                )
                
                result["step_index"] = i
                result["step_title"] = step.get("explanation", "")[:100]
                step_results.append(result)
                
                # Print result
                status = "✅ PASSED" if result["passed"] else "❌ NEEDS FIX"
                logger.info(f"Step {i + 1}: {status} (Score: {result['score']}/100)")
                
                if result["issues"]:
                    for issue in result["issues"]:
                        logger.info(f"  ⚠️  {issue}")
        
        # Calculate overall score
        if step_results:
            overall_score = sum(r["score"] for r in step_results) / len(step_results)
            overall_passed = all(r["passed"] for r in step_results)
        else:
            overall_score = 0
            overall_passed = False
        
        # Generate summary
        passed_count = sum(1 for r in step_results if r["passed"])
        failed_count = len(step_results) - passed_count
        
        status_text = '✅ ALL PASSED' if overall_passed else f'❌ {failed_count} NEED FIXING'
        summary = (
            f"Module Evaluation Summary:\n"
            f"- Total Steps: {len(step_results)}\n"
            f"- Passed: {passed_count}\n"
            f"- Failed: {failed_count}\n"
            f"- Overall Score: {overall_score:.1f}/100\n"
            f"- Status: {status_text}"
        )
        
        result = {
            "module_id": module_id,
            "module_version": manifest.get("version", "1.0"),
            "overall_score": overall_score,
            "overall_passed": overall_passed,
            "steps": step_results,
            "summary": summary,
            "evaluation_time": datetime.now().isoformat(),
            "screenshots_dir": str(screenshots_dir)
        }
        
        # Save results
        results_file = screenshots_dir / "evaluation_results.json"
        with open(results_file, 'w') as f:
            json.dump(result, f, indent=2)
        
        logger.info(f"\n{summary}\n")
        logger.info(f"📁 Results saved to: {results_file}")
        
        return result
    
    async def close(self):
        """Close browser connection"""
        if self.mcp:
            await self.mcp.close()


async def main():
    """CLI interface"""
    if len(sys.argv) < 2:
        print("Usage: python evaluate_module.py <module-id> [--headless]")
        print("Example: python evaluate_module.py test-001")
        return 1
    
    module_id = sys.argv[1]
    headless = "--headless" in sys.argv
    
    print(f"\n{'='*70}")
    print(f"🔬 MODULE EVALUATOR")
    print(f"{'='*70}\n")
    print(f"📦 Module: {module_id}")
    print(f"🌐 Browser: {'Headless' if headless else 'Visible'}")
    print(f"🤖 Method: Browser automation + Gemini vision")
    print()
    
    evaluator = ModuleEvaluator(headless=headless)
    
    try:
        await evaluator.connect()
        result = await evaluator.evaluate_module(module_id)
        
        # Print detailed results
        print(f"\n{'='*70}")
        print(f"📊 DETAILED RESULTS")
        print(f"{'='*70}\n")
        
        for step_result in result["steps"]:
            print(f"\n📝 Step {step_result['step_index'] + 1}:")
            print(f"   Score: {step_result['score']}/100")
            print(f"   Status: {'✅ PASSED' if step_result['passed'] else '❌ FAILED'}")
            
            if step_result["issues"]:
                print(f"   Issues:")
                for issue in step_result["issues"]:
                    print(f"      ⚠️  {issue}")
            
            if step_result.get("unnecessary_elements"):
                print(f"   Unnecessary Elements:")
                for elem in step_result["unnecessary_elements"]:
                    print(f"      🗑️  {elem}")
            
            if step_result.get("ui_improvements"):
                print(f"   UI Improvements:")
                for imp in step_result["ui_improvements"]:
                    print(f"      ✨  {imp}")
            
            if step_result.get("fixed_html"):
                print(f"   ✅ Auto-fixed version saved!")
            
            if step_result["fix_prompt"] and not step_result.get("fixed_html"):
                print(f"\n   🔧 FIX PROMPT:")
                print("   " + "\n   ".join(step_result["fix_prompt"].split("\n")[:10]))
        
        print(f"\n{'='*70}")
        print(result["summary"])
        print(f"{'='*70}\n")
        
        return 0 if result["overall_passed"] else 1
        
    except Exception as e:
        logger.error(f"❌ Evaluation failed: {e}", exc_info=True)
        return 1
    
    finally:
        logger.info("Closing browser session...")
        await evaluator.close()
        logger.info("Browser session closed")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
