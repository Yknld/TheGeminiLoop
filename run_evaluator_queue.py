#!/usr/bin/env python3
"""
Queue-based evaluator runner with async fixes
"""

import asyncio
import sys
from pathlib import Path
from collections import deque
from typing import Dict, Any, Optional
import json
from datetime import datetime

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

class ComponentTask:
    """Represents a component to evaluate"""
    def __init__(self, module_id: str, question_index: int, step_index: int, 
                 component_type: str, attempt: int = 1, max_attempts: int = 3):
        self.module_id = module_id
        self.question_index = question_index
        self.step_index = step_index
        self.component_type = component_type
        self.attempt = attempt
        self.max_attempts = max_attempts
        self.fixing = False
        self.fix_task = None
        
    def __repr__(self):
        return f"Q{self.question_index+1} Step {self.step_index+1} (attempt {self.attempt})"

async def fix_component_async(evaluator, task: ComponentTask, current_html: str, 
                              issues: list, unnecessary: list, improvements: list, 
                              feedback: str, screenshots: list = None,
                              question_context: str = None, step_explanation: str = None,
                              learning_goal: str = None) -> Optional[str]:
    """Asynchronously fix a component with full context"""
    from evaluate_loop_clean import logger
    
    logger.info(f"   🔧 [ASYNC] Fixing {task} in background...")
    
    fix_prompt = evaluator._generate_fix_prompt(
        module_id=task.module_id,
        step_index=task.step_index,
        component_type=task.component_type,
        issues=issues,
        unnecessary_elements=unnecessary,
        ui_improvements=improvements,
        feedback=feedback,
        current_html=current_html,
        question_context=question_context,
        step_explanation=step_explanation,
        learning_goal=learning_goal
    )
    
    fixed_html = await evaluator._auto_fix_component(
        fix_prompt=fix_prompt,
        current_html=current_html,
        screenshots=screenshots
    )
    
    if fixed_html:
        logger.info(f"   ✅ [ASYNC] Fixed {task} ready!")
    else:
        logger.warning(f"   ⚠️  [ASYNC] Failed to fix {task}")
    
    return fixed_html

async def apply_fix(module_id: str, question_index: int, step_index: int, 
                    fixed_html: str, module_version: str) -> bool:
    """Apply a fix to the actual component file"""
    from evaluate_loop_clean import logger
    import shutil
    import time
    
    if module_version == "2.0":
        component_filename = f"q{question_index + 1}-step-{step_index}.html"
    else:
        component_filename = f"step-{step_index}.html"
    
    component_path = Path(f"modules/{module_id}/components/{component_filename}")
    
    if not component_path.exists():
        logger.error(f"   ❌ Component file not found: {component_path}")
        return False
    
    # Backup original with timestamp
    timestamp = int(time.time())
    backup_path = component_path.with_suffix(f'.html.backup-{timestamp}')
    try:
        shutil.copy(component_path, backup_path)
        logger.info(f"   💾 Backed up to {backup_path.name}")
    except Exception as e:
        logger.warning(f"   ⚠️  Could not create backup: {e}")
    
    # FORCE OVERWRITE - delete old file first to ensure clean write
    try:
        component_path.unlink()  # Delete old file
        component_path.write_text(fixed_html, encoding='utf-8')  # Write new content
        logger.info(f"   ✅ REPLACED {component_filename} with fixed version")
        logger.info(f"   📏 New file size: {len(fixed_html)} chars")
        return True
    except Exception as e:
        logger.error(f"   ❌ Failed to write fixed file: {e}")
        # Restore backup if write failed
        if backup_path.exists():
            shutil.copy(backup_path, component_path)
            logger.info(f"   ↩️  Restored from backup")
        return False

