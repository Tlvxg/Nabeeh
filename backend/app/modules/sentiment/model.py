"""Singleton model manager for Arabic sentiment analysis using MARBERTv2 ONNX.

The base MARBERT model was trained on Twitter sentiment (KAUST dataset) and
classifies almost all financial news headlines as neutral because news text is
factual rather than emotional. To produce useful sentiment for a stock analysis
platform, we apply a **financial keyword boost** on top of the model's softmax
probabilities: Arabic financial keywords (profit, loss, rise, decline, etc.)
shift probability mass toward positive or negative, then we re-pick the
argmax. This hybrid approach keeps the model as primary signal while adding
domain-specific financial context.
"""

import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

# ONNX model cache directory (backend/models/arabic-marbert-sentiment-onnx)
# model.py is at backend/app/modules/sentiment/model.py
#   parent = sentiment/, parent.parent = modules/, parent.parent.parent = app/, .parent = backend/
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent

# ---------------------------------------------------------------------------
# Financial keyword lists for sentiment boosting
# Each keyword has a weight (positive = bullish, negative = bearish).
# Weights are added to the model's log-probabilities before re-softmax.
# ---------------------------------------------------------------------------
_POSITIVE_KEYWORDS: list[tuple[str, float]] = [
    # Directional verbs / adjectives — these carry sentiment
    ("ارتفاع", 6.0),
    ("ارتفع", 6.0),
    ("يرتفع", 6.0),
    ("ترتفع", 6.0),
    ("صعود", 6.0),
    ("يصعد", 6.0),
    ("نمو", 6.0),
    ("مكاسب", 6.5),
    ("تحسن", 6.0),
    ("زيادة", 5.5),
    ("رفع", 5.0),
    ("يرفع", 5.0),
    ("أعلى", 4.0),
    ("أفضل", 4.0),
    # Strong sentiment adjectives
    ("قياسي", 5.5),
    ("قياسية", 5.5),
    ("إيجابي", 6.5),
    ("إيجابية", 6.5),
    ("نجاح", 6.0),
    ("تفوق", 6.0),
    # Nouns — these are subjects, not direction indicators (lower weight)
    ("أرباح", 3.0),
    ("ارباح", 3.0),
    ("صافي الربح", 3.0),
    ("صافي ربح", 3.0),
    ("توزيعات", 4.0),
    ("توزيع أرباح", 4.5),
    # Mild positive — deals, partnerships
    ("استثمار", 3.0),
    ("استحواذ", 3.5),
    ("شراكة", 3.0),
    ("اتفاقية", 2.5),
    ("فوز", 5.0),
]

_NEGATIVE_KEYWORDS: list[tuple[str, float]] = [
    # Directional verbs / adjectives — these carry sentiment
    ("تراجع", 6.0),
    ("يتراجع", 6.0),
    ("تتراجع", 6.0),
    ("انخفاض", 6.0),
    ("انخفض", 6.0),
    ("ينخفض", 6.0),
    ("تنخفض", 6.0),
    ("هبوط", 6.0),
    ("يهبط", 6.0),
    ("يفقد", 5.5),
    ("فقد", 5.0),
    ("ضعف", 5.0),
    # Strong sentiment words
    ("خسائر", 7.0),
    ("خسارة", 7.0),
    ("انهيار", 7.5),
    ("فادحة", 7.0),
    ("سلبي", 6.5),
    ("سلبية", 6.5),
    ("تدهور", 6.5),
    ("أزمة", 6.5),
    ("ركود", 6.5),
    # Warnings / regulatory
    ("تحذير", 5.5),
    ("يحذر", 5.5),
    ("غرامة", 5.5),
    ("مخالفة", 5.0),
    ("إيقاف", 5.0),
    ("تعليق", 3.5),
    ("مخاطر", 4.5),
    ("تضخم", 4.5),
    ("ديون", 5.0),
]

# Use simple substring matching (not word boundaries) because Arabic morphology
# adds suffixes/prefixes that break word-boundary patterns (e.g. أرباحا, أرباحها).
_POS_PATTERNS = [(kw, w) for kw, w in _POSITIVE_KEYWORDS]
_NEG_PATTERNS = [(kw, w) for kw, w in _NEGATIVE_KEYWORDS]


def _compute_keyword_boost(text: str) -> tuple[float, float]:
    """Return (positive_boost, negative_boost) for a text based on financial keywords.

    Uses a simple negation rule: if both positive and negative keywords are
    found, the sentiment with the higher total boost wins and the other side
    is zeroed out.  This handles headlines like "انخفاض صافي ربح أرامكو"
    (Aramco net profit declined) where the negative context should dominate.
    """
    pos_boost = 0.0
    neg_boost = 0.0
    for keyword, weight in _POS_PATTERNS:
        if keyword in text:
            pos_boost += weight
    for keyword, weight in _NEG_PATTERNS:
        if keyword in text:
            neg_boost += weight

    # Conflict resolution: when both sides fire, only keep the stronger one
    if pos_boost > 0 and neg_boost > 0:
        if neg_boost >= pos_boost:
            pos_boost = 0.0
        else:
            neg_boost = 0.0

    return pos_boost, neg_boost


