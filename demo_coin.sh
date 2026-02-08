#!/bin/bash
# Demo script for Probability and Law of Large Numbers
export GEMINI_API_KEY="AIzaSyAhjz3NTiuznQ3HqtAWwa396EfQOnRQT34"
export GOOGLE_AI_STUDIO_API_KEY="AIzaSyAhjz3NTiuznQ3HqtAWwa396EfQOnRQT34"

echo "🚀 Starting Probability Demo with foreground evaluation..."

python3 generate.py \
  "What is the theoretical probability of landing on heads when flipping a fair coin? Explain using the concept of sample space." \
  "If we flip a coin 1,000 times, the results approach 50% heads. Explain why this happens using the Law of Large Numbers." \
  "As we increase the number of coin flips, the distribution of heads follows a specific pattern. Describe how this distribution approaches a Normal Distribution (Bell Curve)." \
  --id probability-demo \
  --evaluate