async def run_evaluation(module_id: str):
    """Run evaluator with async queue-based fixing
    
    Args:
        module_id: The module ID to evaluate
    """
    
    print(f"🔍 Evaluating module: {module_id}")
    print(f"🚀 Using async queue-based evaluation\n")
    
    # Import evaluator
    from evaluate_loop_clean import ModuleEvaluator, logger
    import json
    
    # Create evaluator
    evaluator = ModuleEvaluator(headless=False)
    
    try:
        # Connect
        print("🔌 Connecting to browser...")
        await evaluator.connect()
        
        # Load manifest to build initial queue
        manifest_path = Path(f"modules/{module_id}/manifest.json")
        with open(manifest_path) as f:
            manifest = json.load(f)
        
        module_version = manifest.get("version", "1.0")
        
        # Build task queue
        queue = deque()
        
        if manifest.get("questions"):
            # Multi-question module (v2.0)
            for q_idx, question in enumerate(manifest["questions"]):
                for s_idx, step in enumerate(question.get("steps", [])):
                    # Skip steps without components
                    component_path = step.get("component")
                    if not component_path or component_path == "None":
                        logger.info(f"⏭️  Skipping Q{q_idx+1} Step {s_idx+1} - no component file")
                        continue
                    
                    component_type = step.get("visual_type", "interactive")
                    if component_type in ["interactive", "image"]:
                        task = ComponentTask(module_id, q_idx, s_idx, component_type)
                        queue.append(task)
        else:
            # Single question module (v1.0)
            for s_idx, step in enumerate(manifest.get("steps", [])):
                component_type = step.get("visual_type", "interactive")
                if component_type in ["interactive", "image"]:
                    task = ComponentTask(module_id, 0, s_idx, component_type)
                    queue.append(task)
        
        total_components = len(queue)
        print(f"📊 Found {total_components} components to evaluate\n")
        
        passed_components = []
        failed_components = []
        fixing_tasks = {}  # task_id -> asyncio.Task
        evaluated_and_passed = set()  # Track components that already passed
        
        # Load previous results to skip already-passed components
        results_file = Path(f"evaluation_results/{module_id}_queue/evaluation_results.json")
        if results_file.exists():
            try:
                with open(results_file) as f:
                    prev_results = json.load(f)
                for comp in prev_results.get("passed_components", []):
                    q_idx = comp.get("question_index", 0)
                    s_idx = comp.get("step_index", 0)
                    task_id = f"q{q_idx+1}_s{s_idx}"
                    evaluated_and_passed.add(task_id)
                logger.info(f"✅ Loaded {len(evaluated_and_passed)} previously passed components - will skip them")
            except Exception as e:
                logger.warning(f"Could not load previous results: {e}")
        
        while queue or fixing_tasks:
            # Check for completed fixes
            completed_fixes = []
            for task_id, (task, fix_future, html, result) in list(fixing_tasks.items()):
                if fix_future.done():
                    try:
                        fixed_html = fix_future.result()
                        if fixed_html:
                            # Apply fix
                            await apply_fix(task.module_id, task.question_index, 
                                          task.step_index, fixed_html, module_version)
                            # Re-queue for evaluation
                            task.attempt += 1
                            task.fixing = False
                            queue.append(task)
                            logger.info(f"   ↩️  Re-queued {task} for re-evaluation")
                        else:
                            logger.warning(f"   ❌ Could not fix {task}, marking as failed")
                            failed_components.append(result)
                    except Exception as e:
                        logger.error(f"   ❌ Error fixing {task}: {e}")
                        failed_components.append(result)
                    
                    completed_fixes.append(task_id)
            
            # Remove completed fixes from tracking
            for task_id in completed_fixes:
                del fixing_tasks[task_id]
            
            # Process next item in queue
            if queue:
                task = queue.popleft()
                
                # Skip if already passed
                task_id = f"q{task.question_index+1}_s{task.step_index}"
                if task_id in evaluated_and_passed:
                    logger.info(f"⏭️  Skipping {task} - already passed")
                    continue
                
                print(f"\n{'='*70}")
                print(f"🔍 Evaluating {task}")
                print(f"{'='*70}")
                
                # Build URL
                url = f"http://localhost:8000/module-viewer.html?module={task.module_id}"
                url += f"&question={task.question_index}&step={task.step_index}"
                
                # Evaluate component
                screenshots_dir = Path(f"evaluation_results/{task.module_id}_queue") / f"q{task.question_index+1}_step_{task.step_index}"
                
                # Try evaluation with browser reconnection on failure
                max_retries = 2
                result = None
                for retry in range(max_retries):
                    try:
                        result = await evaluator.evaluate_component(
                            module_id=task.module_id,
                            step_index=task.step_index,
                            component_type=task.component_type,
                            url=url,
                            screenshots_dir=screenshots_dir,
                            question_index=task.question_index,
                            module_version=module_version,
                            step_explanation=None,
                            input_label=None
                        )
                        break  # Success!
                    except Exception as e:
                        error_msg = str(e).lower()
                        if "browser closed" in error_msg or "page has been closed" in error_msg:
                            if retry < max_retries - 1:
                                logger.warning(f"⚠️  Browser crashed, reconnecting... (retry {retry+1}/{max_retries})")
                                await evaluator.connect()
                                await asyncio.sleep(2)
                                continue
                        # Re-raise if not browser issue or out of retries
                        raise
                
                if not result:
                    logger.error(f"❌ Failed to evaluate {task} after {max_retries} retries")
                    continue
                
                # Print result
                from evaluate_loop_clean import logger
                score = result.get("score", 0)
                passed = result.get("passed", False)
                status = "✅ PASSED" if passed else "❌ FAILED"
                
                logger.info(f"{task}: {status} (Score: {score}/100)")
                
                if result.get("issues"):
                    for issue in result["issues"][:3]:
                        logger.info(f"  ⚠️  {issue}")
                
                if passed:
                    task_id = f"q{task.question_index+1}_s{task.step_index}"
                    evaluated_and_passed.add(task_id)  # Mark as permanently passed
                    passed_components.append(result)
                    logger.info(f"✓ {len(passed_components)}/{total_components} passed")
                    logger.info(f"✅ {task} is DONE - will not be re-evaluated")
                else:
                    # Check if we should fix or give up
                    logger.info(f"  🔍 Component failed - checking if should fix (attempt {task.attempt}/{task.max_attempts})")
                    if task.attempt >= task.max_attempts:
                        logger.warning(f"  ❌ Max attempts ({task.max_attempts}) reached, giving up")
                        failed_components.append(result)
                    else:
                        # Start async fix
                        component_filename = (f"q{task.question_index + 1}-step-{task.step_index}.html" 
                                            if module_version == "2.0" 
                                            else f"step-{task.step_index}.html")
                        component_path = Path(f"modules/{task.module_id}/components/{component_filename}")
                        logger.info(f"  📁 Looking for: {component_path}")
                        
                        if component_path.exists():
                            logger.info(f"  ✓ File exists, preparing fix...")
                            current_html = component_path.read_text()
                            
                            # Load educational context from manifest
                            question_context = None
                            step_explanation = None
                            learning_goal = None
                            try:
                                if manifest.get("questions") and task.question_index < len(manifest["questions"]):
                                    q = manifest["questions"][task.question_index]
                                    question_context = q.get("question", "")
                                    
                                    if task.step_index < len(q.get("steps", [])):
                                        step = q["steps"][task.step_index]
                                        step_explanation = step.get("explanation", "")
                                        learning_goal = step.get("input_label", "")
                            except Exception as e:
                                logger.warning(f"Could not load context for {task}: {e}")
                            
                            # Get screenshots from result
                            screenshots = [Path(s) for s in result.get("screenshots", [])]
                            
                            # Start fix in background
                            task.fixing = True
                            fix_future = asyncio.create_task(
                                fix_component_async(
                                    evaluator, task, current_html,
                                    result.get("issues", []),
                                    result.get("unnecessary_elements", []),
                                    result.get("ui_improvements", []),
                                    result.get("feedback", ""),
                                    screenshots=screenshots,
                                    question_context=question_context,
                                    step_explanation=step_explanation,
                                    learning_goal=learning_goal
                                )
                            )
                            
                            task_id = f"q{task.question_index+1}_s{task.step_index}"
                            
                            # Don't fix if already being fixed
                            if task_id in fixing_tasks:
                                logger.warning(f"  ⚠️  {task} already being fixed, skipping")
                            else:
                                fixing_tasks[task_id] = (task, fix_future, current_html, result)
                                logger.info(f"  🔄 Sent to fixer (attempt {task.attempt}/{task.max_attempts})")
                        else:
                            logger.error(f"  ❌ Component file not found: {component_path}")
            
            # Brief pause if queue is empty but fixes are pending
            if not queue and fixing_tasks:
                print(f"\n⏳ Waiting for {len(fixing_tasks)} fix(es) to complete...")
                await asyncio.sleep(2)
        
        # Final summary
        total_passed = len(passed_components)
        total_failed = len(failed_components)
        total_evaluated = total_passed + total_failed
        all_passed = total_failed == 0
        
        print("\n" + "="*70)
        print("🏁 FINAL SUMMARY")
        print("="*70)
        print(f"Module: {module_id}")
        print(f"Total Components: {total_components}")
        print(f"Evaluated: {total_evaluated}")
        print(f"Passed: {total_passed} ✅")
        print(f"Failed: {total_failed} ❌")
        print(f"Status: {'✅ ALL PASSED' if all_passed else '❌ SOME FAILED'}")
        print("="*70 + "\n")
        
        # Save results to JSON
        results_dir = Path(f"evaluation_results/{module_id}_queue")
        results_dir.mkdir(parents=True, exist_ok=True)
        results_file = results_dir / "evaluation_results.json"
        
        results_data = {
            "module_id": module_id,
            "timestamp": datetime.now().isoformat(),
            "total_components": total_components,
            "evaluated": total_evaluated,
            "passed": total_passed,
            "failed": total_failed,
            "all_passed": all_passed,
            "passed_components": passed_components,
            "failed_components": failed_components
        }
        
        with open(results_file, 'w') as f:
            json.dump(results_data, f, indent=2)
        
        logger.info(f"📁 Results saved to: {results_file}")
        
        if failed_components:
            print("\nFailed components:")
            for result in failed_components:
                score = result.get("score", 0)
                q_idx = result.get('question_index', 0)
                s_idx = result.get('step_index', 0)
                print(f"  - Q{q_idx+1} Step {s_idx+1}: {score}/100")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if evaluator.mcp:
            await evaluator.mcp.close()
            print("\n👋 Browser closed")

async def main():
    """Command-line entry point"""
    if len(sys.argv) < 2:
        print("Usage: python3 run_evaluator_queue.py MODULE_ID")
        print("Example: python3 run_evaluator_queue.py test-5q")
        sys.exit(1)
    
    module_id = sys.argv[1]
    await run_evaluation(module_id)

if __name__ == "__main__":
    asyncio.run(main())
