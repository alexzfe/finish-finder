#!/usr/bin/env python3
"""
DSPy Prompt Optimization for MMA Predictions

This script uses DSPy to automatically optimize prompts for:
1. Finish Probability prediction (0-1)
2. Entertainment/Fun Score prediction (0-100)

Usage:
    python optimize_prompts.py --data ../data/dspy/eval_data_dspy.json

The script will:
1. Load evaluation data with ground truth
2. Define DSPy signatures for MMA predictions
3. Optimize prompts using BootstrapFewShot
4. Export optimized prompt text for use in TypeScript

Requirements:
    pip install -r requirements.txt
    export OPENAI_API_KEY="your-key"
"""

import json
import os
import sys
from pathlib import Path
from typing import Optional

import dspy
from dspy.teleprompt import BootstrapFewShot, BootstrapFewShotWithRandomSearch
import numpy as np

# ============================================
# DSPy Signatures
# ============================================

class FinishProbabilitySignature(dspy.Signature):
    """Predict the probability that an MMA fight ends in a finish (KO/TKO/Submission) rather than a decision.

    Analyze the fighters' offensive finishing ability and defensive durability to predict finish likelihood.
    """

    fighter1_context: str = dspy.InputField(desc="Fighter 1 profile including record, stance, reach, win/loss methods, finish rate")
    fighter2_context: str = dspy.InputField(desc="Fighter 2 profile including record, stance, reach, win/loss methods, finish rate")
    weight_class: str = dspy.InputField(desc="Weight class of the fight (e.g., 'Lightweight Bout', 'Heavyweight Title Fight')")

    reasoning: str = dspy.OutputField(desc="Step-by-step analysis of finish likelihood: 1) Defensive comparison, 2) Offensive finish rates, 3) Weight class adjustment, 4) Final assessment")
    finish_probability: float = dspy.OutputField(desc="Probability of finish (0.0 to 1.0), where 0.5 is average")


class FunScoreSignature(dspy.Signature):
    """Predict how entertaining an MMA fight will be on a scale of 0-100.

    Consider pace (striking output), finish likelihood, style matchup, and fight context.
    """

    fighter1_context: str = dspy.InputField(desc="Fighter 1 profile including record, stance, reach, win/loss methods, finish rate")
    fighter2_context: str = dspy.InputField(desc="Fighter 2 profile including record, stance, reach, win/loss methods, finish rate")
    weight_class: str = dspy.InputField(desc="Weight class of the fight")

    reasoning: str = dspy.OutputField(desc="Analysis of entertainment factors: pace, finish potential, style clash, stakes")
    fun_score: int = dspy.OutputField(desc="Entertainment score from 0 (boring) to 100 (must-watch)")


# ============================================
# DSPy Modules
# ============================================

class FinishPredictor(dspy.Module):
    """Module for predicting finish probability."""

    def __init__(self):
        super().__init__()
        self.predict = dspy.ChainOfThought(FinishProbabilitySignature)

    def forward(self, fighter1_context: str, fighter2_context: str, weight_class: str):
        result = self.predict(
            fighter1_context=fighter1_context,
            fighter2_context=fighter2_context,
            weight_class=weight_class
        )
        return result


class FunScorePredictor(dspy.Module):
    """Module for predicting entertainment score."""

    def __init__(self):
        super().__init__()
        self.predict = dspy.ChainOfThought(FunScoreSignature)

    def forward(self, fighter1_context: str, fighter2_context: str, weight_class: str):
        result = self.predict(
            fighter1_context=fighter1_context,
            fighter2_context=fighter2_context,
            weight_class=weight_class
        )
        return result


# ============================================
# Metrics
# ============================================

def finish_prediction_metric(example, pred, trace=None) -> float:
    """
    Metric for finish prediction quality.

    Uses Brier score (lower is better), inverted to (higher is better) for DSPy.
    Returns value between 0 and 1.
    """
    try:
        # Parse predicted probability
        predicted = float(pred.finish_probability)
        predicted = max(0.0, min(1.0, predicted))  # Clamp to [0, 1]

        # Ground truth
        actual = float(example.actual_finish)

        # Brier score (0 = perfect, 1 = worst)
        brier = (predicted - actual) ** 2

        # Invert for DSPy (higher = better)
        return 1.0 - brier

    except (ValueError, AttributeError) as e:
        print(f"Metric error: {e}")
        return 0.0


def fun_score_metric(example, pred, trace=None) -> float:
    """
    Metric for fun score prediction quality.

    Since we don't have ground truth fun scores, we use calibration against finish rate
    as a proxy (fights that finish should generally have higher fun scores).
    """
    try:
        predicted_fun = float(pred.fun_score)
        predicted_fun = max(0, min(100, predicted_fun))

        # Proxy: fights that finish should have fun_score > 50
        actual_finish = float(example.actual_finish)

        if actual_finish == 1:
            # Finished fight - reward higher fun scores
            return min(1.0, predicted_fun / 100)
        else:
            # Decision - neutral, slight preference for moderate scores
            return 1.0 - abs(50 - predicted_fun) / 100

    except (ValueError, AttributeError) as e:
        print(f"Metric error: {e}")
        return 0.0