class SentimentModelManager:
    """Singleton model manager for Arabic sentiment analysis.

    Loads Ammar-alhaj-ali/arabic-MARBERT-sentiment as ONNX for fast CPU inference.
    Model is downloaded from HuggingFace on first run, converted to ONNX,
    and cached locally for subsequent startups.
    """

    _instance = None
    _model = None
    _tokenizer = None
    _loaded: bool = False

    MODEL_ID = "Ammar-alhaj-ali/arabic-MARBERT-sentiment"
    ONNX_PATH = _BACKEND_DIR / "models" / "arabic-marbert-sentiment-onnx"

    # Label mapping — verified from model config on load
    LABELS: dict[int, str] = {0: "neutral", 1: "negative", 2: "positive"}

    @classmethod
    def get_instance(cls) -> "SentimentModelManager":
        """Get or create the singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def load(self) -> None:
        """Load model -- called once at startup.

        Tries cached ONNX first, falls back to download + convert.
        Verifies label mapping from model config.
        """
        if self._loaded:
            logger.info("Model already loaded, skipping")
            return

        logger.info("Loading sentiment model: %s", self.MODEL_ID)

        if self.ONNX_PATH.exists() and (self.ONNX_PATH / "model.onnx").exists():
            logger.info("Loading cached ONNX model from %s", self.ONNX_PATH)
            self._load_onnx()
        else:
            logger.info("ONNX cache not found, downloading and converting...")
            self._load_and_convert()

        # Verify / update label mapping from model config
        self._verify_labels()

        self._loaded = True
        logger.info("Sentiment model loaded successfully. Labels: %s", self.LABELS)

    @staticmethod
    def _import_ort_model():
        """Import ORTModelForSequenceClassification with fallback path."""
        try:
            from optimum.onnxruntime import ORTModelForSequenceClassification
            return ORTModelForSequenceClassification
        except ImportError:
            # Fallback: direct import if package __init__ is broken
            from optimum.onnxruntime.modeling_ort import ORTModelForSequenceClassification
            return ORTModelForSequenceClassification

    def _load_onnx(self) -> None:
        """Load pre-converted ONNX model from cache."""
        ORTModelForSequenceClassification = self._import_ort_model()
        from transformers import AutoTokenizer

        self._model = ORTModelForSequenceClassification.from_pretrained(
            str(self.ONNX_PATH)
        )
        self._tokenizer = AutoTokenizer.from_pretrained(str(self.ONNX_PATH))

    def _load_and_convert(self) -> None:
        """Download PyTorch model from HuggingFace, convert to ONNX, and cache."""
        ORTModelForSequenceClassification = self._import_ort_model()
        from transformers import AutoTokenizer

        # Create models directory if needed
        self.ONNX_PATH.parent.mkdir(parents=True, exist_ok=True)

        # Download and export to ONNX in one step
        self._model = ORTModelForSequenceClassification.from_pretrained(
            self.MODEL_ID, export=True
        )
        self._tokenizer = AutoTokenizer.from_pretrained(self.MODEL_ID)

        # Cache ONNX model for next startup
        self._model.save_pretrained(str(self.ONNX_PATH))
        self._tokenizer.save_pretrained(str(self.ONNX_PATH))
        logger.info("ONNX model cached to %s", self.ONNX_PATH)

    def _verify_labels(self) -> None:
        """Check model config for id2label mapping and update LABELS if needed."""
        try:
            config = self._model.config
            if hasattr(config, "id2label") and config.id2label:
                # id2label is typically {0: "positive", 1: "negative", 2: "neutral"}
                # but may vary -- use actual config
                self.LABELS = {
                    int(k): v.lower() for k, v in config.id2label.items()
                }
                logger.info("Label mapping from model config: %s", self.LABELS)
        except Exception as e:
            logger.warning(
                "Could not read id2label from model config, using defaults: %s", e
            )

    def predict(self, texts: list[str]) -> list[dict]:
        """Run sentiment inference on a batch of texts with financial keyword boosting.

        The base MARBERT model classifies most financial news as neutral because
        news headlines are factual. We boost the logits with financial keyword
        signals before re-computing softmax so that headlines about profits get
        positive sentiment and headlines about losses get negative sentiment.

        Args:
            texts: List of Arabic text strings to classify.

        Returns:
            List of dicts with 'sentiment' (str) and 'confidence' (float).
        """
        if not self._loaded or self._model is None or self._tokenizer is None:
            raise RuntimeError("Sentiment model not loaded. Call load() first.")

        if not texts:
            return []

        # Tokenize with padding and truncation
        inputs = self._tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="np",
        )

        # Run inference
        outputs = self._model(**inputs)
        logits = outputs.logits.copy()  # copy so we can modify

        # Apply financial keyword boosting to logits
        # Label indices: 0=neutral, 1=negative, 2=positive
        neg_idx = None
        pos_idx = None
        for idx, label in self.LABELS.items():
            if label == "negative":
                neg_idx = idx
            elif label == "positive":
                pos_idx = idx

        if neg_idx is not None and pos_idx is not None:
            for i, text in enumerate(texts):
                pos_boost, neg_boost = _compute_keyword_boost(text)
                if pos_boost > 0:
                    logits[i][pos_idx] += pos_boost
                if neg_boost > 0:
                    logits[i][neg_idx] += neg_boost

        # Softmax using numpy (ONNX Runtime returns numpy arrays)
        shifted = logits - np.max(logits, axis=-1, keepdims=True)
        exp_logits = np.exp(shifted)
        probs = exp_logits / exp_logits.sum(axis=-1, keepdims=True)

        predictions = probs.argmax(axis=-1)

        return [
            {
                "sentiment": self.LABELS.get(int(pred), "neutral"),
                "confidence": float(probs[i][pred]),
            }
            for i, pred in enumerate(predictions)
        ]

    @property
    def is_loaded(self) -> bool:
        """Check if the model is loaded and ready for inference."""
        return self._loaded

    @property
    def model_version(self) -> str:
        """Return model version string for storage."""
        return "marbert-v2-onnx"
