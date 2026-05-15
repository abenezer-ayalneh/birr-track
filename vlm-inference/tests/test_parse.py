"""Unit tests for JSON parsing and key mapping (no Ollama required)."""

import unittest

from app.mapper import map_raw_to_response
from app.parse import parse_model_output


class TestParse(unittest.TestCase):
    def test_api_keys(self) -> None:
        raw = parse_model_output(
            '{"bankName":"CBE","amount":25000,"transactionId":"FT1",'
            '"timestamp":"2026-04-04T00:00:00.000Z","currency":"ETB","confidence":0.9}'
        )
        self.assertEqual(raw.bankName, "CBE")
        self.assertEqual(raw.amount, 25000.0)
        self.assertEqual(raw.transactionId, "FT1")

    def test_training_keys_mapped(self) -> None:
        raw = parse_model_output(
            '{"bank":"Commercial Bank of Ethiopia","amount":"25,000.00",'
            '"currency":"ETB","date":"2026-04-04T00:00:00.000Z","txn_id":"FT26094X0XVY"}'
        )
        self.assertEqual(raw.bankName, "Commercial Bank of Ethiopia")
        self.assertEqual(raw.amount, 25000.0)
        self.assertEqual(raw.transactionId, "FT26094X0XVY")
        self.assertEqual(raw.timestamp, "2026-04-04T00:00:00.000Z")

    def test_markdown_fence_stripped(self) -> None:
        raw = parse_model_output(
            'Here is the result:\n```json\n{"bankName":"X","amount":1,'
            '"transactionId":"T","timestamp":"2026-01-01T00:00:00.000Z",'
            '"currency":"ETB","confidence":0.5}\n```'
        )
        self.assertEqual(raw.bankName, "X")

    def test_confidence_clamped(self) -> None:
        result = map_raw_to_response({"confidence": 1.5, "amount": 1})
        self.assertEqual(result.confidence, 1.0)


if __name__ == "__main__":
    unittest.main()