# ============================================
# Data Loading
# ============================================

def load_eval_data(data_path: str) -> list:
    """Load evaluation data from JSON file."""
    with open(data_path, 'r') as f:
        data = json.load(f)

    # Convert to DSPy examples
    examples = []
    for item in data:
        example = dspy.Example(
            fighter1_context=item['fighter1_context'],
            fighter2_context=item['fighter2_context'],
            weight_class=item['weight_class'],
            actual_finish=item['actual_finish'],
            actual_method=item.get('actual_method', ''),
        ).with_inputs('fighter1_context', 'fighter2_context', 'weight_class')
        examples.append(example)

    return examples


# ============================================
# Optimization
# ============================================

def optimize_finish_predictor(
    train_data: list,
    val_data: list,
    max_bootstrapped_demos: int = 4,
    max_labeled_demos: int = 4,
) -> FinishPredictor:
    """Optimize finish probability predictor using DSPy."""

    print(f"\n{'='*60}")
    print("Optimizing Finish Probability Predictor")
    print(f"{'='*60}")
    print(f"Training examples: {len(train_data)}")
    print(f"Validation examples: {len(val_data)}")

    # Create base predictor
    predictor = FinishPredictor()

    # Configure optimizer
    optimizer = BootstrapFewShot(
        metric=finish_prediction_metric,
        max_bootstrapped_demos=max_bootstrapped_demos,
        max_labeled_demos=max_labeled_demos,
    )

    # Compile (optimize)
    print("\nRunning optimization...")
    optimized = optimizer.compile(predictor, trainset=train_data)

    # Evaluate
    print("\nEvaluating optimized predictor...")
    scores = []
    for example in val_data[:10]:  # Sample for evaluation
        try:
            pred = optimized(
                fighter1_context=example.fighter1_context,
                fighter2_context=example.fighter2_context,
                weight_class=example.weight_class,
            )
            score = finish_prediction_metric(example, pred)
            scores.append(score)
        except Exception as e:
            print(f"  Evaluation error: {e}")

    if scores:
        avg_score = np.mean(scores)
        print(f"Average metric score: {avg_score:.4f}")
        print(f"Equivalent Brier score: {1 - avg_score:.4f}")

    return optimized


def optimize_fun_predictor(
    train_data: list,
    val_data: list,
    max_bootstrapped_demos: int = 4,
    max_labeled_demos: int = 4,
) -> FunScorePredictor:
    """Optimize fun score predictor using DSPy."""

    print(f"\n{'='*60}")
    print("Optimizing Fun Score Predictor")
    print(f"{'='*60}")
    print(f"Training examples: {len(train_data)}")
    print(f"Validation examples: {len(val_data)}")

    # Create base predictor
    predictor = FunScorePredictor()

    # Configure optimizer
    optimizer = BootstrapFewShot(
        metric=fun_score_metric,
        max_bootstrapped_demos=max_bootstrapped_demos,
        max_labeled_demos=max_labeled_demos,
    )

    # Compile (optimize)
    print("\nRunning optimization...")
    optimized = optimizer.compile(predictor, trainset=train_data)

    return optimized


# ============================================
# Export Optimized Prompts
# ============================================

def extract_demos_from_predictor(predictor, predictor_type: str) -> list:
    """Extract demos from an optimized predictor, handling various DSPy versions."""
    demos = []

    # Try different ways demos might be stored
    predict_module = predictor.predict

    # Method 1: Direct demos attribute
    if hasattr(predict_module, 'demos') and predict_module.demos:
        for demo in predict_module.demos:
            demos.append(demo_to_dict(demo, predictor_type))

    # Method 2: Extended signature with demos
    if hasattr(predict_module, 'extended_signature'):
        sig = predict_module.extended_signature
        if hasattr(sig, 'demos') and sig.demos:
            for demo in sig.demos:
                demos.append(demo_to_dict(demo, predictor_type))

    # Method 3: Check for bootstrapped examples in state
    if hasattr(predict_module, '__dict__'):
        for key, value in predict_module.__dict__.items():
            if 'demo' in key.lower() and isinstance(value, list):
                for demo in value:
                    demos.append(demo_to_dict(demo, predictor_type))

    return demos


def demo_to_dict(demo, predictor_type: str) -> dict:
    """Convert a demo object to a dictionary."""
    if isinstance(demo, dict):
        return demo

    result = {
        'fighter1_context': getattr(demo, 'fighter1_context', ''),
        'fighter2_context': getattr(demo, 'fighter2_context', ''),
        'weight_class': getattr(demo, 'weight_class', ''),
        'reasoning': getattr(demo, 'reasoning', ''),
    }

    if predictor_type == 'finish':
        result['finish_probability'] = getattr(demo, 'finish_probability', 0.5)
    else:
        result['fun_score'] = getattr(demo, 'fun_score', 50)

    return result


