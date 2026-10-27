"""Compatibility entry point for the InkDice logo generator."""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name('build-logo.py')), run_name='__main__')
