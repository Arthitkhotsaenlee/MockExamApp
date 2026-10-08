#!/usr/bin/env python3

import argparse
import csv
import json
from pathlib import Path


def convert_csv_to_json(input_path: Path, output_path: Path) -> int:
    with input_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        rows = list(reader)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as json_file:
        json.dump(rows, json_file, ensure_ascii=False, indent=2)

    return len(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert question.csv to question.json")
    parser.add_argument("--input", type=Path, default=Path("question.csv"))
    parser.add_argument("--output", type=Path, default=Path("question.json"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    count = convert_csv_to_json(args.input, args.output)
    print(f"Wrote {count} records to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