def export_optimized_prompts(
    finish_predictor: FinishPredictor,
    fun_predictor: FunScorePredictor,
    output_dir: str,
    train_data: list = None,
):
    """Export optimized prompts for use in TypeScript."""

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Extract demos from predictors
    finish_demos = extract_demos_from_predictor(finish_predictor, 'finish')
    fun_demos = extract_demos_from_predictor(fun_predictor, 'fun')

    # If no demos were extracted, generate some from the training data
    if not finish_demos and train_data:
        print("  Generating demos from training data...")
        for example in train_data[:3]:
            try:
                pred = finish_predictor(
                    fighter1_context=example.fighter1_context,
                    fighter2_context=example.fighter2_context,
                    weight_class=example.weight_class,
                )
                finish_demos.append({
                    'fighter1_context': example.fighter1_context,
                    'fighter2_context': example.fighter2_context,
                    'weight_class': example.weight_class,
                    'reasoning': getattr(pred, 'reasoning', ''),
                    'finish_probability': float(getattr(pred, 'finish_probability', 0.5)),
                    'actual_finish': example.actual_finish,
                })
            except Exception as e:
                print(f"    Error generating demo: {e}")

    if not fun_demos and train_data:
        for example in train_data[:3]:
            try:
                pred = fun_predictor(
                    fighter1_context=example.fighter1_context,
                    fighter2_context=example.fighter2_context,
                    weight_class=example.weight_class,
                )
                fun_demos.append({
                    'fighter1_context': example.fighter1_context,
                    'fighter2_context': example.fighter2_context,
                    'weight_class': example.weight_class,
                    'reasoning': getattr(pred, 'reasoning', ''),
                    'fun_score': int(getattr(pred, 'fun_score', 50)),
                    'actual_finish': example.actual_finish,
                })
            except Exception as e:
                print(f"    Error generating demo: {e}")

    # Export finish predictor
    finish_output = {
        'signature': str(FinishProbabilitySignature.__doc__),
        'demos': finish_demos,
    }
    with open(output_path / 'optimized_finish_prompt.json', 'w') as f:
        json.dump(finish_output, f, indent=2)

    # Export fun predictor
    fun_output = {
        'signature': str(FunScoreSignature.__doc__),
        'demos': fun_demos,
    }
    with open(output_path / 'optimized_fun_prompt.json', 'w') as f:
        json.dump(fun_output, f, indent=2)

    print(f"\nExported optimized prompts to {output_path}")
    print(f"  - optimized_finish_prompt.json ({len(finish_demos)} demos)")
    print(f"  - optimized_fun_prompt.json ({len(fun_demos)} demos)")


# ============================================
# Main
# ============================================

def main():
    import argparse

    parser = argparse.ArgumentParser(description='DSPy prompt optimization for MMA predictions')
    parser.add_argument('--data', type=str, default='../../data/dspy/eval_data_dspy.json',
                        help='Path to evaluation data JSON')
    parser.add_argument('--output', type=str, default='../../data/dspy/optimized',
                        help='Output directory for optimized prompts')
    parser.add_argument('--model', type=str, default='gpt-4o-mini',
                        help='OpenAI model to use for optimization')
    parser.add_argument('--max-demos', type=int, default=4,
                        help='Maximum number of demos to bootstrap')
    parser.add_argument('--train-split', type=float, default=0.8,
                        help='Fraction of data to use for training')
    args = parser.parse_args()

    # Check for API key
    if not os.environ.get('OPENAI_API_KEY'):
        print("Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    # Configure DSPy with OpenAI
    print(f"Configuring DSPy with model: {args.model}")
    lm = dspy.LM(f'openai/{args.model}', temperature=0.3)
    dspy.configure(lm=lm)

    # Load data
    print(f"\nLoading data from: {args.data}")
    data_path = Path(__file__).parent / args.data
    if not data_path.exists():
        print(f"Error: Data file not found: {data_path}")
        sys.exit(1)

    all_data = load_eval_data(str(data_path))
    print(f"Loaded {len(all_data)} examples")

    # Split data
    np.random.seed(42)
    np.random.shuffle(all_data)
    split_idx = int(len(all_data) * args.train_split)
    train_data = all_data[:split_idx]
    val_data = all_data[split_idx:]

    print(f"Train: {len(train_data)}, Validation: {len(val_data)}")

    # Optimize predictors
    optimized_finish = optimize_finish_predictor(
        train_data, val_data,
        max_bootstrapped_demos=args.max_demos,
        max_labeled_demos=args.max_demos,
    )

    optimized_fun = optimize_fun_predictor(
        train_data, val_data,
        max_bootstrapped_demos=args.max_demos,
        max_labeled_demos=args.max_demos,
    )

    # Export
    output_path = Path(__file__).parent / args.output
    export_optimized_prompts(optimized_finish, optimized_fun, str(output_path), train_data)

    print("\n" + "="*60)
    print("OPTIMIZATION COMPLETE")
    print("="*60)
    print("\nNext steps:")
    print("1. Review optimized prompts in the output directory")
    print("2. Copy selected few-shot examples to TypeScript prompts")
    print("3. Update src/lib/ai/prompts/anchorExamples.ts")


if __name__ == '__main__':
    main()
