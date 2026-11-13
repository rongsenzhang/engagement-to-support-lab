"""Rebuild the v0.2 overlay from the unchanged v0.1 public artifacts."""
import json

from src.reference import build_reference


if __name__ == "__main__":
    data = build_reference()
    print(json.dumps({"version": data["meta"]["version"],
                      "protocol_commit": data["meta"]["protocol_commit"],
                      "comparison": data["comparison"]}, indent=2, ensure_ascii=False))
