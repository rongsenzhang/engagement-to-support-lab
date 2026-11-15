"""Generate the committed v0.3 module-robustness experiment."""
import argparse
from pathlib import Path
from src.robustness import ROOT, build_robustness


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-dir', type=Path, default=ROOT / 'data/raw')
    args = parser.parse_args()
    build_robustness(args.raw_dir)


if __name__ == '__main__':
    main()
